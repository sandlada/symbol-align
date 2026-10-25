//! The line model of the core.
//!
//! A [`Line`] stores its characters and the UTF-16 column of every character
//! boundary. JavaScript indexes strings by UTF-16 code unit, so an astral
//! character occupies two columns while a BMP character occupies one. The
//! scanner and the aligner work with character indices; the column table is
//! only used where a *visual* column matters (padding and the public API).

/// Whether `character` is whitespace in the JavaScript sense.
///
/// JavaScript `trim()` also treats the byte order mark (U+FEFF) as
/// whitespace, while Rust's `char::is_whitespace` does not.
pub fn is_js_whitespace(character: char) -> bool {
    character.is_whitespace() || character == '\u{FEFF}'
}

/// One line of source code together with its UTF-16 column table.
#[derive(Clone, Debug)]
pub struct Line {
    /// The characters of the line.
    pub chars: Vec<char>,
    /// `columns[index]` is the UTF-16 column of `chars[index]`; the last entry
    /// is the column behind the line.
    columns: Vec<usize>,
}

impl Line {
    /// Builds a line from a string slice.
    pub fn new(text: &str) -> Self {
        Self::from_chars(text.chars().collect())
    }

    /// Builds a line from an owned character vector.
    pub fn from_chars(chars: Vec<char>) -> Self {
        let mut columns = Vec::with_capacity(chars.len() + 1);
        let mut column = 0;

        for character in &chars {
            columns.push(column);
            column += character.len_utf16();
        }

        columns.push(column);
        Self { chars, columns }
    }

    /// Number of characters in the line.
    pub fn len(&self) -> usize {
        self.chars.len()
    }

    /// Whether the line has no characters.
    pub fn is_empty(&self) -> bool {
        self.chars.is_empty()
    }

    /// The character at `index`, when it exists.
    pub fn char_at(&self, index: usize) -> Option<char> {
        self.chars.get(index).copied()
    }

    /// The UTF-16 column of the character boundary at `index`.
    pub fn column(&self, index: usize) -> usize {
        self.columns
            .get(index)
            .copied()
            .unwrap_or_else(|| self.columns.last().copied().unwrap_or(0))
    }

    /// The character index of the first boundary whose column is at least `column`.
    ///
    /// Columns inside an astral character resolve to the start of that
    /// character, because no code boundary exists there.
    pub fn char_index_at_column(&self, column: usize) -> usize {
        let mut low = 0;
        let mut high = self.columns.len();

        while low < high {
            let middle = (low + high) / 2;

            if self.columns[middle] < column {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        low.min(self.chars.len())
    }

    /// Number of leading whitespace characters.
    pub fn indent(&self) -> usize {
        self.chars
            .iter()
            .take_while(|character| is_js_whitespace(**character))
            .count()
    }

    /// UTF-16 column of the first non-whitespace character.
    pub fn indent_column(&self) -> usize {
        self.column(self.indent())
    }

    /// Whether the line carries no visible content.
    pub fn is_blank(&self) -> bool {
        self.chars
            .iter()
            .all(|character| is_js_whitespace(*character))
    }

    /// Whether `text` starts at character index `index`.
    pub fn starts_with(&self, index: usize, text: &str) -> bool {
        for (cursor, expected) in (index..).zip(text.chars()) {
            if self.chars.get(cursor) != Some(&expected) {
                return false;
            }
        }

        true
    }

    /// The first character index at or behind `from` where `text` starts.
    pub fn find_from(&self, from: usize, text: &str) -> Option<usize> {
        if text.is_empty() {
            return Some(from.min(self.chars.len()));
        }

        let width = text.chars().count();
        let mut index = from;

        while index + width <= self.chars.len() {
            if self.starts_with(index, text) {
                return Some(index);
            }

            index += 1;
        }

        None
    }

    /// The text of the half-open character range `[from, to)`.
    pub fn text(&self, from: usize, to: usize) -> String {
        let end = to.min(self.chars.len());
        let start = from.min(end);

        self.chars[start..end].iter().collect()
    }

    /// The text behind `index`.
    pub fn text_from(&self, index: usize) -> String {
        self.text(index, self.chars.len())
    }

    /// The whole line as a plain string.
    pub fn to_plain_string(&self) -> String {
        self.chars.iter().collect()
    }

    /// Whether the line, trimmed with JavaScript whitespace rules, equals `text`.
    pub fn trimmed_is(&self, text: &str) -> bool {
        let start = self.indent();
        let end = self
            .chars
            .iter()
            .rposition(|character| !is_js_whitespace(*character))
            .map_or(start, |index| index + 1);

        self.text(start, end) == text
    }

    /// The line with `count` spaces inserted at character index `index`.
    pub fn insert_spaces(&self, index: usize, count: usize) -> Self {
        let at = index.min(self.chars.len());
        let mut chars = Vec::with_capacity(self.chars.len() + count);

        chars.extend_from_slice(&self.chars[..at]);
        chars.extend(std::iter::repeat_n(' ', count));
        chars.extend_from_slice(&self.chars[at..]);

        Self::from_chars(chars)
    }

    /// The line with `count` spaces prepended.
    pub fn prepend_spaces(&self, count: usize) -> Self {
        let mut chars = Vec::with_capacity(self.chars.len() + count);

        chars.extend(std::iter::repeat_n(' ', count));
        chars.extend_from_slice(&self.chars);

        Self::from_chars(chars)
    }
}

/// Splits source code into lines, keeping empty lines.
pub fn split_lines(code: &str) -> Vec<Line> {
    code.split('\n').map(Line::new).collect()
}

/// Joins lines with a newline, exactly like `Array.prototype.join('\\n')`.
pub fn join_lines(lines: &[Line]) -> String {
    lines
        .iter()
        .map(Line::to_plain_string)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn columns_count_utf16_code_units() {
        let line = Line::new("😀 = 1");

        assert_eq!(line.column(0), 0);
        assert_eq!(line.column(1), 2);
        assert_eq!(line.char_index_at_column(2), 1);
        assert_eq!(line.indent_column(), 0);
    }

    #[test]
    fn bmp_characters_have_one_column() {
        let line = Line::new("あ = 1");

        assert_eq!(line.column(1), 1);
        assert_eq!(line.column(2), 2);
    }

    #[test]
    fn split_and_join_round_trip() {
        let code = "a = 1\n\nb = 2\n";
        let lines = split_lines(code);

        assert_eq!(lines.len(), 4);
        assert_eq!(join_lines(&lines), code);
    }

    #[test]
    fn insert_spaces_keeps_the_rest_intact() {
        let line = Line::new("ab = 1");

        assert_eq!(line.insert_spaces(2, 3).to_plain_string(), "ab    = 1");
    }
}
