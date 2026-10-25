//! JSON adapters between the TypeScript wrapper and the Rust core.
//!
//! The align hot path does not use JSON for the code: the ABI passes the code
//! as raw UTF-8 bytes and returns a four byte change counter followed by the
//! UTF-8 result. JSON is only used for the small option payloads and for the
//! introspection APIs (`scanSource`, `findSymbolPositions`,
//! `findDeclarationCells`, `allLanguages`).

use serde_json::{Map, Value, json};

use crate::line::Line;
use crate::types::{
    AlignOptions, AlignmentScope, CellKind, CodeRegion, DeclarationAnchor, DeclarationCell,
    DeclarationStyle, EscapeMode, LanguageProfile, LineComment, ScanResult, StringDelimiter,
};

/// The options of one finder call, with regions and comment converted to
/// character indices.
pub struct ParsedFindOptions {
    pub regions: Vec<CodeRegion>,
    pub symbols: Vec<String>,
    pub operators: Vec<String>,
    pub comment: Option<LineComment>,
}

/// The options of one declaration call, with regions converted to character indices.
pub struct ParsedDeclarationOptions {
    pub regions: Vec<CodeRegion>,
    pub style: DeclarationStyle,
}

/// Reads a string array, ignoring entries that are not strings.
fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

/// Reads a non-negative integer.
fn usize_value(value: Option<&Value>) -> Option<usize> {
    value.and_then(Value::as_u64).map(|number| number as usize)
}

/// Reads a boolean.
fn bool_value(value: Option<&Value>) -> Option<bool> {
    value.and_then(Value::as_bool)
}

/// Parses one code region object.
fn region(value: &Value) -> Option<CodeRegion> {
    let object = value.as_object()?;
    let start = usize_value(object.get("start"))?;
    let end = usize_value(object.get("end"))?;

    Some(CodeRegion { start, end })
}

/// Parses a region array.
fn regions(value: Option<&Value>) -> Vec<CodeRegion> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(region).collect())
        .unwrap_or_default()
}

/// Converts a column range to the character indices of `line`.
fn region_at_columns(line: &Line, region: CodeRegion) -> CodeRegion {
    CodeRegion {
        start: line.char_index_at_column(region.start),
        end: line.char_index_at_column(region.end),
    }
}

/// Maps a string to an alignment scope.
fn scope(value: Option<&Value>) -> Option<AlignmentScope> {
    match value.and_then(Value::as_str) {
        Some("indent") => Some(AlignmentScope::Indent),
        Some("file") => Some(AlignmentScope::File),
        Some("block") => Some(AlignmentScope::Block),
        _ => None,
    }
}

/// Maps a string to a declaration anchor.
fn anchor(value: Option<&Value>) -> Option<DeclarationAnchor> {
    match value.and_then(Value::as_str) {
        Some("end") => Some(DeclarationAnchor::End),
        Some("start") => Some(DeclarationAnchor::Start),
        _ => None,
    }
}

/// Maps a string to a declaration style.
fn declaration_style(value: Option<&Value>) -> DeclarationStyle {
    match value.and_then(Value::as_str) {
        Some("prefix") => DeclarationStyle::Prefix,
        Some("type-first") => DeclarationStyle::TypeFirst,
        _ => DeclarationStyle::None,
    }
}

/// Parses the align options payload.
pub fn parse_align_options(text: &str) -> AlignOptions {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return AlignOptions::default();
    };

    let Some(object) = value.as_object() else {
        return AlignOptions::default();
    };

    let groups = object
        .get("groups")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_array)
                .map(|group| {
                    group
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .collect()
        })
        .unwrap_or_default();

    let range = object
        .get("range")
        .and_then(Value::as_object)
        .and_then(|range| {
            let start = usize_value(range.get("start"))?;
            let end = usize_value(range.get("end"))?;

            Some(crate::types::LineRange { start, end })
        });

    AlignOptions {
        symbols: object
            .get("symbols")
            .and_then(Value::as_array)
            .map(|_| string_array(object.get("symbols"))),
        groups,
        language: object
            .get("language")
            .and_then(Value::as_str)
            .map(str::to_owned),
        scope: scope(object.get("scope")),
        range,
        declarations: bool_value(object.get("declarations")),
        declaration_anchor: anchor(object.get("declarationAnchor")),
        max_declaration_pad: object.get("maxDeclarationPad").and_then(Value::as_f64),
    }
}

/// Reads one string delimiter object.
fn string_delimiter(value: &Value) -> Option<StringDelimiter> {
    let object = value.as_object()?;
    let open = object.get("open")?.as_str()?.to_owned();
    let close = object.get("close")?.as_str()?.to_owned();
    let escape = match object.get("escape").and_then(Value::as_str) {
        Some("doubled") => EscapeMode::Doubled,
        Some("none") => EscapeMode::None,
        _ => EscapeMode::Backslash,
    };
    let multiline = object
        .get("multiline")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    Some(StringDelimiter {
        open,
        close,
        escape,
        multiline,
    })
}

/// Reads a block comment pair.
fn block_comment(value: &Value) -> Option<(String, String)> {
    let pair = value.as_array()?;

    if pair.len() != 2 {
        return None;
    }

    Some((pair[0].as_str()?.to_owned(), pair[1].as_str()?.to_owned()))
}

/// Parses a custom language profile.
pub fn parse_profile(text: &str) -> LanguageProfile {
    let fallback = crate::language::generic();
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return fallback;
    };
    let Some(object) = value.as_object() else {
        return fallback;
    };

    let strings = object
        .get("strings")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(string_delimiter).collect())
        .unwrap_or_default();

    let block_comments = object
        .get("blockComments")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(block_comment).collect())
        .unwrap_or_default();

    LanguageProfile {
        id: object
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("generic")
            .to_owned(),
        name: object
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Generic")
            .to_owned(),
        extensions: string_array(object.get("extensions")),
        line_comments: string_array(object.get("lineComments")),
        block_comments,
        strings,
        operators: string_array(object.get("operators")),
        default_symbols: string_array(object.get("defaultSymbols")),
        declarations: declaration_style(object.get("declarations")),
    }
}

/// Parses the finder payload.
pub fn parse_find_options(text: &str, line: &Line) -> ParsedFindOptions {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return ParsedFindOptions {
            regions: Vec::new(),
            symbols: Vec::new(),
            operators: Vec::new(),
            comment: None,
        };
    };
    let Some(object) = value.as_object() else {
        return ParsedFindOptions {
            regions: Vec::new(),
            symbols: Vec::new(),
            operators: Vec::new(),
            comment: None,
        };
    };

    let comment = object
        .get("comment")
        .and_then(Value::as_object)
        .and_then(|comment| {
            let column = usize_value(comment.get("column"))?;
            let marker = comment.get("marker")?.as_str()?.to_owned();

            Some(LineComment {
                column: line.char_index_at_column(column),
                marker,
            })
        });

    ParsedFindOptions {
        regions: regions(object.get("regions"))
            .into_iter()
            .map(|region| region_at_columns(line, region))
            .collect(),
        symbols: string_array(object.get("symbols")),
        operators: string_array(object.get("operators")),
        comment,
    }
}

/// Parses the declaration payload.
pub fn parse_declaration_options(text: &str, line: &Line) -> ParsedDeclarationOptions {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return ParsedDeclarationOptions {
            regions: Vec::new(),
            style: DeclarationStyle::None,
        };
    };
    let Some(object) = value.as_object() else {
        return ParsedDeclarationOptions {
            regions: Vec::new(),
            style: DeclarationStyle::None,
        };
    };

    ParsedDeclarationOptions {
        regions: regions(object.get("regions"))
            .into_iter()
            .map(|region| region_at_columns(line, region))
            .collect(),
        style: declaration_style(object.get("style")),
    }
}

/// Renders one declaration cell as JSON.
fn cell_value(cell: DeclarationCell) -> Value {
    json!({ "kind": cell.kind.as_str(), "start": cell.start, "end": cell.end })
}

/// Serializes a scan result, converting character indices to UTF-16 columns.
pub fn scan_result_json(result: &ScanResult, lines: &[Line]) -> String {
    let regions: Vec<Value> = result
        .code_regions
        .iter()
        .enumerate()
        .map(|(index, regions)| {
            let line = lines.get(index);

            Value::Array(
                regions
                    .iter()
                    .map(|region| {
                        let start = line.map_or(region.start, |line| line.column(region.start));
                        let end = line.map_or(region.end, |line| line.column(region.end));

                        json!({ "start": start, "end": end })
                    })
                    .collect(),
            )
        })
        .collect();

    let comments: Vec<Value> = result
        .line_comments
        .iter()
        .enumerate()
        .map(|(index, comment)| match comment {
            Some(comment) => {
                let column = lines
                    .get(index)
                    .map_or(comment.column, |line| line.column(comment.column));

                json!({ "column": column, "marker": &comment.marker })
            }
            None => Value::Null,
        })
        .collect();

    json!({ "codeRegions": regions, "lineComments": comments }).to_string()
}

/// Serializes finder positions, converting character indices to UTF-16 columns.
pub fn positions_json(positions: &[(String, Vec<usize>)], line: &Line) -> String {
    let entries: Vec<Value> = positions
        .iter()
        .map(|(symbol, columns)| {
            let columns: Vec<Value> = columns
                .iter()
                .map(|column| Value::from(line.column(*column)))
                .collect();

            Value::Array(vec![Value::String(symbol.clone()), Value::Array(columns)])
        })
        .collect();

    Value::Array(entries).to_string()
}

/// Serializes declaration cells, converting character indices to UTF-16 columns.
pub fn cells_json(cells: Option<&[DeclarationCell]>, line: &Line) -> String {
    match cells {
        None => "null".to_owned(),
        Some(cells) => Value::Array(
            cells
                .iter()
                .map(|cell| {
                    cell_value(DeclarationCell {
                        start: line.column(cell.start),
                        end: line.column(cell.end),
                        ..*cell
                    })
                })
                .collect(),
        )
        .to_string(),
    }
}

/// Serializes one language profile.
fn profile_value(profile: &LanguageProfile) -> Value {
    let strings: Vec<Value> = profile
        .strings
        .iter()
        .map(|delimiter| {
            let escape = match delimiter.escape {
                EscapeMode::Backslash => "backslash",
                EscapeMode::Doubled => "doubled",
                EscapeMode::None => "none",
            };

            json!({ "open": &delimiter.open, "close": &delimiter.close, "escape": escape, "multiline": delimiter.multiline })
        })
        .collect();

    let blocks: Vec<Value> = profile
        .block_comments
        .iter()
        .map(|(open, close)| json!([open, close]))
        .collect();
    let declarations = match profile.declarations {
        DeclarationStyle::Prefix => "prefix",
        DeclarationStyle::TypeFirst => "type-first",
        DeclarationStyle::None => "none",
    };

    let mut object = Map::new();
    object.insert("id".to_owned(), Value::String(profile.id.clone()));
    object.insert("name".to_owned(), Value::String(profile.name.clone()));
    object.insert("extensions".to_owned(), json!(&profile.extensions));
    object.insert("lineComments".to_owned(), json!(&profile.line_comments));
    object.insert("blockComments".to_owned(), Value::Array(blocks));
    object.insert("strings".to_owned(), Value::Array(strings));
    object.insert("operators".to_owned(), json!(&profile.operators));
    object.insert("defaultSymbols".to_owned(), json!(&profile.default_symbols));
    object.insert(
        "declarations".to_owned(),
        Value::String(declarations.to_owned()),
    );

    Value::Object(object)
}

/// Serializes every language profile.
pub fn profiles_json(profiles: &[LanguageProfile]) -> String {
    Value::Array(profiles.iter().map(profile_value).collect()).to_string()
}

/// The name of a cell kind, used by the aligner only for signatures.
pub fn _cell_kind_name(kind: CellKind) -> &'static str {
    kind.as_str()
}
