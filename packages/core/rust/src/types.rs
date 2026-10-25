//! Shared data types of the symbol-align core.
//!
//! The core works on **character indices** internally. Every public boundary
//! converts those indices to UTF-16 columns, which is the unit JavaScript
//! strings use. Keeping the conversion at the edge makes the scanner, finder,
//! declaration locator and aligner independent of the platform string model.

/// How escape sequences are handled inside a string literal.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscapeMode {
    /// A backslash escapes the next character.
    Backslash,
    /// A doubled quote is an escaped quote.
    Doubled,
    /// Nothing escapes the closing delimiter.
    None,
}

/// A string literal delimiter of a language.
#[derive(Clone, Debug)]
pub struct StringDelimiter {
    pub open: String,
    pub close: String,
    pub escape: EscapeMode,
    pub multiline: bool,
}

/// How declarations of a language are laid out.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DeclarationStyle {
    Prefix,
    TypeFirst,
    None,
}

/// Everything the scanner needs to know about a language.
#[derive(Clone, Debug)]
pub struct LanguageProfile {
    pub id: String,
    pub name: String,
    pub extensions: Vec<String>,
    pub line_comments: Vec<String>,
    pub block_comments: Vec<(String, String)>,
    pub strings: Vec<StringDelimiter>,
    pub operators: Vec<String>,
    pub default_symbols: Vec<String>,
    pub declarations: DeclarationStyle,
}

/// A contiguous region of a line that contains real code.
///
/// Both fields are character indices, not UTF-16 columns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CodeRegion {
    pub start: usize,
    pub end: usize,
}

/// The trailing line comment of a line.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LineComment {
    /// Character index of the comment marker.
    pub column: usize,
    pub marker: String,
}

/// Result of scanning a source text.
#[derive(Clone, Debug, Default)]
pub struct ScanResult {
    /// Code regions per line, indexed by line number.
    pub code_regions: Vec<Vec<CodeRegion>>,
    /// Trailing line comment per line, indexed by line number.
    pub line_comments: Vec<Option<LineComment>>,
}

/// How lines are grouped before they are aligned.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AlignmentScope {
    Block,
    Indent,
    File,
}

/// Which edge of a declaration cell is aligned.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DeclarationAnchor {
    Start,
    End,
}

/// A range of lines of the input.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LineRange {
    pub start: usize,
    pub end: usize,
}

/// Options accepted by [`crate::aligner::align`].
#[derive(Clone, Debug, Default)]
pub struct AlignOptions {
    pub symbols: Option<Vec<String>>,
    pub groups: Vec<Vec<String>>,
    pub language: Option<String>,
    pub scope: Option<AlignmentScope>,
    pub range: Option<LineRange>,
    pub declarations: Option<bool>,
    pub declaration_anchor: Option<DeclarationAnchor>,
    pub max_declaration_pad: Option<f64>,
}

/// The outcome of an alignment run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AlignResult {
    pub code: String,
    pub changes: usize,
}

/// The kind of a declaration cell.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CellKind {
    Modifiers,
    Type,
    Name,
}

impl CellKind {
    /// The lowercase name used by the JSON representation and the public API.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Modifiers => "modifiers",
            Self::Type => "type",
            Self::Name => "name",
        }
    }
}

/// One visual segment of a declaration, in character indices.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DeclarationCell {
    pub kind: CellKind,
    pub start: usize,
    pub end: usize,
}

impl DeclarationCell {
    /// The height of the cell in characters.
    pub fn len(self) -> usize {
        self.end.saturating_sub(self.start)
    }

    /// Whether the cell covers no characters.
    pub fn is_empty(self) -> bool {
        self.len() == 0
    }
}
