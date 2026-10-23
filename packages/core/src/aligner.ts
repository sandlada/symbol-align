import { findSymbolPositions } from './finder.js';
import { languageProfile } from './language.js';
import { scanSource } from './scanner.js';
import type { AlignOptions, AlignResult, AlignSymbol, AlignmentScope, LanguageId, LanguageProfile, LineRange, ScanResult } from './types.js';

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
 * options uses the defaults of the language profile.
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
        const symbols = options.symbols ?? profile.defaultSymbols;
        const scope = options.scope ?? 'block';
        const lines = splitLines(code);
        const range = normalizeRange(options.range, lines.length);

        if (symbols.length === 0) {
            return { code, changes: 0 };
        }

        const ordered = orderByFirstOccurrence(symbols, profile, range)(lines);

        /** Runs one full sequence of symbol passes over `input`. */
        const runPasses = (symbolsToAlign: readonly AlignSymbol[], input: readonly string[]): readonly string[] => symbolsToAlign.reduce((current, symbol) => alignSymbol(symbol, profile, scope, range)(current).lines, input);

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
