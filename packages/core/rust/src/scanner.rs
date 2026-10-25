//! Lexical scanner of the core. See the TypeScript reference implementation in
//! `packages/core-ts/src/scanner.ts` for the exact rules; this module is a
//! faithful port.
//!
//! The scanner walks the source exactly once and keeps its lexical state across
//! line boundaries, so multi-line strings and block comments are handled
//! correctly. For every line it reports the contiguous regions that hold real
//! code and the trailing line comment, if there is one.
//!
//! All positions are character indices; [`Line`] owns the UTF-16 column table
//! that the public boundary uses. JavaScript has no regular expressions here:
//! every pattern of the reference implementation is a small manual parser.

use crate::line::{Line, is_js_whitespace, split_lines};
use crate::types::{
    CodeRegion, EscapeMode, LanguageProfile, LineComment, ScanResult, StringDelimiter,
};

/// Result of searching a line for the closing delimiter of a string literal.
struct ClosingSearch {
    /// Index of the closing delimiter, or `None` when the literal stays open.
    index: Option<usize>,
    /// Whether the first character of the next line is escaped.
    escaped: bool,
}

/// Result of scanning an interpolated string across a single line.
struct InterpolatedSearch {
    /// Index of the closing delimiter, or `None` when the literal stays open.
    index: Option<usize>,
    /// Brace depth at the end of the line (carried into the next line).
    depth: usize,
    /// Whether the first character of the next line is escaped.
    escaped: bool,
}

/// Replacement segment of a Perl substitution: its own delimiter plus content start.
struct PerlReplacement {
    delimiter: StringDelimiter,
    content_start: usize,
}

/// Block comment that is currently open, tracking nesting depth.
struct OpenBlock {
    open: String,
    close: String,
    nesting: bool,
    depth: usize,
}

/// Number of characters of `text`.
fn char_count(text: &str) -> usize {
    text.chars().count()
}

/// Whether `character` is an ASCII letter, digit or underscore.
fn is_ascii_word_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// Whether `character` opens a bracket pair (`{`, `(`, `[`, `<`).
fn is_bracket_opener(character: char) -> bool {
    matches!(character, '{' | '(' | '[' | '<')
}

/// The closing bracket of a bracket opener, or `character` itself.
fn mirror(character: char) -> char {
    match character {
        '{' => '}',
        '(' => ')',
        '[' => ']',
        '<' => '>',
        other => other,
    }
}

/// Longest candidate of `candidates` that matches at `index`, or `None`.
fn match_longest<'a>(line: &Line, index: usize, candidates: &'a [String]) -> Option<&'a str> {
    let mut best: Option<&str> = None;

    for candidate in candidates {
        if candidate.is_empty() || !line.starts_with(index, candidate.as_str()) {
            continue;
        }

        let better = match best {
            None => true,
            Some(current) => char_count(candidate) > char_count(current),
        };

        if better {
            best = Some(candidate.as_str());
        }
    }

    best
}

/// Longest block comment that opens at `index`, or `None`.
fn match_block_comment<'a>(
    line: &Line,
    index: usize,
    block_comments: &'a [(String, String)],
) -> Option<&'a (String, String)> {
    let mut best: Option<&(String, String)> = None;

    for block in block_comments {
        if block.0.is_empty() || !line.starts_with(index, block.0.as_str()) {
            continue;
        }

        let better = match best {
            None => true,
            Some(current) => char_count(&block.0) > char_count(&current.0),
        };

        if better {
            best = Some(block);
        }
    }

    best
}

/// Whether `line[from..from + length]` is a run of ASCII hexadecimal digits.
fn is_hex_run(line: &Line, from: usize, length: usize) -> bool {
    (0..length).all(|offset| {
        line.char_at(from + offset)
            .is_some_and(|character| character.is_ascii_hexdigit())
    })
}

/// Whether a quote at `index` opens a character literal.
///
/// Rust lifetimes (`'a`, `&'a`) and F# type parameters (`'T`) look exactly like
/// character literals, so a quote only starts a literal when it closes on the
/// same line: a single character (`'x'`), a simple escape (`'\n'`) or a numeric
/// escape (`'\u0041'`, `'\U00000041'`, `'\x41'`, `'\065'`). A quote that follows
/// `<` or `&` is a lifetime in practice and never a literal.
fn is_char_literal(line: &Line, index: usize) -> bool {
    if index > 0 && matches!(line.char_at(index - 1), Some('<') | Some('&')) {
        return false;
    }

    if line.char_at(index + 1) != Some('\\') {
        return line.char_at(index + 2) == Some('\'');
    }

    match line.char_at(index + 2) {
        Some('u') => is_hex_run(line, index + 3, 4) && line.char_at(index + 7) == Some('\''),
        Some('U') => is_hex_run(line, index + 3, 8) && line.char_at(index + 11) == Some('\''),
        Some('x') => is_hex_run(line, index + 3, 2) && line.char_at(index + 5) == Some('\''),
        Some(digit) if digit.is_ascii_digit() => {
            let mut cursor = index + 2;

            while cursor < index + 5
                && line
                    .char_at(cursor)
                    .is_some_and(|character| character.is_ascii_digit())
            {
                cursor += 1;
            }

            line.char_at(cursor) == Some('\'')
        }
        _ => line.char_at(index + 3) == Some('\''),
    }
}

/// Whether `delimiter` is a JavaScript-style template literal with `${}` holes.
fn is_js_template(delimiter: &StringDelimiter) -> bool {
    delimiter.open == "`"
        && delimiter.close == "`"
        && delimiter.escape == EscapeMode::Backslash
        && delimiter.multiline
}

/// Whether `delimiter` is a C#/F# interpolated string with `{}` holes.
fn is_dollar_interpolated(delimiter: &StringDelimiter) -> bool {
    delimiter.open.starts_with('$') || delimiter.open == "@$\""
}

/// Number of braces that open a hole in a brace-interpolated string.
///
/// C# and F# raw interpolated strings repeat the `$` sign to widen the hole
/// delimiter: `$"""` uses `{…}` holes while `$$"""` uses `{{…}}` holes and
/// treats single braces as literal text. Every other brace-interpolated form
/// uses a single brace.
fn interpolated_hole_width(delimiter: &StringDelimiter) -> usize {
    if delimiter.open.starts_with("$$") {
        2
    } else {
        1
    }
}

/// Scans a JavaScript template literal, keeping `${}` holes opaque.
fn find_template_close(
    line: &Line,
    from: usize,
    depth: usize,
    escaped_first: bool,
) -> InterpolatedSearch {
    let mut index = from;
    let mut current_depth = depth;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return InterpolatedSearch {
                    index: None,
                    depth: current_depth,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if line.char_at(index) == Some('$') && line.char_at(index + 1) == Some('{') {
            current_depth += 1;
            index += 2;
            continue;
        }

        if line.char_at(index) == Some('}') && current_depth > 0 {
            current_depth -= 1;
            index += 1;
            continue;
        }

        if line.char_at(index) == Some('`') && current_depth == 0 {
            return InterpolatedSearch {
                index: Some(index),
                depth: current_depth,
                escaped: false,
            };
        }

        index += 1;
    }

    InterpolatedSearch {
        index: None,
        depth: current_depth,
        escaped: false,
    }
}

/// Scans a brace-interpolated string, keeping `{}` holes opaque.
fn find_csharp_interpolated_close(
    line: &Line,
    from: usize,
    delimiter: &StringDelimiter,
    depth: usize,
    escaped_first: bool,
) -> InterpolatedSearch {
    let close = delimiter.close.as_str();
    let close_length = char_count(close);
    let width = interpolated_hole_width(delimiter);
    let mut index = from;
    let mut current_depth = depth;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if delimiter.escape == EscapeMode::Backslash && line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return InterpolatedSearch {
                    index: None,
                    depth: current_depth,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if delimiter.escape == EscapeMode::Doubled
            && current_depth == 0
            && line.starts_with(index, close)
            && line.starts_with(index + close_length, close)
        {
            index += close_length * 2;
            continue;
        }

        if width == 1 {
            if current_depth == 0 && line.starts_with(index, "{{") {
                index += 2;
                continue;
            }

            if current_depth == 0 && line.starts_with(index, "}}") {
                index += 2;
                continue;
            }

            if line.char_at(index) == Some('{') {
                current_depth += 1;
                index += 1;
                continue;
            }

            if line.char_at(index) == Some('}') && current_depth > 0 {
                current_depth -= 1;
                index += 1;
                continue;
            }
        } else {
            if current_depth == 0 && line.starts_with(index, "{{") {
                current_depth += 1;
                index += 2;
                continue;
            }

            if current_depth > 0 && line.starts_with(index, "}}") {
                current_depth -= 1;
                index += 2;
                continue;
            }
        }

        if current_depth == 0 && line.starts_with(index, close) {
            return InterpolatedSearch {
                index: Some(index),
                depth: current_depth,
                escaped: false,
            };
        }

        index += 1;
    }

    InterpolatedSearch {
        index: None,
        depth: current_depth,
        escaped: false,
    }
}

/// Whether `delimiter` is a Python f-string with `{}` holes.
fn is_python_f_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    if profile.id != "python" {
        return false;
    }

    let open = delimiter.open.to_lowercase();

    open.starts_with("f\"")
        || open.starts_with("f'")
        || open.starts_with("fr\"")
        || open.starts_with("fr'")
        || open.starts_with("rf\"")
        || open.starts_with("rf'")
}

/// Whether `delimiter` carries `{}` holes that must stay opaque (C#, F# or Python).
fn is_brace_interpolated(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    is_dollar_interpolated(delimiter) || is_python_f_string(delimiter, profile)
}

/// Whether `delimiter` is a Groovy/Kotlin/Dart/PowerShell/Terraform quoted string with `${}` holes.
fn is_dollar_brace_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    (profile.id == "groovy"
        || profile.id == "kotlin"
        || profile.id == "dart"
        || profile.id == "powershell"
        || profile.id == "terraform")
        && (delimiter.open == "\"" || delimiter.open == "'" || delimiter.open == "$/")
}

/// Scans a quoted string with `${}` holes, keeping the holes opaque.
fn find_dollar_brace_close(
    line: &Line,
    from: usize,
    delimiter: &StringDelimiter,
    depth: usize,
    escaped_first: bool,
) -> InterpolatedSearch {
    let close = delimiter.close.as_str();
    let close_length = char_count(close);
    let mut index = from;
    let mut current_depth = depth;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if delimiter.escape == EscapeMode::Backslash && line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return InterpolatedSearch {
                    index: None,
                    depth: current_depth,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if line.char_at(index) == Some('$') && line.char_at(index + 1) == Some('{') {
            current_depth += 1;
            index += 2;
            continue;
        }

        if line.char_at(index) == Some('}') && current_depth > 0 {
            current_depth -= 1;
            index += 1;
            continue;
        }

        if current_depth == 0 && line.starts_with(index, close) {
            if delimiter.escape == EscapeMode::Doubled
                && line.starts_with(index + close_length, close)
            {
                index += close_length * 2;
                continue;
            }

            return InterpolatedSearch {
                index: Some(index),
                depth: current_depth,
                escaped: false,
            };
        }

        index += 1;
    }

    InterpolatedSearch {
        index: None,
        depth: current_depth,
        escaped: false,
    }
}

/// Whether `delimiter` is a Scala interpolated string with `${}` holes.
fn is_scala_interpolated(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    profile.id == "scala" && matches!(delimiter.open.as_str(), "s\"" | "f\"" | "raw\"")
}

/// Whether `delimiter` is a Ruby/Elixir/Crystal double-quoted string with `#{}` holes.
fn is_hash_brace_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    (profile.id == "ruby" || profile.id == "elixir" || profile.id == "crystal")
        && delimiter.open == "\""
}

/// Scans a quoted string with `#{}` holes, keeping the holes opaque.
fn find_hash_brace_close(
    line: &Line,
    from: usize,
    delimiter: &StringDelimiter,
    depth: usize,
    escaped_first: bool,
) -> InterpolatedSearch {
    let close = delimiter.close.as_str();
    let close_length = char_count(close);
    let mut index = from;
    let mut current_depth = depth;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if delimiter.escape == EscapeMode::Backslash && line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return InterpolatedSearch {
                    index: None,
                    depth: current_depth,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if line.char_at(index) == Some('#') && line.char_at(index + 1) == Some('{') {
            current_depth += 1;
            index += 2;
            continue;
        }

        if line.char_at(index) == Some('}') && current_depth > 0 {
            current_depth -= 1;
            index += 1;
            continue;
        }

        if current_depth == 0 && line.starts_with(index, close) {
            if delimiter.escape == EscapeMode::Doubled
                && line.starts_with(index + close_length, close)
            {
                index += close_length * 2;
                continue;
            }

            return InterpolatedSearch {
                index: Some(index),
                depth: current_depth,
                escaped: false,
            };
        }

        index += 1;
    }

    InterpolatedSearch {
        index: None,
        depth: current_depth,
        escaped: false,
    }
}

/// Whether `delimiter` is a Swift quoted string with `\()` holes.
fn is_swift_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    profile.id == "swift" && delimiter.open == "\""
}

/// Scans a Swift quoted string with `\()` holes, keeping the holes opaque.
fn find_swift_close(
    line: &Line,
    from: usize,
    delimiter: &StringDelimiter,
    depth: usize,
    escaped_first: bool,
) -> InterpolatedSearch {
    let close = delimiter.close.as_str();
    let mut index = from;
    let mut current_depth = depth;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if line.char_at(index) == Some('\\') && line.char_at(index + 1) == Some('(') {
            current_depth += 1;
            index += 2;
            continue;
        }

        if delimiter.escape == EscapeMode::Backslash && line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return InterpolatedSearch {
                    index: None,
                    depth: current_depth,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if line.char_at(index) == Some(')') && current_depth > 0 {
            current_depth -= 1;
            index += 1;
            continue;
        }

        if current_depth == 0 && line.starts_with(index, close) {
            return InterpolatedSearch {
                index: Some(index),
                depth: current_depth,
                escaped: false,
            };
        }

        index += 1;
    }

    InterpolatedSearch {
        index: None,
        depth: current_depth,
        escaped: false,
    }
}

/// Whether `delimiter` is a Julia quoted string with `$()` holes.
fn is_dollar_paren_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    profile.id == "julia" && delimiter.open == "\""
}

/// Scans a quoted string with `$()` holes, keeping the holes opaque.
fn find_dollar_paren_close(
    line: &Line,
    from: usize,
    delimiter: &StringDelimiter,
    depth: usize,
    escaped_first: bool,
) -> InterpolatedSearch {
    let close = delimiter.close.as_str();
    let mut index = from;
    let mut current_depth = depth;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if delimiter.escape == EscapeMode::Backslash && line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return InterpolatedSearch {
                    index: None,
                    depth: current_depth,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if line.char_at(index) == Some('$') && line.char_at(index + 1) == Some('(') {
            current_depth += 1;
            index += 2;
            continue;
        }

        if line.char_at(index) == Some(')') && current_depth > 0 {
            current_depth -= 1;
            index += 1;
            continue;
        }

        if current_depth == 0 && line.starts_with(index, close) {
            return InterpolatedSearch {
                index: Some(index),
                depth: current_depth,
                escaped: false,
            };
        }

        index += 1;
    }

    InterpolatedSearch {
        index: None,
        depth: current_depth,
        escaped: false,
    }
}

/// Whether `delimiter` is a PHP double-quoted string with `{}` holes.
fn is_php_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    profile.id == "php" && delimiter.open == "\""
}

/// Whether `delimiter` is a Nim `fmt` interpolated string with `{}` holes.
fn is_nim_fmt_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    profile.id == "nim" && delimiter.open == "fmt\""
}

/// Whether `character` can continue an identifier.
///
/// ASCII letters, digits and underscores always can; any other visible
/// character outside the ASCII range can as well, so a string prefix is never
/// claimed in the middle of a longer Unicode identifier.
fn is_scanner_word_char(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || character == '_'
        || (character > '~' && !is_js_whitespace(character))
}

/// Nim `fmt` interpolated string delimiter that opens at `index`, or `None`.
fn match_nim_fmt_string(line: &Line, index: usize) -> Option<StringDelimiter> {
    if index > 0 && line.char_at(index - 1).is_some_and(is_scanner_word_char) {
        return None;
    }

    if !line.starts_with(index, "fmt\"") || line.starts_with(index, "fmt\"\"\"") {
        return None;
    }

    Some(StringDelimiter {
        open: "fmt\"".to_owned(),
        close: "\"".to_owned(),
        escape: EscapeMode::Backslash,
        multiline: false,
    })
}

/// Perl quote-like operators, longest-first where they share a prefix.
const PERL_OPERATORS: [&str; 9] = ["qq", "qx", "qw", "qr", "q", "m", "s", "tr", "y"];
/// Perl substitution operators.
const PERL_SUBST_OPERATORS: [&str; 3] = ["s", "tr", "y"];

/// Length of the Perl quote-like operator that starts at `index`, or `None`.
fn perl_operator_length(line: &Line, index: usize) -> Option<usize> {
    PERL_OPERATORS
        .iter()
        .copied()
        .find(|&operator| line.starts_with(index, operator))
        .map(char_count)
}

/// Perl quote-like operator delimiter that opens at `index`, or `None`.
///
/// Blanks may sit between the operator and its delimiter (`s {foo} {bar}`,
/// documented in perlop), except that `#` after blanks starts a comment and
/// `=`, `<`, `>` after blanks would be a fat comma or comparison — those stay
/// code. A `sub`/`package`/`class` name before the operator (`sub s {`) and a
/// sigil or `&`/`>` before it (`$m / 2`, `->s {`) also stay code.
fn match_perl_quote(line: &Line, index: usize) -> Option<StringDelimiter> {
    if index > 0 && line.char_at(index - 1).is_some_and(is_scanner_word_char) {
        return None;
    }

    let operator_length = perl_operator_length(line, index)?;
    let mut cursor = index + operator_length;

    while matches!(line.char_at(cursor), Some(' ') | Some('\t')) {
        cursor += 1;
    }

    let blanks = cursor - (index + operator_length);
    let opener = line.char_at(cursor)?;

    if is_ascii_word_char(opener) || is_js_whitespace(opener) {
        return None;
    }

    if blanks > 0 {
        if matches!(opener, '#' | '=' | '<' | '>') {
            return None;
        }

        let before = if index > 0 {
            line.char_at(index - 1)
        } else {
            None
        };
        if matches!(
            before,
            Some('$') | Some('@') | Some('%') | Some('&') | Some('>')
        ) {
            return None;
        }

        let mut end = index;
        while end > 0 && matches!(line.char_at(end - 1), Some(' ') | Some('\t')) {
            end -= 1;
        }

        if end > 0 {
            let mut start = end;
            while start > 0 && line.char_at(start - 1).is_some_and(is_ascii_word_char) {
                start -= 1;
            }

            let word = line.text(start, end);
            if matches!(word.as_str(), "sub" | "package" | "class") {
                return None;
            }
        }
    }

    Some(StringDelimiter {
        open: line.text(index, cursor + 1),
        close: mirror(opener).to_string(),
        escape: EscapeMode::Backslash,
        multiline: true,
    })
}

/// Whether `delimiter` opens any Perl quote-like operator (`q`, `qq`, `m`, `s`, `tr`, …).
fn is_perl_quote(delimiter: &StringDelimiter) -> bool {
    perl_open_matches(&delimiter.open, &PERL_OPERATORS)
}

/// Whether `delimiter` opens the pattern segment of a Perl `s`/`tr`/`y` substitution.
fn is_perl_subst(delimiter: &StringDelimiter) -> bool {
    perl_open_matches(&delimiter.open, &PERL_SUBST_OPERATORS)
}

/// Whether `open` has the shape of a Perl quote-like opener for `operators`.
fn perl_open_matches(open: &str, operators: &[&str]) -> bool {
    let Some(operator) = operators
        .iter()
        .copied()
        .find(|&operator| open.starts_with(operator))
    else {
        return false;
    };

    let chars: Vec<char> = open.chars().collect();
    let mut cursor = operator.chars().count();

    while cursor < chars.len() && (chars[cursor] == ' ' || chars[cursor] == '\t') {
        cursor += 1;
    }

    if chars.len() != cursor + 1 {
        return false;
    }

    let opener = chars[cursor];
    !is_ascii_word_char(opener) && !is_js_whitespace(opener)
}

/// Bare `/.../` match delimiter that opens at `index`, or `None`.
fn match_bare_slash(line: &Line, index: usize) -> Option<StringDelimiter> {
    if !line.starts_with(index, "/") {
        return None;
    }

    let next = line.char_at(index + 1)?;
    if next == ' ' || next == '\t' || next == '/' || next == '=' {
        return None;
    }

    let probe = StringDelimiter {
        open: "/".to_owned(),
        close: "/".to_owned(),
        escape: EscapeMode::Backslash,
        multiline: false,
    };
    find_closing(line, index + 1, &probe, false).index?;

    let mut back = index;
    while back > 0 && matches!(line.char_at(back - 1), Some(' ') | Some('\t')) {
        back -= 1;
    }

    if back == 0 {
        return Some(slash_delimiter());
    }

    let previous_index = back - 1;
    let previous = line.char_at(previous_index)?;

    if matches!(
        previous,
        '(' | ','
            | ';'
            | '{'
            | '['
            | '='
            | '!'
            | '~'
            | '?'
            | ':'
            | '|'
            | '&'
            | '+'
            | '-'
            | '*'
            | '%'
    ) {
        return Some(slash_delimiter());
    }

    if !is_ascii_word_char(previous) {
        return None;
    }

    let mut word_start = previous_index + 1;
    while word_start > 0 && line.char_at(word_start - 1).is_some_and(is_ascii_word_char) {
        word_start -= 1;
    }

    let word = line.text(word_start, previous_index + 1);
    let before = if word_start > 0 {
        line.char_at(word_start - 1)
    } else {
        None
    };

    if is_perl_match_keyword(&word) && !is_perl_sigil(before) {
        return Some(slash_delimiter());
    }

    // `print FH /pat/`: a bareword handle after a print-like verb re-opens
    // term position, so the `/` starts a match. A sigiled handle stays code
    // instead — after a complete term the `/` divides.
    if is_perl_sigil(before) {
        return None;
    }

    let mut verb_end = word_start;
    while verb_end > 0 && matches!(line.char_at(verb_end - 1), Some(' ') | Some('\t')) {
        verb_end -= 1;
    }

    if verb_end == 0 {
        return None;
    }

    let mut verb_start = verb_end;
    while verb_start > 0 && line.char_at(verb_start - 1).is_some_and(is_ascii_word_char) {
        verb_start -= 1;
    }

    let verb = line.text(verb_start, verb_end);
    if !matches!(verb.as_str(), "print" | "printf" | "say") {
        return None;
    }

    let mut marker_position = verb_start;
    while marker_position > 0 && matches!(line.char_at(marker_position - 1), Some(' ') | Some('\t'))
    {
        marker_position -= 1;
    }

    let marker = if marker_position > 0 {
        line.char_at(marker_position - 1)
    } else {
        None
    };
    if marker.is_none()
        || matches!(
            marker,
            Some(';') | Some('{') | Some('}') | Some('(') | Some('&') | Some('|') | Some('!')
        )
    {
        return Some(slash_delimiter());
    }

    None
}

/// Whether `word` ends a Perl match keyword.
fn is_perl_match_keyword(word: &str) -> bool {
    matches!(
        word,
        "return"
            | "split"
            | "grep"
            | "map"
            | "print"
            | "say"
            | "die"
            | "warn"
            | "if"
            | "elsif"
            | "unless"
            | "while"
            | "until"
            | "for"
            | "foreach"
            | "given"
            | "when"
    )
}

/// Whether `character` is a Perl sigil or a `>` that would make `/` divide.
fn is_perl_sigil(character: Option<char>) -> bool {
    matches!(
        character,
        Some('$') | Some('@') | Some('%') | Some('&') | Some('>')
    )
}

/// A bare `/.../` match delimiter.
fn slash_delimiter() -> StringDelimiter {
    StringDelimiter {
        open: "/".to_owned(),
        close: "/".to_owned(),
        escape: EscapeMode::Backslash,
        multiline: true,
    }
}

/// Whether `delimiter` is the bracketed replacement segment of a Perl substitution.
fn is_perl_replacement(delimiter: &StringDelimiter) -> bool {
    let mut chars = delimiter.open.chars();

    matches!((chars.next(), chars.next()), (Some(character), None) if is_bracket_opener(character))
}

/// Whether `character` can open a Perl replacement on the next line.
///
/// A bracket always can; a `/` can too — it starts a regex-style segment and
/// can be neither a comment nor a unary operator. Any other character (`#`
/// starts a comment, `!` negates) stays code.
fn is_perl_line_head_opener(character: char) -> bool {
    is_bracket_opener(character) || character == '/'
}

/// Closes one Perl quote-like segment, balancing bracket delimiters.
fn find_perl_segment_close(
    line: &Line,
    from: usize,
    opener: char,
    close: &str,
    depth: usize,
    escaped_first: bool,
) -> InterpolatedSearch {
    let nesting = is_bracket_opener(opener);
    let mut index = from;
    let mut current_depth = depth;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return InterpolatedSearch {
                    index: None,
                    depth: current_depth,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if nesting && line.char_at(index) == Some(opener) {
            current_depth += 1;
            index += 1;
            continue;
        }

        if !line.starts_with(index, close) {
            index += 1;
            continue;
        }

        if nesting && current_depth > 0 {
            current_depth -= 1;
            index += 1;
            continue;
        }

        return InterpolatedSearch {
            index: Some(index),
            depth: current_depth,
            escaped: false,
        };
    }

    InterpolatedSearch {
        index: None,
        depth: current_depth,
        escaped: false,
    }
}

/// Locates the replacement segment of a Perl substitution.
///
/// `from` follows the pattern close and `opener` is the pattern delimiter.
/// A bracket pattern takes a fresh bracket (or delimiter) pair after optional
/// blanks; a repeated-character pattern (`s///`) continues inline and closes
/// at the next occurrence of the same character. Returns `None` when no
/// replacement opens on this line.
fn match_perl_replacement(line: &Line, from: usize, opener: char) -> Option<PerlReplacement> {
    if is_bracket_opener(opener) {
        let mut start = from;
        while matches!(line.char_at(start), Some(' ') | Some('\t')) {
            start += 1;
        }

        if start >= line.len() {
            return None;
        }

        let second = line.char_at(start)?;
        // A `#` after blanks starts a comment (perlop "Gory details"), so the
        // replacement is still pending; a glued `#` opens a `#...#` segment.
        if start > from && second == '#' {
            return None;
        }

        if is_bracket_opener(second) {
            return Some(PerlReplacement {
                delimiter: StringDelimiter {
                    open: second.to_string(),
                    close: mirror(second).to_string(),
                    escape: EscapeMode::Backslash,
                    multiline: true,
                },
                content_start: start + 1,
            });
        }

        if !is_ascii_word_char(second) && !is_js_whitespace(second) {
            return Some(PerlReplacement {
                delimiter: StringDelimiter {
                    open: second.to_string(),
                    close: second.to_string(),
                    escape: EscapeMode::Backslash,
                    multiline: true,
                },
                content_start: start + 1,
            });
        }

        return None;
    }

    Some(PerlReplacement {
        delimiter: StringDelimiter {
            open: opener.to_string(),
            close: opener.to_string(),
            escape: EscapeMode::Backslash,
            multiline: true,
        },
        content_start: from,
    })
}

/// Whether `delimiter` is an Elixir sigil string.
fn is_elixir_sigil(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    profile.id == "elixir" && delimiter.open.starts_with('~')
}

/// Elixir sigil delimiter that opens at `index`, or `None`.
fn match_elixir_sigil(line: &Line, index: usize) -> Option<StringDelimiter> {
    if index > 0 && line.char_at(index - 1).is_some_and(is_scanner_word_char) {
        return None;
    }

    if line.char_at(index) != Some('~') {
        return None;
    }

    let letter = line.char_at(index + 1)?;
    if !letter.is_ascii_alphabetic() {
        return None;
    }

    let opener = line.char_at(index + 2)?;
    if is_ascii_word_char(opener) || is_js_whitespace(opener) {
        return None;
    }

    Some(StringDelimiter {
        open: line.text(index, index + 3),
        close: mirror(opener).to_string(),
        escape: EscapeMode::Backslash,
        multiline: true,
    })
}

/// Whether `char` is a Ruby/Crystal percent literal type letter.
fn is_percent_type(character: char) -> bool {
    matches!(
        character,
        'q' | 'Q' | 'i' | 'I' | 'w' | 'W' | 's' | 'x' | 'r'
    )
}

/// Whether `delimiter` is a Ruby/Crystal percent literal.
fn is_percent_string(delimiter: &StringDelimiter, profile: &LanguageProfile) -> bool {
    if profile.id != "ruby" && profile.id != "crystal" {
        return false;
    }

    let chars: Vec<char> = delimiter.open.chars().collect();
    if chars.len() != 2 && chars.len() != 3 {
        return false;
    }

    if chars[0] != '%' {
        return false;
    }

    if chars.len() == 3 && !is_percent_type(chars[1]) {
        return false;
    }

    matches!(chars[chars.len() - 1], '{' | '(' | '<' | '[')
}

/// Ruby/Crystal percent literal delimiter that opens at `index`, or `None`.
fn match_percent_string(
    line: &Line,
    index: usize,
    profile: &LanguageProfile,
) -> Option<StringDelimiter> {
    if profile.id != "ruby" && profile.id != "crystal" {
        return None;
    }

    if index > 0 && line.char_at(index - 1).is_some_and(is_scanner_word_char) {
        return None;
    }

    if line.char_at(index) != Some('%') {
        return None;
    }

    let first = line.char_at(index + 1)?;
    let (opener, width) = if is_percent_type(first) {
        (line.char_at(index + 2)?, 3)
    } else {
        (first, 2)
    };

    if !matches!(opener, '{' | '(' | '<' | '[') {
        return None;
    }

    Some(StringDelimiter {
        open: line.text(index, index + width),
        close: mirror(opener).to_string(),
        escape: EscapeMode::Backslash,
        multiline: true,
    })
}

/// Whether `profile` supports `<<WORD` heredocs whose body stays opaque.
fn is_heredoc_profile(profile: &LanguageProfile) -> bool {
    profile.id == "shell" || profile.id == "ruby" || profile.id == "perl" || profile.id == "php"
}

/// Heredoc terminator that opens at `index`, or `None`.
fn match_heredoc_opener(line: &Line, index: usize) -> Option<String> {
    if let Some(name) = heredoc_name_after(line, index, "<<<", true) {
        return Some(name);
    }

    heredoc_name_after(line, index, "<<", false)
}

/// Parses the heredoc name behind a `<<<` or `<<` marker at `index`.
fn heredoc_name_after(
    line: &Line,
    index: usize,
    marker: &str,
    allow_triple_dash: bool,
) -> Option<String> {
    if !line.starts_with(index, marker) {
        return None;
    }

    let mut cursor = index + char_count(marker);

    if (allow_triple_dash && line.char_at(cursor) == Some('-'))
        || (!allow_triple_dash && matches!(line.char_at(cursor), Some('-') | Some('~')))
    {
        cursor += 1;
    }

    while line.char_at(cursor).is_some_and(is_js_whitespace) {
        cursor += 1;
    }

    if matches!(line.char_at(cursor), Some('\'') | Some('"') | Some('`')) {
        cursor += 1;
    }

    let start = cursor;
    match line.char_at(cursor) {
        Some(character) if character.is_ascii_alphabetic() || character == '_' => cursor += 1,
        _ => return None,
    }

    while line.char_at(cursor).is_some_and(is_ascii_word_char) {
        cursor += 1;
    }

    let name = line.text(start, cursor);

    Some(name)
}

/// Whether `line` terminates the heredoc closed by `terminator`.
fn is_heredoc_terminator(line: &Line, terminator: &str) -> bool {
    line.trimmed_is(terminator) || line.trimmed_is(&format!("{terminator};"))
}

/// Whether `profile` nests its `open`/`close` block comment pair.
fn is_nesting_block_comment(profile: &LanguageProfile, open: &str, close: &str) -> bool {
    profile.id == "haskell" && open == "{-" && close == "-}"
        || profile.id == "julia" && open == "#=" && close == "=#"
        || (profile.id == "swift" || profile.id == "rust") && open == "/*" && close == "*/"
        || profile.id == "fsharp" && open == "(*" && close == "*)"
}

/// Length of the F# star value that starts at `index`, or `0`.
///
/// The F# compiler lexer matches the three-character `(*)` before the `(*`
/// comment opener, so `(*)` is an ordinary value (the multiplication function)
/// rather than the start of a block comment. `(**)` is covered as well: the
/// operator and its closing parenthesis stay code instead of opening an empty
/// comment. Inside an already open comment the token never nests either, so
/// `(* (*) *)` still closes at its `*)`.
fn fsharp_star_value_length(profile: &LanguageProfile, line: &Line, index: usize) -> usize {
    if profile.id != "fsharp" {
        return 0;
    }

    if line.starts_with(index, "(**)") {
        return 4;
    }

    if line.starts_with(index, "(*)") {
        return 3;
    }

    0
}

/// Whether `character` belongs to a Python string prefix.
fn is_python_prefix_char(character: char) -> bool {
    matches!(character, 'r' | 'R' | 'b' | 'B' | 'u' | 'U' | 'f' | 'F')
}

/// Python f-string delimiter that opens at `index`, or `None`.
fn match_python_f_string(line: &Line, index: usize) -> Option<StringDelimiter> {
    if index > 0 && line.char_at(index - 1).is_some_and(is_scanner_word_char) {
        return None;
    }

    let mut cursor = index;
    while line.char_at(cursor).is_some_and(is_python_prefix_char) {
        cursor += 1;
    }

    let prefix = line.text(index, cursor);
    let quote = if line.starts_with(cursor, "\"\"\"") {
        "\"\"\""
    } else if line.starts_with(cursor, "'''") {
        "'''"
    } else if line.starts_with(cursor, "\"") {
        "\""
    } else if line.starts_with(cursor, "'") {
        "'"
    } else {
        return None;
    };

    if !prefix
        .chars()
        .any(|character| character == 'f' || character == 'F')
    {
        return None;
    }

    let escape = if prefix
        .chars()
        .any(|character| character == 'r' || character == 'R')
    {
        EscapeMode::None
    } else {
        EscapeMode::Backslash
    };
    let mut open = prefix;
    open.push_str(quote);

    Some(StringDelimiter {
        open,
        close: quote.to_owned(),
        escape,
        multiline: char_count(quote) == 3,
    })
}

/// Scala interpolated string delimiter that opens at `index`, or `None`.
fn match_scala_interpolated(line: &Line, index: usize) -> Option<StringDelimiter> {
    if index > 0 && line.char_at(index - 1).is_some_and(is_scanner_word_char) {
        return None;
    }

    let name_length = if line.starts_with(index, "raw\"") {
        3
    } else if line.starts_with(index, "s\"") || line.starts_with(index, "f\"") {
        1
    } else {
        return None;
    };

    if line.starts_with(index + name_length, "\"\"\"") {
        return None;
    }

    let escape = if name_length == 3 {
        EscapeMode::None
    } else {
        EscapeMode::Backslash
    };

    Some(StringDelimiter {
        open: line.text(index, index + name_length + 1),
        close: "\"".to_owned(),
        escape,
        multiline: false,
    })
}

/// Longest string delimiter that opens at `index`, or `None`.
fn match_string(line: &Line, index: usize, profile: &LanguageProfile) -> Option<StringDelimiter> {
    let special = match profile.id.as_str() {
        "python" => match_python_f_string(line, index),
        "scala" => match_scala_interpolated(line, index),
        "nim" => match_nim_fmt_string(line, index),
        "perl" => match_perl_quote(line, index).or_else(|| match_bare_slash(line, index)),
        "elixir" => match_elixir_sigil(line, index),
        "ruby" | "crystal" => match_percent_string(line, index, profile),
        _ => None,
    };

    if let Some(delimiter) = special {
        return Some(delimiter);
    }

    let mut best: Option<&StringDelimiter> = None;

    for delimiter in &profile.strings {
        if delimiter.open.is_empty() || !line.starts_with(index, delimiter.open.as_str()) {
            continue;
        }

        let better = match best {
            None => true,
            Some(current) => char_count(&delimiter.open) > char_count(&current.open),
        };

        if better {
            best = Some(delimiter);
        }
    }

    let best = best?;

    if (profile.id == "rust" || profile.id == "fsharp")
        && best.open == "'"
        && !is_char_literal(line, index)
    {
        return None;
    }

    Some(StringDelimiter::clone(best))
}

/// Searches the closing delimiter of a string literal.
///
/// `escaped_first` marks a first character that is escaped by a backslash at
/// the end of the previous line.
fn find_closing(
    line: &Line,
    from: usize,
    delimiter: &StringDelimiter,
    escaped_first: bool,
) -> ClosingSearch {
    let close = delimiter.close.as_str();
    let close_length = char_count(close);
    let mut index = from;
    let mut escaped = escaped_first;

    while index < line.len() {
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if delimiter.escape == EscapeMode::Backslash && line.char_at(index) == Some('\\') {
            if index + 1 >= line.len() {
                return ClosingSearch {
                    index: None,
                    escaped: true,
                };
            }

            index += 2;
            continue;
        }

        if !line.starts_with(index, close) {
            index += 1;
            continue;
        }

        if delimiter.escape == EscapeMode::Doubled && line.starts_with(index + close_length, close)
        {
            index += close_length * 2;
            continue;
        }

        return ClosingSearch {
            index: Some(index),
            escaped: false,
        };
    }

    ClosingSearch {
        index: None,
        escaped: false,
    }
}

/// Closes the current code region when one is open.
fn close_region(regions: &mut Vec<CodeRegion>, region_start: &mut Option<usize>, end: usize) {
    if let Some(start) = region_start.take() {
        regions.push(CodeRegion { start, end });
    }
}

/// Whether `text` starts with optional JavaScript whitespace followed by `#`.
fn starts_with_ws_hash_from(line: &Line, from: usize) -> bool {
    let mut cursor = from;

    while let Some(character) = line.char_at(cursor) {
        if is_js_whitespace(character) {
            cursor += 1;
        } else {
            return character == '#';
        }
    }

    false
}

/// Whether the rest of `line` behind `from` may still hold a Perl replacement.
fn rest_is_pending(line: &Line, from: usize) -> bool {
    line.text_from(from).chars().all(is_js_whitespace) || starts_with_ws_hash_from(line, from)
}

/// Whether the character behind `index` is a word boundary (`\b`).
fn is_word_boundary_at(line: &Line, index: usize) -> bool {
    line.char_at(index)
        .is_none_or(|character| !is_ascii_word_char(character))
}

/// `^__(END|DATA)__`
fn is_perl_data_start(line: &Line) -> bool {
    line.starts_with(0, "__END__") || line.starts_with(0, "__DATA__")
}

/// `^=cut(?![A-Za-z0-9_])`
fn is_pod_cut(line: &Line) -> bool {
    line.starts_with(0, "=cut") && is_word_boundary_at(line, 4)
}

/// `^=[A-Za-z]`
fn is_pod_directive(line: &Line) -> bool {
    line.char_at(0) == Some('=')
        && line
            .char_at(1)
            .is_some_and(|character| character.is_ascii_alphabetic())
}

/// `^\.\s*$`
fn is_format_terminator(line: &Line) -> bool {
    line.char_at(0) == Some('.')
        && line
            .chars
            .iter()
            .skip(1)
            .all(|character| is_js_whitespace(*character))
}

/// `^format\s+\S+\s+=\s*$`
fn is_format_header(line: &Line) -> bool {
    let chars = &line.chars;

    if chars.len() < 7 || !line.starts_with(0, "format") {
        return false;
    }

    let mut index = 6;
    let start = index;

    while index < chars.len() && is_js_whitespace(chars[index]) {
        index += 1;
    }

    if index == start {
        return false;
    }

    let word_start = index;

    while index < chars.len() && !is_js_whitespace(chars[index]) {
        index += 1;
    }

    if index == word_start {
        return false;
    }

    let blanks_start = index;

    while index < chars.len() && is_js_whitespace(chars[index]) {
        index += 1;
    }

    if index == blanks_start || chars.get(index) != Some(&'=') {
        return false;
    }

    index += 1;

    while index < chars.len() {
        if !is_js_whitespace(chars[index]) {
            return false;
        }

        index += 1;
    }

    true
}

/// `^__END__`
fn is_ruby_data_start(line: &Line) -> bool {
    line.starts_with(0, "__END__")
}

/// `^=end\b`
fn is_ruby_doc_end(line: &Line) -> bool {
    line.starts_with(0, "=end") && is_word_boundary_at(line, 4)
}

/// `^=begin\b`
fn is_ruby_doc_begin(line: &Line) -> bool {
    line.starts_with(0, "=begin") && is_word_boundary_at(line, 6)
}

/// Scans `code` with the lexical rules of `profile`.
pub fn scan_source(code: &str, profile: &LanguageProfile) -> ScanResult {
    let lines = split_lines(code);
    let mut code_regions: Vec<Vec<CodeRegion>> = Vec::with_capacity(lines.len());
    let mut line_comments: Vec<Option<LineComment>> = Vec::with_capacity(lines.len());

    // Block comment that is currently open, if any.
    let mut open_block: Option<OpenBlock> = None;
    // String literal that is currently open — it may span several lines.
    let mut open_string: Option<StringDelimiter> = None;
    // Brace depth inside an interpolated string (`${}` or `{}` holes).
    let mut open_depth: usize = 0;
    // Heredoc terminator that hides the following lines, or `None`.
    let mut open_heredoc: Option<String> = None;
    // Whether the first character of the current line is escaped.
    let mut escaped = false;
    // Pattern opener awaiting its replacement on a later line (`s{pat}` then EOL).
    let mut pending_perl_replacement: Option<char> = None;
    // Whether the scanner is inside Perl documentation (`=pod` through `=cut`).
    let mut open_pod = false;
    // Whether the scanner passed Perl `__END__`/`__DATA__` (only data follows).
    let mut open_data_section = false;
    // Whether the scanner is inside a Ruby `=begin` document (through `=end`).
    let mut open_ruby_doc = false;
    // Whether the scanner is inside a Perl `format` block (through a lone `.`).
    let mut open_format = false;

    for line in lines {
        if let Some(terminator) = open_heredoc.clone() {
            if is_heredoc_terminator(&line, &terminator) {
                open_heredoc = None;
            }

            code_regions.push(Vec::new());
            line_comments.push(None);
            continue;
        }

        // Perl documentation and post-code data are never code: a `=word`
        // directive hides through `=cut` (a lone `=cut` hides itself),
        // and nothing after `__END__`/`__DATA__` is parsed. Strings and
        // block comments win over all of this — `=head1` inside a string
        // stays string content either way.
        if profile.id == "perl" && open_string.is_none() && open_block.is_none() {
            if open_data_section {
                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            }

            if is_perl_data_start(&line) {
                open_data_section = true;
            } else if open_pod {
                if is_pod_cut(&line) {
                    open_pod = false;
                }

                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            } else if is_pod_directive(&line) {
                // A lone `=cut` hides itself; anything else opens pod.
                // Pending replacements survive: pod may sit between the
                // two parts of a substitution.
                if !is_pod_cut(&line) {
                    open_pod = true;
                }

                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            } else if open_format {
                if is_format_terminator(&line) {
                    open_format = false;
                }

                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            } else if is_format_header(&line) {
                open_format = true;
                pending_perl_replacement = None;
                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            }
        }

        // Ruby embedded documents (`=begin` at column zero through `=end`)
        // and post-`__END__` data are never code. Indented `=begin` is a
        // syntax error in Ruby, so it stays code here as well.
        if profile.id == "ruby" && open_string.is_none() && open_block.is_none() {
            if open_data_section {
                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            }

            if is_ruby_data_start(&line) {
                open_data_section = true;
            } else if open_ruby_doc || is_ruby_doc_end(&line) {
                if is_ruby_doc_end(&line) {
                    open_ruby_doc = false;
                }

                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            } else if is_ruby_doc_begin(&line) {
                open_ruby_doc = true;
                code_regions.push(Vec::new());
                line_comments.push(None);
                continue;
            }
        }

        let line_length = line.len();
        let mut regions: Vec<CodeRegion> = Vec::new();
        let mut region_start: Option<usize> = None;
        let mut comment: Option<LineComment> = None;
        let mut index = 0usize;
        let mut pending_heredoc: Option<String> = None;

        if let Some(opener) = pending_perl_replacement {
            if open_string.is_none() {
                if line.is_blank() {
                    code_regions.push(Vec::new());
                    line_comments.push(None);
                    continue;
                }

                // A comment-only line cannot hold the replacement, but per
                // perlop it may sit between the two parts — scan it normally
                // and keep waiting on the next line.
                if !starts_with_ws_hash_from(&line, 0) {
                    pending_perl_replacement = None;

                    if let Some(following) = match_perl_replacement(&line, 0, opener) {
                        let content_start = following.content_start;

                        if following
                            .delimiter
                            .open
                            .chars()
                            .next()
                            .is_some_and(is_perl_line_head_opener)
                        {
                            open_string = Some(following.delimiter);
                            open_depth = 0;
                            index = content_start;
                        }
                    }
                }
            }
        }

        while index < line_length {
            if let Some(mut block) = open_block.take() {
                if !block.nesting {
                    match line.find_from(index, &block.close) {
                        Some(found) => {
                            index = found + char_count(&block.close);
                            continue;
                        }
                        None => {
                            open_block = Some(block);
                            break;
                        }
                    }
                }

                let star = fsharp_star_value_length(profile, &line, index);
                if star > 0 {
                    index += star;
                    open_block = Some(block);
                    continue;
                }

                if line.starts_with(index, block.open.as_str()) {
                    block.depth += 1;
                    index += char_count(&block.open);
                    open_block = Some(block);
                    continue;
                }

                if line.starts_with(index, block.close.as_str()) {
                    block.depth = block.depth.saturating_sub(1);
                    index += char_count(&block.close);

                    if block.depth > 0 {
                        open_block = Some(block);
                    }

                    continue;
                }

                open_block = Some(block);
                index += 1;
                continue;
            }

            if let Some(delimiter) = open_string.clone() {
                let close_length = char_count(&delimiter.close);

                if is_js_template(&delimiter) {
                    let search = find_template_close(&line, index, open_depth, escaped);

                    if let Some(found) = search.index {
                        escaped = false;
                        open_depth = 0;
                        index = found + close_length;
                        open_string = None;
                    } else {
                        escaped = search.escaped;
                        open_depth = search.depth;
                        break;
                    }

                    continue;
                }

                if is_brace_interpolated(&delimiter, profile)
                    || is_nim_fmt_string(&delimiter, profile)
                    || is_php_string(&delimiter, profile)
                {
                    let search = find_csharp_interpolated_close(
                        &line, index, &delimiter, open_depth, escaped,
                    );

                    if let Some(found) = search.index {
                        escaped = false;
                        open_depth = 0;
                        index = found + close_length;
                        open_string = None;
                    } else {
                        escaped = search.escaped;
                        open_depth = search.depth;
                        break;
                    }

                    continue;
                }

                if is_dollar_brace_string(&delimiter, profile)
                    || is_scala_interpolated(&delimiter, profile)
                {
                    let search =
                        find_dollar_brace_close(&line, index, &delimiter, open_depth, escaped);

                    if let Some(found) = search.index {
                        escaped = false;
                        open_depth = 0;
                        index = found + close_length;
                        open_string = None;
                    } else {
                        escaped = search.escaped;
                        open_depth = search.depth;
                        break;
                    }

                    continue;
                }

                if is_hash_brace_string(&delimiter, profile)
                    || is_percent_string(&delimiter, profile)
                    || is_elixir_sigil(&delimiter, profile)
                {
                    let search =
                        find_hash_brace_close(&line, index, &delimiter, open_depth, escaped);

                    if let Some(found) = search.index {
                        escaped = false;
                        open_depth = 0;
                        index = found + close_length;
                        open_string = None;
                    } else {
                        escaped = search.escaped;
                        open_depth = search.depth;
                        break;
                    }

                    continue;
                }

                if is_swift_string(&delimiter, profile) {
                    let search = find_swift_close(&line, index, &delimiter, open_depth, escaped);

                    if let Some(found) = search.index {
                        escaped = false;
                        open_depth = 0;
                        index = found + close_length;
                        open_string = None;
                    } else {
                        escaped = search.escaped;
                        open_depth = search.depth;
                        break;
                    }

                    continue;
                }

                if is_dollar_paren_string(&delimiter, profile) {
                    let search =
                        find_dollar_paren_close(&line, index, &delimiter, open_depth, escaped);

                    if let Some(found) = search.index {
                        escaped = false;
                        open_depth = 0;
                        index = found + close_length;
                        open_string = None;
                    } else {
                        escaped = search.escaped;
                        open_depth = search.depth;
                        break;
                    }

                    continue;
                }

                if profile.id == "perl"
                    && (is_perl_quote(&delimiter) || is_perl_replacement(&delimiter))
                {
                    let opener = delimiter.open.chars().next_back().unwrap_or('/');
                    let search = find_perl_segment_close(
                        &line,
                        index,
                        opener,
                        &delimiter.close,
                        open_depth,
                        escaped,
                    );

                    let Some(found) = search.index else {
                        escaped = search.escaped;
                        open_depth = search.depth;
                        break;
                    };

                    escaped = false;
                    open_depth = 0;
                    let after_first = found + close_length;

                    if !is_perl_subst(&delimiter) {
                        index = after_first;
                        open_string = None;
                        continue;
                    }

                    match match_perl_replacement(&line, after_first, opener) {
                        None => {
                            pending_perl_replacement = if rest_is_pending(&line, after_first) {
                                Some(opener)
                            } else {
                                None
                            };
                            index = after_first;
                            open_string = None;
                        }
                        Some(replacement) => {
                            let second = find_perl_segment_close(
                                &line,
                                replacement.content_start,
                                replacement.delimiter.open.chars().next().unwrap_or('/'),
                                &replacement.delimiter.close,
                                0,
                                false,
                            );

                            if let Some(second_found) = second.index {
                                index = second_found + char_count(&replacement.delimiter.close);
                                open_string = None;
                            } else {
                                open_string = Some(replacement.delimiter);
                                open_depth = second.depth;
                                break;
                            }
                        }
                    }

                    continue;
                }

                let search = find_closing(&line, index, &delimiter, escaped);

                if let Some(found) = search.index {
                    escaped = false;
                    index = found + close_length;
                    open_string = None;
                } else {
                    escaped = search.escaped;
                    break;
                }

                continue;
            }

            if let Some(block) = match_block_comment(&line, index, &profile.block_comments) {
                if fsharp_star_value_length(profile, &line, index) == 0 {
                    close_region(&mut regions, &mut region_start, index);
                    index += char_count(&block.0);
                    open_block = Some(OpenBlock {
                        open: block.0.clone(),
                        close: block.1.clone(),
                        nesting: is_nesting_block_comment(profile, &block.0, &block.1),
                        depth: 1,
                    });
                    continue;
                }
            }

            if let Some(marker) = match_longest(&line, index, &profile.line_comments) {
                close_region(&mut regions, &mut region_start, index);
                comment = Some(LineComment {
                    column: index,
                    marker: marker.to_owned(),
                });
                break;
            }

            if let Some(delimiter) = match_string(&line, index, profile) {
                close_region(&mut regions, &mut region_start, index);
                index += char_count(&delimiter.open);

                if delimiter.multiline {
                    open_string = Some(delimiter);
                    open_depth = 0;
                    continue;
                }

                if is_brace_interpolated(&delimiter, profile)
                    || is_nim_fmt_string(&delimiter, profile)
                    || is_php_string(&delimiter, profile)
                {
                    let search = find_csharp_interpolated_close(&line, index, &delimiter, 0, false);

                    let Some(found) = search.index else {
                        break;
                    };
                    index = found + char_count(&delimiter.close);

                    continue;
                }

                if is_dollar_brace_string(&delimiter, profile)
                    || is_scala_interpolated(&delimiter, profile)
                {
                    let search = find_dollar_brace_close(&line, index, &delimiter, 0, false);

                    let Some(found) = search.index else {
                        break;
                    };
                    index = found + char_count(&delimiter.close);

                    continue;
                }

                if is_dollar_paren_string(&delimiter, profile) {
                    let search = find_dollar_paren_close(&line, index, &delimiter, 0, false);

                    let Some(found) = search.index else {
                        break;
                    };
                    index = found + char_count(&delimiter.close);

                    continue;
                }

                if is_swift_string(&delimiter, profile) {
                    let search = find_swift_close(&line, index, &delimiter, 0, false);

                    let Some(found) = search.index else {
                        break;
                    };
                    index = found + char_count(&delimiter.close);

                    continue;
                }

                if is_hash_brace_string(&delimiter, profile)
                    || is_percent_string(&delimiter, profile)
                    || is_elixir_sigil(&delimiter, profile)
                {
                    let search = find_hash_brace_close(&line, index, &delimiter, 0, false);

                    let Some(found) = search.index else {
                        break;
                    };
                    index = found + char_count(&delimiter.close);

                    continue;
                }

                let search = find_closing(&line, index, &delimiter, false);

                let Some(found) = search.index else {
                    break;
                };
                index = found + char_count(&delimiter.close);

                continue;
            }

            if region_start.is_none() {
                region_start = Some(index);
            }

            if is_heredoc_profile(profile) && pending_heredoc.is_none() {
                pending_heredoc = match_heredoc_opener(&line, index);
            }

            index += 1;
        }

        close_region(&mut regions, &mut region_start, line_length);
        code_regions.push(regions);
        line_comments.push(comment);

        if pending_heredoc.is_some() && open_heredoc.is_none() {
            open_heredoc = pending_heredoc;
        }
    }

    ScanResult {
        code_regions,
        line_comments,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language;

    fn scan(code: &str, id: &str) -> ScanResult {
        scan_source(code, &language::profile(id))
    }

    fn region(start: usize, end: usize) -> CodeRegion {
        CodeRegion { start, end }
    }

    #[test]
    fn reports_code_and_stops_before_a_line_comment() {
        let result = scan("const x = 1 // note", "javascript");

        assert_eq!(result.code_regions[0], vec![region(0, 12)]);
        assert_eq!(
            result.line_comments[0],
            Some(LineComment {
                column: 12,
                marker: "//".to_owned()
            })
        );
    }

    #[test]
    fn excludes_block_comments_inline_and_across_lines() {
        let inline = scan("const x = /* c */ 1", "javascript");
        assert_eq!(inline.code_regions[0], vec![region(0, 10), region(17, 19)]);

        let multiline = scan("a\n/* start\nmiddle\n*/\nb", "javascript");
        assert!(multiline.code_regions[1].is_empty());
        assert!(multiline.code_regions[2].is_empty());
        assert!(multiline.code_regions[3].is_empty());
        assert_eq!(multiline.code_regions[4], vec![region(0, 1)]);
    }

    #[test]
    fn tracks_template_literals_across_lines() {
        let result = scan("const s = `a\nb`;", "javascript");

        assert_eq!(result.code_regions[0], vec![region(0, 10)]);
        assert_eq!(result.code_regions[1], vec![region(2, 3)]);
    }

    #[test]
    fn keeps_rust_lifetimes_and_hides_char_literals() {
        assert_eq!(
            scan("fn f<'a>(x: &'a str)", "rust").code_regions[0],
            vec![region(0, 20)]
        );
        assert_eq!(
            scan("let c = 'x';", "rust").code_regions[0],
            vec![region(0, 8), region(11, 12)]
        );
    }

    #[test]
    fn treats_fsharp_star_values_as_code() {
        assert_eq!(
            scan("let mul = (*)", "fsharp").code_regions[0],
            vec![region(0, 13)]
        );

        let nested = scan("x = 1 (* a (* b *) c *)\ny = 2", "fsharp");
        assert_eq!(nested.code_regions[0], vec![region(0, 6)]);
        assert_eq!(nested.code_regions[1], vec![region(0, 5)]);
    }

    #[test]
    fn hides_python_fstring_holes() {
        let result = scan("f\"{\"x=1\"}\"\nlonger = 2", "python");

        assert!(result.code_regions[0].is_empty());
        assert_eq!(result.code_regions[1], vec![region(0, 10)]);
    }

    #[test]
    fn hides_heredoc_bodies() {
        let result = scan("cat <<EOF\nkey = value\nEOF\nx = 1", "shell");

        assert_eq!(result.code_regions[0], vec![region(0, 9)]);
        assert!(result.code_regions[1].is_empty());
        assert!(result.code_regions[2].is_empty());
        assert_eq!(result.code_regions[3], vec![region(0, 5)]);
    }

    #[test]
    fn hides_perl_substitutions_and_pod() {
        let substitution = scan("s{aa\nbb}{c=d}\nlonger = 1", "perl");
        assert!(substitution.code_regions[0].is_empty());
        assert!(substitution.code_regions[1].is_empty());
        assert_eq!(substitution.code_regions[2], vec![region(0, 10)]);

        let pod = scan("=pod\na = b\n=cut\nx = 1", "perl");
        assert!(pod.code_regions[0].is_empty());
        assert!(pod.code_regions[1].is_empty());
        assert!(pod.code_regions[2].is_empty());
        assert_eq!(pod.code_regions[3], vec![region(0, 5)]);
    }

    #[test]
    fn keeps_character_indices_for_astral_symbols() {
        assert_eq!(
            scan("😀 = 1", "generic").code_regions[0],
            vec![region(0, 5)]
        );
    }

    #[test]
    fn does_not_end_a_verbatim_string_at_a_doubled_quote() {
        assert!(scan("@\"a\"\"b\"", "csharp").code_regions[0].is_empty());
    }
}
