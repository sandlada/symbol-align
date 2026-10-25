//! Vertical alignment engine of the core.
//!
//! This module is a faithful port of `packages/core-ts/src/aligner.ts`. The
//! pipeline is kept one-to-one with the reference implementation: the
//! declaration pass first, then every configured group in the order it was
//! given, then every symbol, repeated until the output stops changing.
//!
//! # Positions and columns
//!
//! The scanner, finder and declaration locator report **character indices**.
//! Target columns and indentation are **UTF-16 columns**, exactly like the
//! JavaScript implementation, because alignment is a visual property (`😀`
//! occupies two columns). A position is therefore converted with
//! [`Line::column`] before it takes part in column arithmetic, while an
//! insertion keeps the character index unchanged.

use std::cmp::Ordering;

use crate::declarations::{DeclarationOptions, find_declaration_cells};
use crate::finder::{FindOptions, find_symbol_positions};
use crate::language::profile as language_profile;
use crate::line::{Line, is_js_whitespace, join_lines, split_lines};
use crate::scanner::scan_source;
use crate::types::{
    AlignOptions, AlignResult, AlignmentScope, CodeRegion, DeclarationAnchor, DeclarationCell,
    DeclarationStyle, LanguageProfile, LineComment, LineRange, ScanResult,
};

/// Default column difference that still joins one declaration column.
const DEFAULT_MAX_DECLARATION_PAD: f64 = 12.0;

/// Number of runs the fixpoint search performs before it gives up.
const FIXPOINT_LIMIT: usize = 5;

/// A run of spaces that has to be inserted into one line at an absolute
/// character index.
struct DeclarationInsertion {
    index: usize,
    offset: usize,
    width: usize,
}

/// The first occurrence of a symbol or a group on one line.
///
/// The value is a **character index**; [`Line::column`] turns it into the
/// UTF-16 column that the alignment arithmetic uses.
type Position = Option<usize>;

/// The outcome of a single alignment pass over one symbol or group.
struct SymbolPass {
    lines: Vec<Line>,
    /// The distinct lines the pass modified. The pipeline only consumes
    /// `lines`, but the bookkeeping mirrors the reference `SymbolPass`.
    #[allow(dead_code)]
    changed: Vec<usize>,
}

/// The window of effective starts that one declaration boundary aligns to.
struct StartWindow {
    /// First start that joins the column.
    lo: usize,
    /// Last start that joins the column, and the shared target.
    hi: usize,
}

/// Whether `character` can continue an identifier.
///
/// ASCII letters, digits and underscores always can; any other visible
/// character outside the ASCII range can as well, so a keyword prefix is never
/// claimed inside a longer Unicode identifier. Whitespace never continues one.
fn is_identifier_char(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || character == '_'
        || (character > '~' && !is_js_whitespace(character))
}

/// Pushes the current group, when it holds at least one line.
fn flush(groups: &mut Vec<Vec<usize>>, current: &mut Vec<usize>) {
    if !current.is_empty() {
        groups.push(std::mem::take(current));
    }
}

/// Clamps a range to the lines of the input.
///
/// A missing range covers the whole input; a range that starts before the
/// first line or ends behind the last one is trimmed. An explicitly empty
/// range aligns nothing.
fn normalize_range(range: Option<LineRange>, line_count: usize) -> LineRange {
    let Some(range) = range else {
        return LineRange {
            start: 0,
            end: line_count,
        };
    };

    let start = range.start.min(line_count);
    let end = range.end.clamp(start, line_count);

    LineRange { start, end }
}

/// Groups the line indices that are aligned together.
///
/// - `block` breaks groups at blank lines so that unrelated parts of a file
///   never influence each other.
/// - `indent` additionally breaks groups whenever the indentation changes, so
///   every nesting level keeps its own column.
/// - `file` aligns every line as one group.
///
/// Lines outside the given range never join a group.
fn group_indices(lines: &[Line], scope: AlignmentScope, range: LineRange) -> Vec<Vec<usize>> {
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut current: Vec<usize> = Vec::new();
    let mut current_indent: Option<usize> = None;

    for (index, line) in lines.iter().enumerate() {
        if !(range.start..range.end).contains(&index) {
            flush(&mut groups, &mut current);
            continue;
        }

        if scope == AlignmentScope::File {
            current.push(index);
            continue;
        }

        if line.is_blank() {
            flush(&mut groups, &mut current);
            current_indent = None;
            continue;
        }

        let indent = line.indent_column();

        if scope == AlignmentScope::Indent && current_indent.is_some_and(|value| value != indent) {
            flush(&mut groups, &mut current);
        }

        current_indent = Some(indent);
        current.push(index);
    }

    flush(&mut groups, &mut current);

    groups
}

/// The code regions of one line; a missing entry is an empty slice.
fn regions_at(scan: &ScanResult, index: usize) -> &[CodeRegion] {
    match scan.code_regions.get(index) {
        Some(regions) => regions.as_slice(),
        None => &[],
    }
}

/// The trailing line comment of one line, when the scan reported one.
fn comment_at(scan: &ScanResult, index: usize) -> Option<&LineComment> {
    scan.line_comments
        .get(index)
        .and_then(|comment| comment.as_ref())
}

/// Locates the first occurrence of a symbol on every line.
///
/// The scan is shared by every pass of one alignment run. Insertions shift the
/// regions and comments of the affected lines, so the shared scan always
/// describes the current line text without re-running the lexer.
fn locate_symbol(
    symbol: &str,
    profile: &LanguageProfile,
    scan: &ScanResult,
    lines: &[Line],
) -> Vec<Position> {
    let requested = [symbol.to_owned()];

    lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let positions = find_symbol_positions(
                line,
                &FindOptions {
                    regions: regions_at(scan, index),
                    symbols: &requested,
                    operators: &profile.operators,
                    comment: comment_at(scan, index),
                },
            );

            positions
                .iter()
                .find(|(name, _)| name.as_str() == symbol)
                .and_then(|(_, columns)| columns.first().copied())
        })
        .collect()
}

/// Locates the first occurrence of any member of a group on one line.
///
/// The minimum column of the group wins, so the member that appears first on a
/// line defines where the group column starts. The caller passes the code
/// regions and the line comment of the line, so the word boundary, operator
/// fragment and code region rules apply to every member exactly as they do to
/// a symbol.
fn first_group_column(
    group: &[String],
    line: &Line,
    regions: &[CodeRegion],
    comment: Option<&LineComment>,
    operators: &[String],
) -> Position {
    let positions = find_symbol_positions(
        line,
        &FindOptions {
            regions,
            symbols: group,
            operators,
            comment,
        },
    );

    group
        .iter()
        .filter_map(|member| {
            positions
                .iter()
                .find(|(name, _)| name == member)
                .and_then(|(_, columns)| columns.first().copied())
        })
        .min()
}

/// Locates the first occurrence of any member of a group on every line.
fn locate_group(
    group: &[String],
    profile: &LanguageProfile,
    scan: &ScanResult,
    lines: &[Line],
) -> Vec<Position> {
    lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            first_group_column(
                group,
                line,
                regions_at(scan, index),
                comment_at(scan, index),
                &profile.operators,
            )
        })
        .collect()
}

/// Locates the first occurrence of every group on every line with a single
/// scan.
///
/// The result is line-major: `columns[line][group]` is the position of the
/// first member of that group on the line, or `None` when no member occurs.
/// The finder rules are exactly those of [`locate_group`]; sharing the scan
/// keeps the conflict detection at one scan of the source instead of one scan
/// per group.
fn locate_groups(
    groups: &[Vec<String>],
    profile: &LanguageProfile,
    scan: &ScanResult,
    lines: &[Line],
) -> Vec<Vec<Position>> {
    let members = collect_members(groups);

    if members.is_empty() {
        return vec![vec![None; groups.len()]; lines.len()];
    }

    lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let positions = find_symbol_positions(
                line,
                &FindOptions {
                    regions: regions_at(scan, index),
                    symbols: &members,
                    operators: &profile.operators,
                    comment: comment_at(scan, index),
                },
            );

            groups
                .iter()
                .map(|group| {
                    group
                        .iter()
                        .filter_map(|member| {
                            positions
                                .iter()
                                .find(|(name, _)| name == member)
                                .and_then(|(_, columns)| columns.first().copied())
                        })
                        .min()
                })
                .collect()
        })
        .collect()
}

/// Removes the duplicate and empty members of a group.
fn normalize_group(group: &[String]) -> Vec<String> {
    let mut unique: Vec<String> = Vec::new();

    for member in group {
        if !member.is_empty() && !unique.contains(member) {
            unique.push(member.clone());
        }
    }

    unique
}

/// Every member of the configured groups, without duplicates.
fn collect_members(groups: &[Vec<String>]) -> Vec<String> {
    let mut members: Vec<String> = Vec::new();

    for group in groups {
        for member in group {
            if !members.contains(member) {
                members.push(member.clone());
            }
        }
    }

    members
}

/// Whether the lines of one scope group contradict the relative order of the
/// groups `left` and `right`.
///
/// Only the lines that carry *both* groups contribute: a group that is absent
/// from a line says nothing about the order of the pair. Two groups at the same
/// column never contradict each other either, because the padding cannot move
/// one past the other. The first line that fixes the direction decides it; any
/// later line that puts the pair the other way round is a conflict.
fn pair_conflicts(columns: &[Vec<Position>], indices: &[usize], left: usize, right: usize) -> bool {
    let mut direction: i8 = 0;

    for &index in indices {
        let Some(line) = columns.get(index) else {
            continue;
        };

        let (Some(left_column), Some(right_column)) = (
            line.get(left).copied().flatten(),
            line.get(right).copied().flatten(),
        ) else {
            continue;
        };

        let current = match left_column.cmp(&right_column) {
            Ordering::Less => -1,
            Ordering::Greater => 1,
            Ordering::Equal => 0,
        };

        if current == 0 {
            continue;
        }

        if direction == 0 {
            direction = current;
            continue;
        }

        if direction != current {
            return true;
        }
    }

    false
}

/// Whether any pair of groups changes its relative order inside one scope group.
fn scope_conflicts(columns: &[Vec<Position>], indices: &[usize], group_count: usize) -> bool {
    for left in 0..group_count.saturating_sub(1) {
        for right in (left + 1)..group_count {
            if pair_conflicts(columns, indices, left, right) {
                return true;
            }
        }
    }

    false
}

/// Whether two configured groups change their relative order between lines.
///
/// Every pair of groups is checked independently: the configuration conflicts
/// when one pair appears in one order on a line and in the opposite order on
/// another line of the same scope group. A group that occurs on only one line
/// never contradicts anything, and a third group that is present on one line
/// only cannot turn a consistent pair into a conflict.
///
/// The detection is independent of the first-column exclusion of
/// [`align_group`]: a member at the indentation still defines the order. Two
/// lines that belong to different scope groups never conflict with each other,
/// because only the lines of one scope group are compared.
fn groups_conflict(
    lines: &[Line],
    groups: &[Vec<String>],
    profile: &LanguageProfile,
    scope: AlignmentScope,
    range: LineRange,
    scan: &ScanResult,
) -> bool {
    if groups.len() < 2 {
        return false;
    }

    let columns = locate_groups(groups, profile, scan, lines);

    group_indices(lines, scope, range)
        .iter()
        .any(|indices| scope_conflicts(&columns, indices, groups.len()))
}

/// Right-most column at which the symbol occurs inside a group.
fn target_column(lines: &[Line], positions: &[Position], members: &[usize]) -> usize {
    members
        .iter()
        .filter_map(|&index| -> Option<usize> {
            let position = positions.get(index).copied().flatten()?;
            let line = lines.get(index)?;

            Some(line.column(position))
        })
        .max()
        .unwrap_or(0)
}

/// Pads every member of the group so the symbol starts at the target column.
fn pad_to_target_column(
    lines: &[Line],
    positions: &[Position],
    members: &[usize],
) -> (Vec<Line>, Vec<usize>, Vec<DeclarationInsertion>) {
    let target = target_column(lines, positions, members);
    let mut padded = lines.to_vec();
    let mut changed: Vec<usize> = Vec::new();
    let mut insertions: Vec<DeclarationInsertion> = Vec::new();

    for &index in members {
        let Some(position) = positions.get(index).copied().flatten() else {
            continue;
        };

        let Some(line) = lines.get(index) else {
            continue;
        };

        let column = line.column(position);

        if column >= target {
            continue;
        }

        if let Some(slot) = padded.get_mut(index) {
            let width = target - column;
            let next = slot.insert_spaces(position, width);
            *slot = next;
            changed.push(index);
            insertions.push(DeclarationInsertion {
                index,
                offset: position,
                width,
            });
        }
    }

    (padded, changed, insertions)
}

/// Aligns the content that follows a prefix keyword.
///
/// When a symbol acts as a prefix (`readonly `, `export `, …) the lines that do
/// not carry the keyword are padded so their content starts at the same column
/// as the content of the lines that do.
fn pad_after_prefix_keyword(
    symbol: &str,
    lines: &[Line],
    positions: &[Position],
    group: &[usize],
) -> (Vec<Line>, Vec<usize>, Vec<DeclarationInsertion>) {
    let holders: Vec<usize> = group
        .iter()
        .copied()
        .filter(|&index| positions.get(index).copied().flatten().is_some())
        .collect();
    let without_symbol: Vec<usize> = group
        .iter()
        .copied()
        .filter(|&index| {
            positions.get(index).copied().flatten().is_none()
                && lines.get(index).is_some_and(|line| !line.is_blank())
        })
        .collect();

    if holders.is_empty() || without_symbol.is_empty() {
        return (lines.to_vec(), Vec::new(), Vec::new());
    }

    // The keyword boundary is a character position: `line.indent()` is the
    // character index of the first non-whitespace character and the symbol
    // width is its character count. Only the target indentation below is a
    // UTF-16 column.
    let width = symbol.chars().count();
    let all_prefix = holders.iter().all(|&index| {
        let Some(line) = lines.get(index) else {
            return false;
        };

        let trimmed = line.text_from(line.indent());

        if !trimmed.starts_with(symbol) {
            return false;
        }

        if trimmed.chars().count() == width {
            return true;
        }

        trimmed
            .chars()
            .nth(width)
            .is_none_or(|character| !is_identifier_char(character))
    });

    if !all_prefix {
        return (lines.to_vec(), Vec::new(), Vec::new());
    }

    let Some(symbol_indent) = holders
        .first()
        .and_then(|&index| lines.get(index).map(Line::indent_column))
    else {
        return (lines.to_vec(), Vec::new(), Vec::new());
    };

    if !holders.iter().all(|&index| {
        lines
            .get(index)
            .is_some_and(|line| line.indent_column() == symbol_indent)
    }) {
        return (lines.to_vec(), Vec::new(), Vec::new());
    }

    let target_indent = target_column(lines, positions, &holders) + width + 1;
    let mut padded = lines.to_vec();
    let mut changed: Vec<usize> = Vec::new();
    let mut insertions: Vec<DeclarationInsertion> = Vec::new();

    for &index in &without_symbol {
        let Some(line) = lines.get(index) else {
            continue;
        };

        let indent = line.indent_column();

        if indent != symbol_indent {
            continue;
        }

        let needed = target_indent.saturating_sub(indent);

        if needed == 0 {
            continue;
        }

        if let Some(slot) = padded.get_mut(index) {
            let next = slot.prepend_spaces(needed);
            *slot = next;
            changed.push(index);
            insertions.push(DeclarationInsertion {
                index,
                offset: 0,
                width: needed,
            });
        }
    }

    (padded, changed, insertions)
}

/// Turns `max_declaration_pad` into the effective limit.
fn declaration_pad_limit(max_pad: Option<f64>) -> f64 {
    let value = max_pad.unwrap_or(DEFAULT_MAX_DECLARATION_PAD);

    if value.is_finite() && value >= 1.0 {
        value
    } else {
        f64::INFINITY
    }
}

/// Start column of the cell at `cell_index`, or `None` for a missing cell.
fn cell_start(line: &Line, cells: Option<&[DeclarationCell]>, cell_index: usize) -> Option<usize> {
    let cell = cells?.get(cell_index)?;

    Some(line.column(cell.start))
}

/// Finds the window of effective starts that covers the most declaration lines.
///
/// A window is a contiguous range of the sorted starts whose ends are at most
/// `limit` apart. The widest cluster wins, so one long generic type cannot set
/// the target of a block of ordinary declarations: the outlier keeps its column
/// and the majority still lines up.
///
/// Windows that cover the same number of lines resolve to the right-most one
/// (the larger `hi`), which is the column the previous max-based target picked
/// whenever every line was inside the limit. Sorting is the only super-linear
/// step; the window itself is a single two-pointer sweep.
fn largest_start_window(starts: &[Position], limit: f64) -> Option<StartWindow> {
    let mut sorted: Vec<usize> = starts.iter().flatten().copied().collect();
    sorted.sort_unstable();

    let mut left = 0;
    let mut members = 0;
    let mut window: Option<StartWindow> = None;

    for (right, &hi) in sorted.iter().enumerate() {
        while left < right && (hi - sorted[left]) as f64 > limit {
            left += 1;
        }

        let covered = right - left + 1;

        if window.is_none() || covered >= members {
            members = covered;
            window = Some(StartWindow {
                lo: sorted[left],
                hi,
            });
        }
    }

    window
}

/// Shape of the cells of a line, e.g. `modifiers|type|name` — the partition key
/// beside the indent.
fn cell_signature(cells: &[DeclarationCell]) -> String {
    let mut signature = cells
        .first()
        .map_or("", |cell| cell.kind.as_str())
        .to_owned();

    for cell in cells.iter().skip(1) {
        signature.push('|');
        signature.push_str(cell.kind.as_str());
    }

    signature
}

/// Marks the declaration lines whose prefix contains a group member.
///
/// The declaration pass pads the gaps between the cells; a group pass pads in
/// front of the first occurrence of a member. When a member sits inside the
/// declaration prefix both passes shift the target of the other one, so the
/// fixpoint climbs instead of settling. Such a line is left out of the
/// declaration partitions and keeps the column that the group pass chose.
///
/// The prefix is the half-open range from the first declaration cell to the end
/// of the name cell. `findSymbolPositions` applies the same word boundary,
/// operator fragment and code region rules as the group pass, so a member that
/// is only a fragment of a longer operator or identifier never triggers the
/// exclusion.
fn declaration_exclusions(
    lines: &[Line],
    located: &[Option<Vec<DeclarationCell>>],
    members: &[String],
    profile: &LanguageProfile,
    scan: &ScanResult,
) -> Vec<bool> {
    lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let Some(cells) = located.get(index).and_then(|cells| cells.as_ref()) else {
                return false;
            };

            if cells.len() < 2 {
                return false;
            }

            let Some(first) = cells.first() else {
                return false;
            };

            let Some(name) = cells.last() else {
                return false;
            };

            let regions: Vec<CodeRegion> = regions_at(scan, index)
                .iter()
                .filter_map(|region| {
                    let start = region.start.max(first.start);
                    let end = region.end.min(name.end);

                    (start < end).then_some(CodeRegion { start, end })
                })
                .collect();

            if regions.is_empty() {
                return false;
            }

            let positions = find_symbol_positions(
                line,
                &FindOptions {
                    regions: &regions,
                    symbols: members,
                    operators: &profile.operators,
                    comment: None,
                },
            );

            positions.iter().any(|(_, columns)| !columns.is_empty())
        })
        .collect()
}

/// Splits the base groups by indentation and declaration shape.
///
/// Every line is pushed into its bucket once and every bucket becomes one
/// partition, so the work stays linear in the number of lines. Lines that a
/// configured group has claimed are skipped, so the two passes never move each
/// other's target.
fn declaration_partitions(
    lines: &[Line],
    groups: &[Vec<usize>],
    located: &[Option<Vec<DeclarationCell>>],
    excluded: Option<&[bool]>,
) -> Vec<Vec<usize>> {
    let mut partitions: Vec<Vec<usize>> = Vec::new();

    for group in groups {
        let mut buckets: Vec<(String, Vec<usize>)> = Vec::new();

        for &index in group {
            if excluded
                .and_then(|excluded| excluded.get(index))
                .copied()
                .unwrap_or(false)
            {
                continue;
            }

            let Some(cells) = located.get(index).and_then(|cells| cells.as_ref()) else {
                continue;
            };

            if cells.len() < 2 {
                continue;
            }

            let Some(line) = lines.get(index) else {
                continue;
            };

            let key = format!("{}|{}", line.indent_column(), cell_signature(cells));

            match buckets.iter().position(|(candidate, _)| candidate == &key) {
                Some(position) => {
                    if let Some((_, bucket)) = buckets.get_mut(position) {
                        bucket.push(index);
                    }
                }
                None => buckets.push((key, vec![index])),
            }
        }

        partitions.extend(buckets.into_iter().map(|(_, bucket)| bucket));
    }

    partitions
}

/// Aligns the declaration columns of one partition.
///
/// Boundaries are processed from left to right. `shifts[position]` holds the
/// number of spaces that were already inserted into that line before the
/// current boundary, so every delta is measured on the *effective* start of the
/// cell.
///
/// Every boundary aligns to its largest cluster of effective starts: the window
/// `[lo, hi]` at most `limit` wide that covers the most lines. Only the lines
/// inside that window are padded, up to `hi`. A single long generic type is
/// therefore the outlier that keeps its column, instead of becoming the target
/// that excludes every ordinary line.
///
/// The name column is invariant to which gap absorbs the padding. With the
/// `end` anchor a boundary therefore pads in front of the preceding cell and
/// leaves the name target intact. Boundary 0 is skipped for `end`: the first
/// cell starts at the indentation, and padding in front of it would change the
/// indentation of the line.
///
/// Insertions are recorded at the original character index of the cell edge.
/// They are applied from the right edge of a line, so an earlier insertion
/// carries the later ones along with the text exactly as the `shift`
/// accumulator predicts for the next boundary.
fn align_declaration_partition(
    lines: &[Line],
    partition: &[usize],
    located: &[Option<Vec<DeclarationCell>>],
    anchor: DeclarationAnchor,
    limit: f64,
) -> Vec<DeclarationInsertion> {
    let cell_count = partition
        .first()
        .and_then(|&index| located.get(index))
        .and_then(|cells| cells.as_ref())
        .map_or(0, |cells| cells.len());
    let mut shifts: Vec<usize> = vec![0; partition.len()];
    let mut insertions: Vec<DeclarationInsertion> = Vec::new();

    for boundary in 0..cell_count.saturating_sub(1) {
        if boundary == 0 && anchor == DeclarationAnchor::End {
            continue;
        }

        let starts: Vec<Position> = partition
            .iter()
            .enumerate()
            .map(|(position, &index)| -> Position {
                let line = lines.get(index)?;
                let cells = located
                    .get(index)
                    .and_then(|cells| cells.as_ref())
                    .map(|cells| cells.as_slice());

                cell_start(line, cells, boundary + 1).map(|start| start + shifts[position])
            })
            .collect();

        let Some(window) = largest_start_window(&starts, limit) else {
            continue;
        };

        for (position, &index) in partition.iter().enumerate() {
            let Some(start) = starts[position] else {
                continue;
            };

            if !(window.lo..=window.hi).contains(&start) {
                continue;
            }

            let delta = window.hi - start;

            if delta == 0 {
                continue;
            }

            let Some(cell) = located
                .get(index)
                .and_then(|cells| cells.as_ref())
                .and_then(|cells| cells.get(boundary))
            else {
                continue;
            };

            let offset = match anchor {
                DeclarationAnchor::Start => cell.end,
                DeclarationAnchor::End => cell.start,
            };

            insertions.push(DeclarationInsertion {
                index,
                offset,
                width: delta,
            });
            shifts[position] += delta;
        }
    }

    insertions
}

/// Applies the insertions of every partition, from the right edge of each line.
fn apply_declaration_insertions(lines: &[Line], insertions: &[DeclarationInsertion]) -> Vec<Line> {
    let mut by_line: Vec<Vec<(usize, usize)>> = vec![Vec::new(); lines.len()];

    for insertion in insertions {
        if let Some(list) = by_line.get_mut(insertion.index) {
            list.push((insertion.offset, insertion.width));
        }
    }

    lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let mut list = by_line.get(index).cloned().unwrap_or_default();

            if list.is_empty() {
                return line.clone();
            }

            list.sort_by_key(|&(offset, _)| std::cmp::Reverse(offset));

            list.iter().fold(line.clone(), |text, &(offset, width)| {
                text.insert_spaces(offset, width)
            })
        })
        .collect()
}

/// Shifts the shared scan after a pass inserted spaces.
///
/// The scanner's regions and line comments are char-index ranges into the line
/// text. Inserting spaces in a code region cannot change the lexical structure
/// (a space never creates or splits a string delimiter or a comment marker),
/// so the ranges only have to move with the inserted text. A start at the
/// insertion offset shifts with the spaces; an end at the offset does not,
/// because the spaces sit behind the code.
fn shift_scan(scan: &mut ScanResult, insertions: &[DeclarationInsertion]) {
    if insertions.is_empty() {
        return;
    }

    let mut by_line: Vec<Vec<(usize, usize)>> = vec![Vec::new(); scan.code_regions.len()];

    for insertion in insertions {
        if let Some(list) = by_line.get_mut(insertion.index) {
            list.push((insertion.offset, insertion.width));
        }
    }

    for (line_index, mut list) in by_line.into_iter().enumerate() {
        if list.is_empty() {
            continue;
        }

        list.sort_unstable_by_key(|(offset, _)| *offset);

        let shifted = |position: usize, inclusive: bool| -> usize {
            let mut width = 0;

            for &(offset, amount) in &list {
                if offset < position || (inclusive && offset == position) {
                    width += amount;
                } else {
                    break;
                }
            }

            position + width
        };

        if let Some(regions) = scan.code_regions.get_mut(line_index) {
            for region in regions {
                region.start = shifted(region.start, true);
                region.end = shifted(region.end, false);
            }
        }

        if let Some(Some(comment)) = scan.line_comments.get_mut(line_index) {
            comment.column = shifted(comment.column, true);
        }
    }
}

/// Aligns the declaration columns of every line.
///
/// The pass is the first stage of every fixpoint iteration. It only inserts
/// spaces, never touches indentation and stays a no-op when the profile has no
/// declaration style or the caller disabled declarations.
///
/// When groups are configured, a declaration line whose prefix carries a group
/// member is excluded from the partitions: the group pass pads in front of that
/// member, which would move the declaration target, and the declaration pass
/// would move the group target in turn. With the line excluded the group owns
/// its column and the pass reaches a fixpoint. Without groups the exclusions
/// are never computed, so `declarations: false` and the no-group output are
/// unchanged.
fn align_declarations(
    profile: &LanguageProfile,
    scope: AlignmentScope,
    range: LineRange,
    options: &AlignOptions,
    groups: &[Vec<String>],
    lines: &[Line],
    scan: &ScanResult,
) -> (Vec<Line>, Vec<DeclarationInsertion>) {
    if profile.declarations == DeclarationStyle::None || options.declarations == Some(false) {
        return (lines.to_vec(), Vec::new());
    }

    let located: Vec<Option<Vec<DeclarationCell>>> = lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            find_declaration_cells(
                line,
                &DeclarationOptions {
                    regions: regions_at(scan, index),
                    style: profile.declarations,
                },
            )
        })
        .collect();
    let members = collect_members(groups);
    let excluded = if members.is_empty() {
        None
    } else {
        Some(declaration_exclusions(
            lines, &located, &members, profile, scan,
        ))
    };
    let partitions = declaration_partitions(
        lines,
        &group_indices(lines, scope, range),
        &located,
        excluded.as_deref(),
    );

    if partitions.is_empty() {
        return (lines.to_vec(), Vec::new());
    }

    let anchor = options
        .declaration_anchor
        .unwrap_or(DeclarationAnchor::Start);
    let limit = declaration_pad_limit(options.max_declaration_pad);
    let insertions: Vec<DeclarationInsertion> = partitions
        .iter()
        .flat_map(|partition| {
            align_declaration_partition(lines, partition, &located, anchor, limit)
        })
        .collect();

    if insertions.is_empty() {
        (lines.to_vec(), Vec::new())
    } else {
        (apply_declaration_insertions(lines, &insertions), insertions)
    }
}

/// Adds `indices` to `changed`, keeping the first insertion order.
fn add_changed(changed: &mut Vec<usize>, indices: &[usize]) {
    for &index in indices {
        if !changed.contains(&index) {
            changed.push(index);
        }
    }
}

/// Runs one alignment pass for a single symbol.
fn align_symbol(
    symbol: &str,
    profile: &LanguageProfile,
    scope: AlignmentScope,
    range: LineRange,
    scan: &ScanResult,
    lines: &[Line],
) -> (SymbolPass, Vec<DeclarationInsertion>) {
    let positions = locate_symbol(symbol, profile, scan, lines);
    let scope_groups = group_indices(lines, scope, range);
    let mut changed: Vec<usize> = Vec::new();
    let mut current = lines.to_vec();
    let mut insertions: Vec<DeclarationInsertion> = Vec::new();

    for group in &scope_groups {
        let holders: Vec<usize> = group
            .iter()
            .copied()
            .filter(|&index| positions.get(index).copied().flatten().is_some())
            .collect();

        if holders.is_empty() {
            continue;
        }

        let padded = pad_to_target_column(&current, &positions, &holders);
        let prefixed = pad_after_prefix_keyword(symbol, &padded.0, &positions, group);

        current = prefixed.0;
        add_changed(&mut changed, &padded.1);
        add_changed(&mut changed, &prefixed.1);
        insertions.extend(padded.2);
        insertions.extend(prefixed.2);
    }

    (
        SymbolPass {
            lines: current,
            changed,
        },
        insertions,
    )
}

/// Whether a line joins the column of a group.
///
/// A member that starts at the indentation would be padded in front of the
/// first visible character, which changes the indentation of the line. Such a
/// line is neither measured nor padded, so a group never changes the
/// indentation and the `indent` groups of the next fixpoint iteration stay the
/// same.
fn is_group_holder(lines: &[Line], positions: &[Position], index: usize) -> bool {
    let Some(position) = positions.get(index).copied().flatten() else {
        return false;
    };

    lines
        .get(index)
        .is_some_and(|line| line.column(position) > line.indent_column())
}

/// Runs one alignment pass for a group of alternative tokens.
///
/// The first occurrence of any member is located on every line; the lines whose
/// member starts behind the indentation are padded to the right-most column of
/// the group. A member in the first column of a line never participates,
/// because padding in front of it would change the indentation of that line and
/// split the line off its `indent` group. The pass reuses
/// [`pad_to_target_column`], so only spaces are inserted and a line that does
/// not carry a member is never touched.
fn align_group(
    group: &[String],
    profile: &LanguageProfile,
    scope: AlignmentScope,
    range: LineRange,
    scan: &ScanResult,
    lines: &[Line],
) -> (SymbolPass, Vec<DeclarationInsertion>) {
    let positions = locate_group(group, profile, scan, lines);
    let scope_groups = group_indices(lines, scope, range);
    let mut changed: Vec<usize> = Vec::new();
    let mut current = lines.to_vec();
    let mut insertions: Vec<DeclarationInsertion> = Vec::new();

    for indices in &scope_groups {
        // The same predicate guards the target and the padding, because
        // `pad_to_target_column` only pads the holders it is given.
        let holders: Vec<usize> = indices
            .iter()
            .copied()
            .filter(|&index| is_group_holder(lines, &positions, index))
            .collect();

        if holders.is_empty() {
            continue;
        }

        let padded = pad_to_target_column(&current, &positions, &holders);

        current = padded.0;
        add_changed(&mut changed, &padded.1);
        insertions.extend(padded.2);
    }

    (
        SymbolPass {
            lines: current,
            changed,
        },
        insertions,
    )
}

/// Determines in which order the symbols are aligned.
///
/// Symbols are processed by the position of their first occurrence, so the
/// leading `=` of a block is aligned before a trailing `:`.
fn order_by_first_occurrence(
    symbols: &[String],
    profile: &LanguageProfile,
    range: LineRange,
    scan: &ScanResult,
    lines: &[Line],
) -> Vec<String> {
    let mut occurrences: Vec<(String, (usize, usize))> = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        if occurrences.len() == symbols.len() {
            break;
        }

        if !(range.start..range.end).contains(&index) {
            continue;
        }

        let positions = find_symbol_positions(
            line,
            &FindOptions {
                regions: regions_at(scan, index),
                symbols,
                operators: &profile.operators,
                comment: comment_at(scan, index),
            },
        );

        for (symbol, columns) in positions {
            if columns.is_empty() || occurrences.iter().any(|(seen, _)| *seen == symbol) {
                continue;
            }

            let Some(&first) = columns.first() else {
                continue;
            };

            occurrences.push((symbol, (index, line.column(first))));
        }
    }

    let occurrence_of = |symbol: &str| {
        occurrences
            .iter()
            .find(|(seen, _)| seen.as_str() == symbol)
            .map(|(_, occurrence)| *occurrence)
    };

    let mut ordered = symbols.to_vec();
    ordered.sort_by(
        |left, right| match (occurrence_of(left), occurrence_of(right)) {
            (Some(left), Some(right)) => left.0.cmp(&right.0).then(left.1.cmp(&right.1)),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        },
    );

    ordered
}

/// Whether two line arrays hold the same text.
fn same_lines(left: &[Line], right: &[Line]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .all(|(left, right)| left.chars == right.chars)
}

/// Distinct lines that differ from the original input.
fn changed_against(original: &[Line], final_lines: &[Line]) -> usize {
    final_lines
        .iter()
        .enumerate()
        .filter(|(index, line)| {
            original
                .get(*index)
                .is_none_or(|reference| reference.chars != line.chars)
        })
        .count()
}

/// The pass sequence of one alignment run.
struct Pipeline<'a> {
    profile: &'a LanguageProfile,
    scope: AlignmentScope,
    range: LineRange,
    options: &'a AlignOptions,
    groups: &'a [Vec<String>],
}

impl Pipeline<'_> {
    /// Runs one full sequence of declaration, group and symbol passes over
    /// `input` with the shared scan.
    fn run_passes(&self, symbols: &[String], input: &[Line], scan: &mut ScanResult) -> Vec<Line> {
        let (mut current, declaration_insertions) = align_declarations(
            self.profile,
            self.scope,
            self.range,
            self.options,
            self.groups,
            input,
            scan,
        );
        shift_scan(scan, &declaration_insertions);

        for group in self.groups {
            let (pass, insertions) =
                align_group(group, self.profile, self.scope, self.range, scan, &current);
            shift_scan(scan, &insertions);
            current = pass.lines;
        }

        for symbol in symbols {
            let (pass, insertions) =
                align_symbol(symbol, self.profile, self.scope, self.range, scan, &current);
            shift_scan(scan, &insertions);
            current = pass.lines;
        }

        current
    }

    /// Repeats [`Self::run_passes`] until the output stops changing.
    ///
    /// Returns `None` when no fixpoint is reached within `limit` runs.
    fn to_fixpoint(
        &self,
        symbols: &[String],
        input: &[Line],
        limit: usize,
        scan: &mut ScanResult,
    ) -> Option<Vec<Line>> {
        let mut current = input.to_vec();

        for _ in 0..limit {
            let next = self.run_passes(symbols, &current, scan);

            if same_lines(&next, &current) {
                return Some(next);
            }

            current = next;
        }

        None
    }
}

/// Aligns the punctuation symbols of a code snippet.
///
/// The passes run to a fixpoint so a single call never returns a result that
/// would change again on a second run. A conflicting symbol order (for example
/// `=` before `:` on one line but `:` before `=` on another) can ratchet the
/// columns wider on every run; when no fixpoint is reached the aligner falls
/// back to the leading symbol only, which is always stable. A single symbol
/// that still moves after several passes (prefix padding combined with the
/// `indent` scope can climb) falls back to leaving the input untouched.
/// Configurations whose groups change their relative order between the lines
/// of one scope group are detected before the first pass and return the input
/// unchanged. Under-aligning is always preferred over mutating string content
/// or diverging.
pub fn align(code: &str, options: &AlignOptions) -> AlignResult {
    let profile = language_profile(options.language.as_deref().unwrap_or("generic"));
    let groups: Vec<Vec<String>> = options
        .groups
        .iter()
        .map(|group| normalize_group(group.as_slice()))
        .filter(|group| !group.is_empty())
        .collect();
    let members = collect_members(&groups);
    let symbols: Vec<String> = options
        .symbols
        .as_ref()
        .unwrap_or(&profile.default_symbols)
        .iter()
        .filter(|symbol| !members.contains(*symbol))
        .cloned()
        .collect();
    let scope = options.scope.unwrap_or(AlignmentScope::Block);
    let lines = split_lines(code);
    let range = normalize_range(options.range, lines.len());

    if symbols.is_empty() && groups.is_empty() {
        return AlignResult {
            code: code.to_owned(),
            changes: 0,
        };
    }

    let initial_scan = scan_source(&join_lines(&lines), &profile);

    if groups_conflict(&lines, &groups, &profile, scope, range, &initial_scan) {
        return AlignResult {
            code: code.to_owned(),
            changes: 0,
        };
    }

    let ordered = order_by_first_occurrence(&symbols, &profile, range, &initial_scan, &lines);
    let pipeline = Pipeline {
        profile: &profile,
        scope,
        range,
        options,
        groups: &groups,
    };
    let mut scan = initial_scan.clone();

    if let Some(stable) = pipeline.to_fixpoint(&ordered, &lines, FIXPOINT_LIMIT, &mut scan) {
        let changes = changed_against(&lines, &stable);

        return AlignResult {
            code: join_lines(&stable),
            changes,
        };
    }

    let leading = if ordered.len() > 1 {
        let mut leading_scan = initial_scan;

        pipeline.to_fixpoint(&ordered[..1], &lines, FIXPOINT_LIMIT, &mut leading_scan)
    } else {
        None
    };

    if let Some(leading) = leading {
        let changes = changed_against(&lines, &leading);

        return AlignResult {
            code: join_lines(&leading),
            changes,
        };
    }

    AlignResult {
        code: code.to_owned(),
        changes: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_range_clamps_to_the_input() {
        assert_eq!(normalize_range(None, 4), LineRange { start: 0, end: 4 });
        assert_eq!(
            normalize_range(Some(LineRange { start: 2, end: 9 }), 4),
            LineRange { start: 2, end: 4 }
        );
        assert_eq!(
            normalize_range(Some(LineRange { start: 9, end: 1 }), 4),
            LineRange { start: 4, end: 4 }
        );
    }

    #[test]
    fn normalize_group_drops_empty_and_duplicate_members() {
        let group = [
            "=".to_owned(),
            String::new(),
            "=".to_owned(),
            ":".to_owned(),
        ];

        assert_eq!(
            normalize_group(&group),
            vec!["=".to_owned(), ":".to_owned()]
        );
    }

    #[test]
    fn largest_start_window_prefers_the_widest_cluster() {
        let starts = [Some(0), Some(20), Some(1)];

        assert_eq!(
            largest_start_window(&starts, 12.0).map(|window| (window.lo, window.hi)),
            Some((0, 1))
        );
    }

    #[test]
    fn largest_start_window_prefers_the_right_most_window_on_a_tie() {
        let starts = [Some(0), Some(5), Some(10)];

        assert_eq!(
            largest_start_window(&starts, 5.0).map(|window| (window.lo, window.hi)),
            Some((5, 10))
        );
    }

    #[test]
    fn declaration_pad_limit_defaults_and_limits() {
        assert_eq!(declaration_pad_limit(None), 12.0);
        assert_eq!(declaration_pad_limit(Some(0.5)), f64::INFINITY);
        assert_eq!(declaration_pad_limit(Some(f64::NAN)), f64::INFINITY);
        assert_eq!(declaration_pad_limit(Some(4.0)), 4.0);
    }

    #[test]
    fn group_indices_split_blocks_and_indents() {
        let lines: Vec<Line> = ["a = 1", "", "  b = 2", "  c = 3", "d = 4"]
            .iter()
            .map(|line| Line::new(line))
            .collect();
        let range = LineRange {
            start: 0,
            end: lines.len(),
        };

        assert_eq!(
            group_indices(&lines, AlignmentScope::Block, range),
            vec![vec![0], vec![2, 3, 4]]
        );
        assert_eq!(
            group_indices(&lines, AlignmentScope::Indent, range),
            vec![vec![0], vec![2, 3], vec![4]]
        );
        assert_eq!(
            group_indices(&lines, AlignmentScope::File, range),
            vec![vec![0, 1, 2, 3, 4]]
        );
    }
}
