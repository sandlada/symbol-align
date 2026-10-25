//! Declaration locator of the core.
//!
//! The locator turns one line of code into the visual cells of a declaration:
//!
//! ```text
//! private const string Product = "value";
//! └ modifiers ─┘ └type─┘ └name─┘
//!
//! (int, string) pair;
//! └────type───┘ └name┘
//! ```
//!
//! It never parses a language grammar. It only tokenises the first code region
//! of the line, tracks bracket and generic nesting and rejects anything that is
//! not a plain declaration. A line with two possible readings — a member access,
//! a statement, a construct with a missing type — is reported as `None`; the
//! aligner then simply leaves it alone.
//!
//! The heuristics are deliberately conservative:
//!
//! - a leading `(...)` group is a type only when it is balanced and closes
//!   before the name, so a statement that happens to start with parentheses is
//!   not mistaken for a tuple type;
//! - `<` opens a generic argument list only when a matching `>` exists in the
//!   region, so `a<b` and `a < b` stay comparisons;
//! - a type span that mixes punctuation with `*`, `&` or `?` has to be
//!   credible (a builtin word, an uppercase word, a modifier run or a
//!   qualifier) before the line is accepted, so `a * b;` and `a && b;` stay
//!   statements.
//!
//! All positions in this module are character indices.

use crate::line::{Line, is_js_whitespace};
use crate::types::{CellKind, CodeRegion, DeclarationCell, DeclarationStyle};
use crate::vocabulary::{
    is_builtin_type, is_declaration_keyword, is_modifier, is_non_name, is_statement_keyword,
};

/// Characters that turn a neighbouring `=` into a longer operator.
const OPERATOR_CHARACTERS: &str = "=!<>+-*/%&|^?";

/// How many tokens a generic bracket search may look ahead or behind.
const MAX_GENERIC_SCAN: usize = 128;

/// The kind of a [`Token`].
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum TokenKind {
    /// A word built from word characters.
    Word,
    /// A single punctuation character.
    Punct,
}

/// A word or a single punctuation character of the code region.
#[derive(Clone, Debug)]
struct Token {
    /// Whether the token is a word or a punctuation character.
    kind: TokenKind,
    /// Inclusive character index of the first character.
    start: usize,
    /// Exclusive character index behind the last character.
    end: usize,
    /// The token text — a word or one punctuation character.
    text: String,
}

/// The nesting depth before a token.
#[derive(Clone, Copy, Debug, Default)]
struct Depth {
    round: usize,
    square: usize,
    curly: usize,
    angle: usize,
}

/// The generic brackets of a line: the `<` that open a list and the `>` that close one.
struct GenericBrackets {
    opens: Vec<bool>,
    closes: Vec<bool>,
}

impl GenericBrackets {
    /// Whether the token at `index` is a generic `<`.
    fn opens_at(&self, index: usize) -> bool {
        self.opens.get(index).copied().unwrap_or(false)
    }

    /// Whether the token at `index` is a generic `>`.
    fn closes_at(&self, index: usize) -> bool {
        self.closes.get(index).copied().unwrap_or(false)
    }
}

/// The punctuation shape of a candidate type span.
struct TypeShape {
    /// Index of the first word token of the span, or `None` when it holds no word at all.
    first_word: Option<usize>,
    /// Whether the span contains a pointer, reference or nullable marker.
    has_marker: bool,
    /// Whether the span contains a qualifier or a bracketed/generic group.
    has_qualifier: bool,
}

/// Options accepted by [`find_declaration_cells`].
pub struct DeclarationOptions<'a> {
    pub regions: &'a [CodeRegion],
    pub style: DeclarationStyle,
}

/// Whether `character` can build a word token.
fn is_word_character(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || character == '_'
        || character == '$'
        || (character > '~' && !is_js_whitespace(character))
}

/// Whether `character` is whitespace.
fn is_blank_character(character: char) -> bool {
    is_js_whitespace(character)
}

/// Whether `character` turns a neighbouring `=` into a longer operator.
fn is_operator_character(character: char) -> bool {
    OPERATOR_CHARACTERS.contains(character)
}

/// Whether `text` is punctuation that ends the declarator at nesting depth zero.
///
/// `:` is deliberately absent: `std::string name;` and
/// `std::tuple<int, int> t;` carry a qualifier in front of the name, and a C++
/// bitfield is not worth losing every qualified type over.
fn is_tail_punctuation(text: &str) -> bool {
    matches!(text, ";" | "," | "(" | "{")
}

/// Whether `text` is punctuation that may appear inside a declaration type.
fn is_type_punctuation_text(text: &str) -> bool {
    matches!(text, "(" | ")" | "[" | "]" | "*" | "&" | "?" | "," | ".")
}

/// Whether the first character of `word` is uppercase.
fn uppercase_start(word: &str) -> bool {
    word.chars().next().is_some_and(char::is_uppercase)
}

/// Splits the range `[from, to)` of the line into word and punctuation tokens.
fn tokenize(line: &Line, from: usize, to: usize) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut index = from;

    while index < to {
        let Some(character) = line.char_at(index) else {
            break;
        };

        if is_blank_character(character) {
            index += 1;
            continue;
        }

        let start = index;

        if is_word_character(character) {
            while index < to {
                match line.char_at(index) {
                    Some(next) if is_word_character(next) => index += 1,
                    _ => break,
                }
            }

            tokens.push(Token {
                kind: TokenKind::Word,
                start,
                end: index,
                text: line.text(start, index),
            });
            continue;
        }

        index += 1;
        tokens.push(Token {
            kind: TokenKind::Punct,
            start,
            end: index,
            text: line.text(start, index),
        });
    }

    tokens
}

/// Whether `<` at `index` can open a generic argument list.
fn opens_generic(tokens: &[Token], index: usize) -> bool {
    let Some(token) = tokens.get(index) else {
        return false;
    };

    if token.kind != TokenKind::Punct || token.text.as_str() != "<" {
        return false;
    }

    let Some(previous) = index
        .checked_sub(1)
        .and_then(|position| tokens.get(position))
    else {
        return false;
    };

    if previous.end != token.start {
        return false;
    }

    previous.kind == TokenKind::Word || previous.text.as_str() == ">"
}

/// Whether a generic list opened at `open_index` is closed later in the region.
fn has_matching_close(tokens: &[Token], open_index: usize) -> bool {
    let mut balance = 1_usize;
    let limit = tokens
        .len()
        .min(open_index.saturating_add(MAX_GENERIC_SCAN));

    for index in open_index.saturating_add(1)..limit {
        let Some(token) = tokens.get(index) else {
            break;
        };

        if token.text.as_str() == ">" {
            balance = balance.saturating_sub(1);

            if balance == 0 {
                return true;
            }

            continue;
        }

        if opens_generic(tokens, index) {
            balance += 1;
        }
    }

    false
}

/// Index of the `<` that matches the `>` at `close_index`, or `None`.
fn matching_open(tokens: &[Token], close_index: usize) -> Option<usize> {
    let mut balance = 1_usize;
    let limit = close_index.saturating_sub(MAX_GENERIC_SCAN);
    let mut index = close_index.checked_sub(1)?;

    loop {
        let token = tokens.get(index)?;

        if token.text.as_str() == ">" {
            balance += 1;
        } else if opens_generic(tokens, index) {
            balance = balance.saturating_sub(1);

            if balance == 0 {
                return Some(index);
            }
        }

        if index == limit {
            break;
        }

        index -= 1;
    }

    None
}

/// Collects the generic brackets of a line.
///
/// A `<` only opens a generic list when a matching `>` exists in the region;
/// every other `<` is an operator, never a type bracket.
fn generic_brackets(tokens: &[Token]) -> GenericBrackets {
    let mut opens = vec![false; tokens.len()];
    let mut closes = vec![false; tokens.len()];

    for (index, token) in tokens.iter().enumerate() {
        if token.kind == TokenKind::Punct
            && token.text.as_str() == "<"
            && opens_generic(tokens, index)
            && has_matching_close(tokens, index)
        {
            opens[index] = true;
        }
    }

    for (index, token) in tokens.iter().enumerate() {
        if token.kind != TokenKind::Punct || token.text.as_str() != ">" {
            continue;
        }

        if matching_open(tokens, index)
            .is_some_and(|open| opens.get(open).copied().unwrap_or(false))
        {
            closes[index] = true;
        }
    }

    GenericBrackets { opens, closes }
}

/// Computes the nesting depth before every token.
fn depth_before(tokens: &[Token], brackets: &GenericBrackets) -> Vec<Depth> {
    let mut depths = Vec::with_capacity(tokens.len());
    let mut round = 0_usize;
    let mut square = 0_usize;
    let mut curly = 0_usize;
    let mut angle = 0_usize;

    for (index, token) in tokens.iter().enumerate() {
        depths.push(Depth {
            round,
            square,
            curly,
            angle,
        });

        if token.kind != TokenKind::Punct {
            continue;
        }

        match token.text.as_str() {
            "(" => round += 1,
            ")" => round = round.saturating_sub(1),
            "[" => square += 1,
            "]" => square = square.saturating_sub(1),
            "{" => curly += 1,
            "}" => curly = curly.saturating_sub(1),
            "<" => {
                if brackets.opens_at(index) {
                    angle += 1;
                }
            }
            ">" if brackets.closes_at(index) => {
                angle = angle.saturating_sub(1);
            }
            _ => {}
        }
    }

    depths
}

/// Whether the token at `index` sits at the outermost nesting level.
fn is_outermost(depths: &[Depth], index: usize) -> bool {
    depths.get(index).is_some_and(|depth| {
        depth.round == 0 && depth.square == 0 && depth.curly == 0 && depth.angle == 0
    })
}

/// Index of the `)` that closes a `(` at index 0, or `None` when it never closes.
fn leading_group_close(tokens: &[Token]) -> Option<usize> {
    let mut balance = 0_isize;

    for (index, token) in tokens.iter().enumerate() {
        if token.text.as_str() == "(" {
            balance += 1;
            continue;
        }

        if token.text.as_str() == ")" {
            balance -= 1;

            if balance == 0 {
                return Some(index);
            }
        }
    }

    None
}

/// Whether the `=` at `token` belongs to a longer operator inside the region.
fn is_operator_fragment(line: &Line, token: &Token, from: usize, to: usize) -> bool {
    let before = token
        .start
        .checked_sub(1)
        .filter(|index| *index >= from)
        .and_then(|index| line.char_at(index));
    let after = if token.end < to {
        line.char_at(token.end)
    } else {
        None
    };

    before.is_some_and(is_operator_character) || after.is_some_and(is_operator_character)
}

/// Index of the first declarator-terminating token at depth zero, or `None`.
fn find_tail(
    tokens: &[Token],
    depths: &[Depth],
    line: &Line,
    from: usize,
    to: usize,
    first: usize,
) -> Option<usize> {
    for index in first..tokens.len() {
        let Some(token) = tokens.get(index) else {
            break;
        };

        if token.kind != TokenKind::Punct || !is_outermost(depths, index) {
            continue;
        }

        if token.text.as_str() == "=" {
            let next = tokens.get(index + 1);

            if next.is_some_and(|next| next.text.as_str() == ">" && next.start == token.end) {
                return Some(index);
            }

            if !is_operator_fragment(line, token, from, to) {
                return Some(index);
            }

            continue;
        }

        if is_tail_punctuation(&token.text) {
            return Some(index);
        }
    }

    None
}

/// Index of the last word before `before` at depth zero, or `None`.
fn last_word_before(tokens: &[Token], depths: &[Depth], before: usize) -> Option<usize> {
    (0..before.min(tokens.len()))
        .rev()
        .find(|index| tokens[*index].kind == TokenKind::Word && is_outermost(depths, *index))
}

/// Index of the name word of a declaration, or `None` when it is ambiguous.
fn find_name_index(tokens: &[Token], depths: &[Depth], tail: usize) -> Option<usize> {
    // A tail directly behind `>` closes a generic list of the name itself
    // (`GetAsync<T>()`); the name is the word in front of that `<`.
    let Some(previous_index) = tail.checked_sub(1) else {
        return last_word_before(tokens, depths, tail);
    };

    if tokens
        .get(previous_index)
        .is_some_and(|token| token.text.as_str() == ">")
    {
        let open = matching_open(tokens, previous_index)?;

        return last_word_before(tokens, depths, open);
    }

    last_word_before(tokens, depths, tail)
}

/// Whether the tokens before the name mark a member access.
fn is_member_access(tokens: &[Token], name_index: usize) -> bool {
    let Some(previous) = name_index
        .checked_sub(1)
        .and_then(|index| tokens.get(index))
    else {
        return false;
    };

    if previous.kind != TokenKind::Punct {
        return false;
    }

    if previous.text.as_str() == "." {
        return true;
    }

    let Some(before_previous) = name_index
        .checked_sub(2)
        .and_then(|index| tokens.get(index))
    else {
        return false;
    };

    (previous.text.as_str() == ":" && before_previous.text.as_str() == ":")
        || (previous.text.as_str() == ">" && before_previous.text.as_str() == "-")
}

/// Index where the name cell starts, including a C/C++ pointer or reference.
///
/// A marker only belongs to the name when it touches it: `char *name` declares
/// a pointer, while `a * b` multiplies two values.
fn name_cell_index(tokens: &[Token], name_index: usize) -> usize {
    let mut cell = name_index;
    let mut index = name_index;

    while index > 0 {
        index -= 1;

        let Some(token) = tokens.get(index) else {
            break;
        };

        let Some(next) = tokens.get(index + 1) else {
            break;
        };

        if token.kind != TokenKind::Punct || next.start != token.end {
            break;
        }

        match token.text.as_str() {
            "*" | "^" | "?" => cell = index,
            "&" => {
                let doubled = index
                    .checked_sub(1)
                    .and_then(|position| tokens.get(position))
                    .is_some_and(|previous| {
                        previous.text.as_str() == "&" && previous.end == token.start
                    });

                if doubled {
                    cell = index - 1;
                    index -= 1;
                } else {
                    cell = index;
                }
            }
            _ => break,
        }
    }

    cell
}

/// Whether the `:` at `index` is half of a `::` qualifier.
fn is_qualifier_colon(tokens: &[Token], index: usize) -> bool {
    let Some(token) = tokens.get(index) else {
        return false;
    };

    let previous = index
        .checked_sub(1)
        .and_then(|position| tokens.get(position));
    let next = tokens.get(index + 1);

    previous.is_some_and(|candidate| candidate.text.as_str() == ":" && candidate.end == token.start)
        || next
            .is_some_and(|candidate| candidate.text.as_str() == ":" && candidate.start == token.end)
}

/// Whether the token at `index` is valid punctuation of a type span.
fn is_type_punctuation(tokens: &[Token], index: usize, brackets: &GenericBrackets) -> bool {
    let Some(token) = tokens.get(index) else {
        return false;
    };

    if token.kind == TokenKind::Word {
        return true;
    }

    match token.text.as_str() {
        ":" => is_qualifier_colon(tokens, index),
        "<" => brackets.opens_at(index),
        ">" => brackets.closes_at(index),
        text => is_type_punctuation_text(text),
    }
}

/// Validates the punctuation of a type span and records its shape.
///
/// A span that carries a marker (`*`, `&`, `?`) also has to be *credible*: a
/// builtin type word, an uppercase word, a modifier run or a qualifier in front
/// of the marker. Without that rule `a * b;` reads as a pointer declaration.
fn type_shape(
    tokens: &[Token],
    from: usize,
    to: usize,
    brackets: &GenericBrackets,
) -> Option<TypeShape> {
    if from > to {
        return None;
    }

    let mut first_word: Option<usize> = None;
    let mut has_marker = false;
    let mut has_qualifier = false;

    for index in from..=to {
        let token = tokens.get(index)?;

        if !is_type_punctuation(tokens, index, brackets) {
            return None;
        }

        if token.kind == TokenKind::Word {
            if first_word.is_none() {
                first_word = Some(index);
            }

            continue;
        }

        if matches!(token.text.as_str(), "*" | "&" | "?") {
            has_marker = true;
        }

        if token.text.as_str() == "("
            || token.text.as_str() == "["
            || token.text.as_str() == "<"
            || (token.text.as_str() == ":" && is_qualifier_colon(tokens, index))
        {
            has_qualifier = true;
        }
    }

    Some(TypeShape {
        first_word,
        has_marker,
        has_qualifier,
    })
}

/// Whether a type span with a marker still looks like a declaration type.
fn is_credible_type(shape: &TypeShape, has_modifiers: bool, tokens: &[Token]) -> bool {
    if !shape.has_marker {
        return true;
    }

    let first_word = shape.first_word.and_then(|index| tokens.get(index));

    if first_word.is_some_and(|token| is_builtin_type(&token.text) || uppercase_start(&token.text))
    {
        return true;
    }

    has_modifiers || shape.has_qualifier
}

/// Builds the cells of a prefix declaration (`public int value`).
fn prefix_cells(
    tokens: &[Token],
    name_index: usize,
    name_cell: usize,
    name_start: usize,
    brackets: &GenericBrackets,
) -> Option<Vec<DeclarationCell>> {
    let mut modifier_count = 0;

    while modifier_count < name_index {
        let Some(token) = tokens.get(modifier_count) else {
            break;
        };

        if token.kind != TokenKind::Word || !is_modifier(&token.text) {
            break;
        }

        modifier_count += 1;
    }

    let type_token = tokens.get(modifier_count)?;

    if type_token.start >= name_start || is_declaration_keyword(&type_token.text) {
        return None;
    }

    // A name cell at index zero means the type span would be empty (`to < from`
    // in the reference implementation).
    let type_end = name_cell.checked_sub(1)?;
    let shape = type_shape(tokens, modifier_count, type_end, brackets)?;

    if !is_credible_type(&shape, modifier_count > 0, tokens) {
        return None;
    }

    let name_end = tokens.get(name_index)?.end;
    let type_cell = DeclarationCell {
        kind: CellKind::Type,
        start: type_token.start,
        end: tokens.get(type_end)?.end,
    };
    let name_cell_shape = DeclarationCell {
        kind: CellKind::Name,
        start: name_start,
        end: name_end,
    };

    if modifier_count == 0 {
        return Some(vec![type_cell, name_cell_shape]);
    }

    let first = tokens.first()?;
    let last_modifier = tokens.get(modifier_count - 1)?;

    Some(vec![
        DeclarationCell {
            kind: CellKind::Modifiers,
            start: first.start,
            end: last_modifier.end,
        },
        type_cell,
        name_cell_shape,
    ])
}

/// Builds the cells of a type-first declaration (`uint256 public value`).
fn type_first_cells(
    tokens: &[Token],
    name_index: usize,
    name_cell: usize,
    name_start: usize,
    brackets: &GenericBrackets,
) -> Option<Vec<DeclarationCell>> {
    let mut modifier_start = name_cell;

    while modifier_start > 0 {
        let Some(token) = tokens.get(modifier_start - 1) else {
            break;
        };

        if token.kind != TokenKind::Word || !is_modifier(&token.text) {
            break;
        }

        modifier_start -= 1;
    }

    if modifier_start == 0 {
        return None;
    }

    let type_token = tokens.first()?;

    if type_token.start >= name_start {
        return None;
    }

    let type_end = if modifier_start == name_cell {
        name_cell.checked_sub(1)?
    } else {
        modifier_start - 1
    };

    let shape = type_shape(tokens, 0, type_end, brackets)?;

    if !is_credible_type(&shape, modifier_start != name_cell, tokens) {
        return None;
    }

    let name_end = tokens.get(name_index)?.end;
    let name_cell_shape = DeclarationCell {
        kind: CellKind::Name,
        start: name_start,
        end: name_end,
    };

    if modifier_start == name_cell {
        let type_last = tokens.get(name_cell.checked_sub(1)?)?;

        return Some(vec![
            DeclarationCell {
                kind: CellKind::Type,
                start: type_token.start,
                end: type_last.end,
            },
            name_cell_shape,
        ]);
    }

    let type_last = tokens.get(modifier_start - 1)?;
    let modifier_first = tokens.get(modifier_start)?;
    let modifier_last = tokens.get(name_cell.checked_sub(1)?)?;

    Some(vec![
        DeclarationCell {
            kind: CellKind::Type,
            start: type_token.start,
            end: type_last.end,
        },
        DeclarationCell {
            kind: CellKind::Modifiers,
            start: modifier_first.start,
            end: modifier_last.end,
        },
        name_cell_shape,
    ])
}

/// Locates the declaration cells of a line.
///
/// Returns the cells in visual order, or `None` when the line is not an
/// unambiguous declaration.
pub fn find_declaration_cells(
    line: &Line,
    options: &DeclarationOptions<'_>,
) -> Option<Vec<DeclarationCell>> {
    if options.style == DeclarationStyle::None {
        return None;
    }

    let region = options.regions.first()?;
    let indent = line.indent();

    // The scanner folds the leading whitespace into the first code region;
    // a region that starts behind the indentation means a string or a
    // comment comes first, which is never a declaration.
    if region.start > indent || region.end <= indent {
        return None;
    }

    let end = region.end.min(line.len());
    let tokens = tokenize(line, indent, end);
    let first = tokens.first()?;

    // A leading `(...)` group may start a tuple type (`(int, string) pair`);
    // anything else has to be a word.
    let opens_group = first.kind == TokenKind::Punct && first.text.as_str() == "(";

    if !opens_group && (first.kind != TokenKind::Word || is_statement_keyword(&first.text)) {
        return None;
    }

    if opens_group && leading_group_close(&tokens).is_none() {
        return None;
    }

    let brackets = generic_brackets(&tokens);
    let depths = depth_before(&tokens, &brackets);
    let tail = find_tail(
        &tokens,
        &depths,
        line,
        indent,
        end,
        if opens_group { 1 } else { 0 },
    )?;
    let name_index = find_name_index(&tokens, &depths, tail)?;

    if is_member_access(&tokens, name_index) {
        return None;
    }

    let name = &tokens.get(name_index)?.text;

    if is_non_name(name) || is_declaration_keyword(name) {
        return None;
    }

    let name_cell = name_cell_index(&tokens, name_index);
    let name_start = tokens.get(name_cell)?.start;

    match options.style {
        DeclarationStyle::Prefix => {
            prefix_cells(&tokens, name_index, name_cell, name_start, &brackets)
        }
        DeclarationStyle::TypeFirst => {
            type_first_cells(&tokens, name_index, name_cell, name_start, &brackets)
        }
        DeclarationStyle::None => None,
    }
}
