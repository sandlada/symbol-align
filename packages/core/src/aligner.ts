import { findDeclarationCells } from './declarations.js';
import { findSymbolPositions } from './finder.js';
import { languageProfile } from './language.js';
import { scanSource } from './scanner.js';
import type { AlignGroup, AlignmentScope, AlignOptions, AlignResult, AlignSymbol, DeclarationAnchor, DeclarationCell, LanguageId, LanguageProfile, LineRange, ScanResult } from './types.js';

/** A run of spaces that has to be inserted into one line at an absolute column. */
interface DeclarationInsertion {
    readonly index: number;
    readonly offset: number;
    readonly width: number;
}

/** A line index together with the column of the symbol that is being aligned. */
interface LineColumn {
    readonly index: number;
    readonly column: number | null;
}

/** The outcome of a single alignment pass over one symbol. */
interface SymbolPass {
    readonly lines: readonly string[];
    readonly changed: readonly number[];
}

/** Position of the first occurrence of a symbol, used to order the passes. */
interface FirstOccurrence {
    readonly line: number;
    readonly column: number;
}

/** Matches a word character (letter, digit, or underscore). */
const WORD_CHARACTER = /[a-zA-Z0-9_]/;

/**
 * Whether `character` can continue an identifier.
 *
 * ASCII letters, digits and underscores always can; any other visible
 * character outside the ASCII range can as well, so a keyword prefix is never
 * claimed inside a longer Unicode identifier. Whitespace never continues one.
 */
const isIdentifierChar = (character: string): boolean => WORD_CHARACTER.test(character) || (character > '~' && character.trim().length > 0);

/** Splits source code into lines, keeping empty lines. */
const splitLines = (code: string): readonly string[] => code.split('\n');

/** Whether a line carries no content at all. */
const isBlank = (line: string): boolean => line.trim().length === 0;

/** Number of leading whitespace characters of a line. */
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** Inserts spaces at a column without touching anything else. */
const insertSpaces = (line: string, column: number, count: number): string => `${line.slice(0, column)}${' '.repeat(count)}${line.slice(column)}`;

/**
 * Clamps a range to the lines of the input.
 *
 * A missing range covers the whole input; a range that starts before the
 * first line or ends behind the last one is trimmed. An explicitly empty
 * range aligns nothing.
 */
const normalizeRange = (range: LineRange | undefined, lineCount: number): LineRange => {
    if (range === undefined) {
        return { start: 0, end: lineCount };
    }

    const start = Math.max(0, Math.min(range.start, lineCount));
    const end = Math.max(start, Math.min(range.end, lineCount));

    return { start, end };
};

/**
 * Groups the line indices that are aligned together.
 *
 * - `block` breaks groups at blank lines so that unrelated parts of a file
 *   never influence each other.
 * - `indent` additionally breaks groups whenever the indentation changes, so
 *   every nesting level keeps its own column.
 * - `file` aligns every line as one group.
 *
 * Lines outside the given range never join a group.
 */
const groupIndices = (lines: readonly string[], scope: AlignmentScope, range: LineRange): readonly (readonly number[])[] => {
    const groups: number[][] = [];
    let current: number[] = [];
    let currentIndent = -1;

    const flush = (): void => {
        if (current.length > 0) {
            groups.push(current);
            current = [];
        }
    };

    lines.forEach((line, index) => {
        if (index < range.start || index >= range.end) {
            flush();
            return;
        }

        if (scope === 'file') {
            current.push(index);
            return;
        }

        if (isBlank(line)) {
            flush();
            currentIndent = -1;
            return;
        }

        const indent = indentOf(line);

        if (scope === 'indent' && currentIndent !== -1 && indent !== currentIndent) {
            flush();
        }

        currentIndent = indent;
        current.push(index);
    });

    flush();

    return groups;
};

/**
 * Locates the first occurrence of a symbol on every line.
 *
 * The scan is redone for every pass because earlier passes insert spaces and
 * therefore shift the columns of the symbols that come later.
 */
const locateSymbol =
    (symbol: AlignSymbol, profile: LanguageProfile) =>
    (lines: readonly string[]): readonly LineColumn[] => {
        const scan = scanSource(lines.join('\n'))(profile);

        return lines.map((line, index) => {
            const positions = findSymbolPositions(line)({
                regions: scan.codeRegions[index] ?? [],
                symbols: [symbol],
                operators: profile.operators,
                comment: scan.lineComments[index],
            });

            const columns = positions.get(symbol) ?? [];

            return { index, column: columns.length > 0 ? columns[0] : null };
        });
    };

/**
 * Locates the first occurrence of any member of a group on every line.
 *
 * The minimum column of the group wins, so the member that appears first on a
 * line defines where the group column starts. The scan runs through
 * `findSymbolPositions`, which means the word boundary, operator fragment and
 * code region rules apply to every member exactly as they do to a symbol.
 */
const locateGroup =
    (group: AlignGroup, profile: LanguageProfile) =>
    (lines: readonly string[]): readonly LineColumn[] => {
        const scan = scanSource(lines.join('\n'))(profile);

        return lines.map((line, index) => {
            const positions = findSymbolPositions(line)({
                regions: scan.codeRegions[index] ?? [],
                symbols: group,
                operators: profile.operators,
                comment: scan.lineComments[index],
            });

            const column = group.reduce<number | null>((first, member) => {
                const memberColumn = positions.get(member)?.[0] ?? null;

                if (memberColumn === null) {
                    return first;
                }

                return first === null ? memberColumn : Math.min(first, memberColumn);
            }, null);

            return { index, column };
        });
    };

/** Removes the duplicate and empty members of a group; the `Set` is a performance normalization only, because duplicate members are already harmless. */
const normalizeGroup = (group: AlignGroup): readonly AlignSymbol[] => [...new Set(group)].filter((member) => member.length > 0);

/** Right-most column at which the symbol occurs inside a group. */
const targetColumn = (columns: readonly LineColumn[], members: readonly number[]): number => members.reduce((target, index) => Math.max(target, columns[index]?.column ?? 0), 0);

/** Pads every member of the group so the symbol starts at the target column. */
const padToTargetColumn = (lines: readonly string[], columns: readonly LineColumn[], members: readonly number[]): { readonly lines: readonly string[]; readonly changed: readonly number[] } => {
    const target = targetColumn(columns, members);
    const padded = [...lines];
    const changed: number[] = [];

    members.forEach((index) => {
        const column = columns[index]?.column ?? null;
        if (column === null || column >= target) {
            return;
        }
        padded[index] = insertSpaces(padded[index], column, target - column);
        changed.push(index);
    });

    return { lines: padded, changed };
};

/**
 * Aligns the content that follows a prefix keyword.
 *
 * When a symbol acts as a prefix (`readonly `, `export `, …) the lines that do
 * not carry the keyword are padded so their content starts at the same column
 * as the content of the lines that do.
 */
const padAfterPrefixKeyword = (symbol: AlignSymbol, lines: readonly string[], columns: readonly LineColumn[], group: readonly number[]): { readonly lines: readonly string[]; readonly changed: readonly number[] } => {
    const holders = group.filter((index) => columns[index]?.column !== null);
    const withoutSymbol = group.filter((index) => columns[index]?.column === null && !isBlank(lines[index]));

    if (holders.length === 0 || withoutSymbol.length === 0) {
        return { lines, changed: [] };
    }

    const allPrefix = holders.every((index) => {
        const trimmed = lines[index].trimStart();
        return trimmed.startsWith(symbol) && (trimmed.length === symbol.length || !isIdentifierChar(trimmed[symbol.length]));
    });

    if (!allPrefix) {
        return { lines, changed: [] };
    }

    const symbolIndent = indentOf(lines[holders[0]]);

    if (!holders.every((index) => indentOf(lines[index]) === symbolIndent)) {
        return { lines, changed: [] };
    }

    const targetIndent = targetColumn(columns, holders) + symbol.length + 1;
    const padded = [...lines];
    const changed: number[] = [];

    withoutSymbol.forEach((index) => {
        if (indentOf(lines[index]) !== symbolIndent) {
            return;
        }
        const needed = targetIndent - indentOf(lines[index]);
        if (needed <= 0) {
            return;
        }
        padded[index] = `${' '.repeat(needed)}${padded[index]}`;
        changed.push(index);
    });

    return { lines: padded, changed };
};

/** Default column difference that still joins one declaration column. */
const DEFAULT_MAX_DECLARATION_PAD = 12;

/** Turns `maxDeclarationPad` into the effective limit. */
const declarationPadLimit = (maxPad: number | undefined): number => {
    const value = maxPad ?? DEFAULT_MAX_DECLARATION_PAD;

    return Number.isFinite(value) && value >= 1 ? value : Number.POSITIVE_INFINITY;
};

/** Start column of the cell at `cellIndex`, or the neutral element for a missing cell. */
const cellStart = (cells: readonly DeclarationCell[] | null | undefined, cellIndex: number): number => cells?.[cellIndex]?.start ?? Number.NEGATIVE_INFINITY;

/** The window of effective starts that one boundary aligns to. */
interface StartWindow {
    /** First start that joins the column. */
    readonly lo: number;
    /** Last start that joins the column, and the shared target. */
    readonly hi: number;
}

/**
 * Finds the window of effective starts that covers the most declaration lines.
 *
 * A window is a contiguous range of the sorted starts whose ends are at most
 * `limit` apart. The widest cluster wins, so one long generic type cannot set
 * the target of a block of ordinary declarations: the outlier keeps its column
 * and the majority still lines up.
 *
 * Windows that cover the same number of lines resolve to the right-most one
 * (the larger `hi`), which is the column the previous max-based target picked
 * whenever every line was inside the limit. Sorting is the only super-linear
 * step; the window itself is a single two-pointer sweep.
 *
 * @param starts - The effective start column of every line of the partition.
 * @param limit - The largest accepted distance between two joined starts.
 * @returns The winning window, or `null` when no start is usable.
 */
const largestStartWindow = (starts: readonly number[], limit: number): StartWindow | null => {
    const sorted = starts.filter((start) => Number.isFinite(start)).sort((left, right) => left - right);
    let left = 0;
    let members = 0;
    let window: StartWindow | null = null;

    sorted.forEach((hi, right) => {
        while (hi - sorted[left] > limit) {
            left += 1;
        }

        const covered = right - left + 1;

        if (window === null || covered >= members) {
            members = covered;
            window = { lo: sorted[left], hi };
        }
    });

    return window;
};

/** Shape of the cells of a line, e.g. `modifiers|type|name` — the partition key beside the indent. */
const cellSignature = (cells: readonly DeclarationCell[]): string => {
    let signature = cells[0]?.kind ?? '';

    for (let index = 1; index < cells.length; index += 1) {
        signature += `|${cells[index].kind}`;
    }

    return signature;
};

/**
 * Marks the declaration lines whose prefix contains a group member.
 *
 * The declaration pass pads the gaps between the cells; a group pass pads in
 * front of the first occurrence of a member. When a member sits inside the
 * declaration prefix both passes shift the target of the other one, so the
 * fixpoint climbs instead of settling. Such a line is left out of the
 * declaration partitions and keeps the column that the group pass chose.
 *
 * The prefix is the half-open range from the first declaration cell to the end
 * of the name cell. `findSymbolPositions` applies the same word boundary,
 * operator fragment and code region rules as the group pass, so a member that
 * is only a fragment of a longer operator or identifier never triggers the
 * exclusion.
 */
const declarationExclusions = (lines: readonly string[], located: readonly (readonly DeclarationCell[] | null)[], members: readonly AlignSymbol[], profile: LanguageProfile, scan: ScanResult): readonly boolean[] =>
    lines.map((line, index) => {
        const cells = located[index];

        if (cells === null || cells === undefined || cells.length < 2) {
            return false;
        }

        const name = cells[cells.length - 1];
        const regions = (scan.codeRegions[index] ?? []).flatMap((region) => {
            const start = Math.max(region.start, cells[0].start);
            const end = Math.min(region.end, name.end);

            return start < end ? [{ start, end }] : [];
        });

        if (regions.length === 0) {
            return false;
        }

        const positions = findSymbolPositions(line)({ regions, symbols: members, operators: profile.operators });

        return [...positions.values()].some((columns) => columns.length > 0);
    });

/**
 * Splits the base groups by indentation and declaration shape.
 *
 * Every line is pushed into its bucket once and every bucket becomes one
 * partition, so the work stays linear in the number of lines. Lines that a
 * configured group has claimed are skipped, so the two passes never move each
 * other's target.
 */
const declarationPartitions = (lines: readonly string[], groups: readonly (readonly number[])[], located: readonly (readonly DeclarationCell[] | null)[], excluded: readonly boolean[] | null): readonly (readonly number[])[] =>
    groups.flatMap((group) => {
        const buckets = new Map<string, number[]>();

        group.forEach((index) => {
            if (excluded?.[index] === true) {
                return;
            }

            const cells = located[index];

            if (cells === null || cells === undefined || cells.length < 2) {
                return;
            }

            const key = `${indentOf(lines[index])}|${cellSignature(cells)}`;
            const bucket = buckets.get(key);

            if (bucket === undefined) {
                buckets.set(key, [index]);
                return;
            }

            bucket.push(index);
        });

        return [...buckets.values()];
    });

/**
 * Aligns the declaration columns of one partition.
 *
 * Boundaries are processed from left to right. `shifts[position]` holds the
 * number of spaces that were already inserted into that line before the
 * current boundary, so every delta is measured on the *effective* start of the
 * cell.
 *
 * Every boundary aligns to its largest cluster of effective starts: the window
 * `[lo, hi]` at most `limit` wide that covers the most lines. Only the lines
 * inside that window are padded, up to `hi`. A single long generic type is
 * therefore the outlier that keeps its column, instead of becoming the target
 * that excludes every ordinary line.
 *
 * The name column is invariant to which gap absorbs the padding. With the
 * `end` anchor a boundary therefore pads in front of the preceding cell and
 * leaves the name target intact. Boundary 0 is skipped for `end`: the first
 * cell starts at the indentation, and padding in front of it would change the
 * indentation of the line.
 *
 * Insertions are recorded at the original column of the cell edge. They are
 * applied from the right edge of a line, so an earlier insertion carries the
 * later ones along with the text exactly as the `shift` accumulator predicts
 * for the next boundary.
 */
const alignDeclarationPartition = (partition: readonly number[], located: readonly (readonly DeclarationCell[] | null)[], anchor: DeclarationAnchor, limit: number): readonly DeclarationInsertion[] => {
    const cellCount = located[partition[0]]?.length ?? 0;
    const shifts: number[] = partition.map(() => 0);
    const insertions: DeclarationInsertion[] = [];

    for (let boundary = 0; boundary < cellCount - 1; boundary += 1) {
        if (boundary === 0 && anchor === 'end') {
            continue;
        }

        const starts = partition.map((index, position) => cellStart(located[index], boundary + 1) + shifts[position]);
        const window = largestStartWindow(starts, limit);

        if (window === null) {
            continue;
        }

        partition.forEach((index, position) => {
            const start = starts[position];
            const delta = window.hi - start;

            if (!(start >= window.lo && start <= window.hi) || delta <= 0) {
                return;
            }

            const cells = located[index];
            const cell = cells?.[boundary];

            if (cell === undefined) {
                return;
            }

            insertions.push({ index, offset: anchor === 'end' ? cell.start : cell.end, width: delta });
            shifts[position] += delta;
        });
    }

    return insertions;
};

/** Applies the insertions of every partition, from the right edge of each line. */
const applyDeclarationInsertions = (lines: readonly string[], insertions: readonly DeclarationInsertion[]): readonly string[] => {
    const byLine = new Map<number, DeclarationInsertion[]>();

    insertions.forEach((insertion) => {
        const list = byLine.get(insertion.index);

        if (list === undefined) {
            byLine.set(insertion.index, [insertion]);
            return;
        }

        list.push(insertion);
    });

    return lines.map((line, index) => {
        const list = byLine.get(index);

        if (list === undefined) {
            return line;
        }

        return list.sort((left, right) => right.offset - left.offset).reduce((text, insertion) => insertSpaces(text, insertion.offset, insertion.width), line);
    });
};

/**
 * Aligns the declaration columns of every line.
 *
 * The pass is the first stage of every fixpoint iteration. It only inserts
 * spaces, never touches indentation and stays a no-op when the profile has no
 * declaration style or the caller disabled declarations.
 *
 * When groups are configured, a declaration line whose prefix carries a group
 * member is excluded from the partitions: the group pass pads in front of that
 * member, which would move the declaration target, and the declaration pass
 * would move the group target in turn. With the line excluded the group owns
 * its column and the pass reaches a fixpoint. Without groups the exclusions are
 * never computed, so `declarations: false` and the no-group output are
 * unchanged.
 */
const alignDeclarations =
    (profile: LanguageProfile, scope: AlignmentScope, range: LineRange, options: AlignOptions, groups: readonly AlignGroup[]) =>
    (lines: readonly string[]): readonly string[] => {
        if (profile.declarations === 'none' || options.declarations === false) {
            return lines;
        }

        const scan = scanSource(lines.join('\n'))(profile);
        const located = lines.map((line, index) => findDeclarationCells(line)({ regions: scan.codeRegions[index] ?? [], style: profile.declarations }));
        const members = [...new Set(groups.flat())];
        const excluded = members.length === 0 ? null : declarationExclusions(lines, located, members, profile, scan);
        const partitions = declarationPartitions(lines, groupIndices(lines, scope, range), located, excluded);

        if (partitions.length === 0) {
            return lines;
        }

        const anchor = options.declarationAnchor ?? 'start';
        const limit = declarationPadLimit(options.maxDeclarationPad);
        const insertions = partitions.flatMap((partition) => alignDeclarationPartition(partition, located, anchor, limit));

        return insertions.length === 0 ? lines : applyDeclarationInsertions(lines, insertions);
    };

/** Runs one alignment pass for a single symbol. */
const alignSymbol =
    (symbol: AlignSymbol, profile: LanguageProfile, scope: AlignmentScope, range: LineRange) =>
    (lines: readonly string[]): SymbolPass => {
        const columns = locateSymbol(symbol, profile)(lines);
        const groups = groupIndices(lines, scope, range);
        const changed = new Set<number>();
        let current = lines;

        groups.forEach((group) => {
            const holders = group.filter((index) => columns[index]?.column !== null);
            if (holders.length === 0) {
                return;
            }
            const padded = padToTargetColumn(current, columns, holders);
            const prefixed = padAfterPrefixKeyword(symbol, padded.lines, columns, group);
            current = prefixed.lines;
            padded.changed.forEach((index) => {
                changed.add(index);
            });
            prefixed.changed.forEach((index) => {
                changed.add(index);
            });
        });

        return { lines: current, changed: [...changed] };
    };

/**
 * Whether a line joins the column of a group.
 *
 * A member that starts at the indentation would be padded in front of the first
 * visible character, which changes the indentation of the line. Such a line is
 * neither measured nor padded, so a group never changes the indentation and the
 * `indent` groups of the next fixpoint iteration stay the same.
 */
const isGroupHolder = (lines: readonly string[], columns: readonly LineColumn[], index: number): boolean => {
    const column = columns[index]?.column ?? null;

    return column !== null && column > indentOf(lines[index]);
};

/**
 * Runs one alignment pass for a group of alternative tokens.
 *
 * The first occurrence of any member is located on every line; the lines whose
 * member starts behind the indentation are padded to the right-most column of
 * the group. A member in the first column of a line never participates, because
 * padding in front of it would change the indentation of that line and split
 * the line off its `indent` group. The pass reuses
 * {@link padToTargetColumn}, so only spaces are inserted and a line that does
 * not carry a member is never touched.
 */
const alignGroup =
    (group: AlignGroup, profile: LanguageProfile, scope: AlignmentScope, range: LineRange) =>
    (lines: readonly string[]): SymbolPass => {
        const columns = locateGroup(group, profile)(lines);
        const groups = groupIndices(lines, scope, range);
        const changed = new Set<number>();
        let current = lines;

        groups.forEach((indices) => {
            // The same predicate guards the target and the padding, because
            // `padToTargetColumn` only pads the holders it is given.
            const holders = indices.filter((index) => isGroupHolder(lines, columns, index));
            if (holders.length === 0) {
                return;
            }
            const padded = padToTargetColumn(current, columns, holders);
            current = padded.lines;
            padded.changed.forEach((index) => {
                changed.add(index);
            });
        });

        return { lines: current, changed: [...changed] };
    };

/**
 * Determines in which order the symbols are aligned.
 *
 * Symbols are processed by the position of their first occurrence, so the
 * leading `=` of a block is aligned before a trailing `:`.
 */
const orderByFirstOccurrence =
    (symbols: readonly AlignSymbol[], profile: LanguageProfile, range: LineRange) =>
    (lines: readonly string[]): readonly AlignSymbol[] => {
        const scan: ScanResult = scanSource(lines.join('\n'))(profile);
        const occurrences = new Map<AlignSymbol, FirstOccurrence>();

        for (const [index, line] of lines.entries()) {
            if (occurrences.size === symbols.length) {
                break;
            }

            if (index < range.start || index >= range.end) {
                continue;
            }

            const positions = findSymbolPositions(line)({
                regions: scan.codeRegions[index] ?? [],
                symbols,
                operators: profile.operators,
                comment: scan.lineComments[index],
            });

            positions.forEach((columns, symbol) => {
                if (columns.length === 0 || occurrences.has(symbol)) {
                    return;
                }
                occurrences.set(symbol, { line: index, column: columns[0] });
            });
        }

        return [...symbols].sort((left, right) => {
            const a = occurrences.get(left);
            const b = occurrences.get(right);
            if (a === undefined || b === undefined) {
                if (a === undefined && b === undefined) {
                    return 0;
                }
                return a === undefined ? 1 : -1;
            }
            if (a.line !== b.line) {
                return a.line - b.line;
            }
            return a.column - b.column;
        });
    };

/**
 * Aligns the punctuation symbols of a code snippet.
 *
 * The returned function accepts the alignment options; calling it with no
 * options uses the defaults of the language profile. Configured groups of
 * alternative tokens are aligned to their own column before the symbols.
 */
export const align =
    (code: string) =>
    (options: AlignOptions = {}): AlignResult =>
        alignWith(options)(code);

/**
 * Builds an aligner from a fixed set of options.
 *
 * `alignWith({ symbols: ['=', ':'] })(code)`
 *
 * The passes run to a fixpoint so a single call never returns a result that
 * would change again on a second run. A conflicting symbol order (for example
 * `=` before `:` on one line but `:` before `=` on another) can ratchet the
 * columns wider on every run; when no fixpoint is reached the aligner falls
 * back to the leading symbol only, which is always stable. A single symbol
 * that still moves after several passes (prefix padding combined with the
 * `indent` scope can climb) falls back to leaving the input untouched.
 * Under-aligning is always preferred over mutating string content or
 * diverging.
 */
export const alignWith =
    (options: AlignOptions) =>
    (code: string): AlignResult => {
        const profile = languageProfile(options.language ?? 'generic');
        const groups = (options.groups ?? []).map(normalizeGroup).filter((group) => group.length > 0);
        const groupMembers = new Set(groups.flat());
        const symbols = (options.symbols ?? profile.defaultSymbols).filter((symbol) => !groupMembers.has(symbol));
        const scope = options.scope ?? 'block';
        const lines = splitLines(code);
        const range = normalizeRange(options.range, lines.length);

        if (symbols.length === 0 && groups.length === 0) {
            return { code, changes: 0 };
        }

        const ordered = orderByFirstOccurrence(symbols, profile, range)(lines);
        const alignDeclarationColumns = alignDeclarations(profile, scope, range, options, groups);

        /** Runs one alignment pass for every group, in the order they are given. */
        const alignGroups = (input: readonly string[]): readonly string[] => groups.reduce((current, group) => alignGroup(group, profile, scope, range)(current).lines, input);

        /** Runs one full sequence of declaration, group and symbol passes over `input`. */
        const runPasses = (symbolsToAlign: readonly AlignSymbol[], input: readonly string[]): readonly string[] =>
            symbolsToAlign.reduce((current, symbol) => alignSymbol(symbol, profile, scope, range)(current).lines, alignGroups(alignDeclarationColumns(input)));

        /** Whether two line arrays hold the same text. */
        const sameLines = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((line, index) => line === right[index]);

        /**
         * Repeats `runPasses` until the output stops changing.
         * Returns `null` when no fixpoint is reached within `limit` runs.
         */
        const toFixpoint = (symbolsToAlign: readonly AlignSymbol[], input: readonly string[], limit: number): readonly string[] | null => {
            let current = input;

            for (let iteration = 0; iteration < limit; iteration += 1) {
                const next = runPasses(symbolsToAlign, current);
                if (sameLines(next, current)) return next;
                current = next;
            }

            return null;
        };

        /** Distinct lines that differ from the original input. */
        const changedAgainst = (finalLines: readonly string[]): number => finalLines.filter((line, index) => line !== lines[index]).length;

        const stable = toFixpoint(ordered, lines, 5);
        if (stable !== null) {
            return { code: stable.join('\n'), changes: changedAgainst(stable) };
        }

        if (ordered.length > 1) {
            const leading = toFixpoint([ordered[0]], lines, 5);
            if (leading !== null) {
                return { code: leading.join('\n'), changes: changedAgainst(leading) };
            }
        }

        return { code, changes: 0 };
    };

/**
 * Builds an aligner for an explicit list of symbols.
 *
 * `alignSymbols('=', ':')(code)`
 */
export const alignSymbols =
    (...symbols: readonly AlignSymbol[]) =>
    (code: string): AlignResult =>
        alignWith({ symbols })(code);

/**
 * Builds an aligner for a language profile, using the symbols that are
 * conventional for that language.
 *
 * `alignLanguage('python')(code)`
 */
export const alignLanguage =
    (language: LanguageId) =>
    (code: string): AlignResult =>
        alignWith({ language })(code);
