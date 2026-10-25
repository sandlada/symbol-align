//! Symbol finder of the core.
//!
//! The finder never parses code — it only looks at the code regions reported by
//! the scanner and locates the requested symbols inside them. A symbol is
//! rejected when it is only a fragment of a longer operator (`=` inside `=>`,
//! `==` or `:=`) or when it violates a word boundary.
//!
//! All positions in this module are character indices; [`Line`] owns the UTF-16
//! column table.

use crate::line::{Line, is_js_whitespace};
use crate::types::{CodeRegion, LineComment};

/// Options accepted by [`find_symbol_positions`].
pub struct FindOptions<'a> {
    /// Code regions of the line (real code only).
    pub regions: &'a [CodeRegion],
    /// Symbols to look for.
    pub symbols: &'a [String],
    /// Operator tokens of the language.
    pub operators: &'a [String],
    /// The trailing line comment of the line, if any.
    pub comment: Option<&'a LineComment>,
}

/// Whether `character` is an ASCII letter, a digit or an underscore.
fn is_word_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// Whether `character` can continue an identifier.
///
/// ASCII letters, digits and underscores always can; any other visible
/// character outside the ASCII range (letters with diacritics, CJK ideographs,
/// emoji, …) can as well, so a keyword prefix is never claimed inside a longer
/// Unicode identifier. Whitespace never continues one.
fn is_identifier_char(character: char) -> bool {
    is_word_char(character) || (character > '~' && !is_js_whitespace(character))
}

/// Whether `symbol` consists of word characters only.
fn is_word_symbol(symbol: &str) -> bool {
    !symbol.is_empty() && symbol.chars().all(is_word_char)
}

/// Whether `character` is a punctuation-like operator character.
fn is_operator_char(character: char) -> bool {
    !is_word_char(character) && !is_js_whitespace(character)
}

/// Whether `symbol` consists of operator characters only.
fn is_operator_symbol(symbol: &str) -> bool {
    !symbol.is_empty() && symbol.chars().all(is_operator_char)
}

/// Number of characters of `text`.
fn char_count(text: &str) -> usize {
    text.chars().count()
}

/// Whether the range `[start, end)` lies completely inside one of the regions.
fn is_inside_region(regions: &[CodeRegion], start: usize, end: usize) -> bool {
    regions
        .iter()
        .any(|region| start >= region.start && end <= region.end)
}

/// Length of the longest operator that covers the range `[start, end)`.
fn covered_by(coverage: &[usize], start: usize, end: usize) -> usize {
    let mut longest = 0;

    for column in start..end {
        if let Some(value) = coverage.get(column) {
            longest = longest.max(*value);
        }
    }

    longest
}

/// Marks every column that is covered by an operator token.
///
/// `coverage[column]` holds the length of the longest operator that covers that
/// column. A single character operator never covers more than itself, so it is
/// skipped — only multi character operators can invalidate a match.
fn operator_coverage(line: &Line, regions: &[CodeRegion], operators: &[String]) -> Vec<usize> {
    let mut coverage = vec![0_usize; line.len()];
    let mut buckets: [Vec<(&str, usize)>; 128] = std::array::from_fn(|_| Vec::new());

    for operator in operators {
        let length = char_count(operator);

        if length <= 1 {
            continue;
        }

        if let Some(first) = operator.as_bytes().first()
            && (*first as usize) < buckets.len()
        {
            buckets[*first as usize].push((operator.as_str(), length));
        }
    }

    if buckets.iter().all(Vec::is_empty) {
        return coverage;
    }

    for region in regions {
        let mut index = region.start;

        while index < region.end {
            let Some(character) = line.char_at(index) else {
                break;
            };

            let candidates: &[(&str, usize)] = if (character as u32) < buckets.len() as u32 {
                buckets[character as usize].as_slice()
            } else {
                &[]
            };

            for &(operator, length) in candidates {
                if index + length > region.end || !line.starts_with(index, operator) {
                    continue;
                }

                if let Some(slice) = coverage.get_mut(index..index + length) {
                    for slot in slice {
                        *slot = std::cmp::max(*slot, length);
                    }
                }
            }

            index += 1;
        }
    }

    coverage
}

/// Finds the positions of the requested symbols inside the code regions of a line.
///
/// Returns exactly one entry per distinct symbol, in first-seen order. The
/// positions of an entry are character indices.
pub fn find_symbol_positions(line: &Line, options: &FindOptions<'_>) -> Vec<(String, Vec<usize>)> {
    let mut positions: Vec<(String, Vec<usize>)> = Vec::with_capacity(options.symbols.len());

    for symbol in options.symbols {
        if !positions.iter().any(|(existing, _)| existing == symbol) {
            positions.push((symbol.clone(), Vec::new()));
        }
    }

    if options.symbols.is_empty() {
        return positions;
    }

    // Stable order: equal lengths keep their first-seen order, so the longest
    // symbol always wins a position it shares with a shorter one.
    let mut candidates: Vec<(&str, usize)> = options
        .symbols
        .iter()
        .map(|symbol| (symbol.as_str(), char_count(symbol)))
        .collect();
    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.1));

    let coverage = operator_coverage(line, options.regions, options.operators);
    let mut index = 0;

    while index < line.len() {
        let matched = candidates
            .iter()
            .copied()
            .find(|(candidate, _)| !candidate.is_empty() && line.starts_with(index, candidate));

        let Some((symbol, width)) = matched else {
            index += 1;
            continue;
        };

        let start = index;
        let end = index + width;

        if !is_inside_region(options.regions, start, end) {
            index += 1;
            continue;
        }

        if is_operator_symbol(symbol) && covered_by(&coverage, start, end) > width {
            index = end;
            continue;
        }

        if is_word_symbol(symbol) {
            let before = start
                .checked_sub(1)
                .and_then(|position| line.char_at(position));
            let after = line.char_at(end);

            if before.is_some_and(is_identifier_char) || after.is_some_and(is_identifier_char) {
                index = end;
                continue;
            }
        }

        if let Some((_, list)) = positions
            .iter_mut()
            .find(|(existing, _)| existing.as_str() == symbol)
        {
            list.push(start);
        }

        index = end;
    }

    if let Some(comment) = options.comment {
        let entry = positions
            .iter_mut()
            .find(|(existing, _)| existing.as_str() == comment.marker.as_str());

        if let Some((_, list)) = entry {
            list.push(comment.column);
        }
    }

    positions
}
