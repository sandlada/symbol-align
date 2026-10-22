/**
 * Lexical scanner for `@sandlada/symbol-align`.
 *
 * The scanner walks the source text exactly once and keeps its lexical state
 * across line boundaries, so multi-line strings and block comments are handled
 * correctly. For every line it reports:
 *
 * - the contiguous regions that hold real code — everything that is neither
 *   string nor comment text — and
 * - the trailing line comment of that line, if there is one.
 *
 * The scanner is the only place that knows about strings and comments; the
 * finder and the aligner only ever look at the regions it reports.
 */

import type { BlockComment, CodeRegion, LanguageProfile, LineComment, ScanResult, StringDelimiter } from './types.js';

/** Result of searching a line for the closing delimiter of a string literal. */
interface ClosingSearch {
    /** Index of the closing delimiter, or `-1` when the literal is not closed on this line. */
    readonly index: number;
    /** Whether the first character of the next line is escaped. */
    readonly escaped: boolean;
}

/** Longest candidate of `candidates` that matches at `index`, or `null`. */
const matchLongest = (line: string, index: number, candidates: readonly string[]): string | null => {
    let best: string | null = null;

    for (const candidate of candidates) {
        if (candidate.length === 0 || !line.startsWith(candidate, index)) continue;
        if (best === null || candidate.length > best.length) best = candidate;
    }

    return best;
};

/** Longest block comment that opens at `index`, or `null`. */
const matchBlockComment = (line: string, index: number, blockComments: readonly BlockComment[]): BlockComment | null => {
    let best: BlockComment | null = null;

    for (const block of blockComments) {
        if (!line.startsWith(block[0], index)) continue;
        if (best === null || block[0].length > best[0].length) best = block;
    }

    return best;
};

/**
 * Whether a quote at `index` opens a Rust character literal.
 *
 * Rust lifetimes (`'a`) look exactly like character literals, so a quote only
 * starts a literal when it is closed within the next three characters — a
 * single character (`'x'`) or an escaped character (`'\n'`). A quote that
 * follows `<` or `&` is a lifetime in practice and never a literal.
 */
const isRustCharLiteral = (line: string, index: number): boolean => {
    const previous = index > 0 ? line[index - 1] : '';
    if (previous === '<' || previous === '&') return false;
    if (line[index + 1] === '\\') return line[index + 3] === "'";
    return line[index + 2] === "'";
};

/** Longest string delimiter that opens at `index`, or `null`. */
const matchString = (line: string, index: number, profile: LanguageProfile): StringDelimiter | null => {
    let best: StringDelimiter | null = null;

    for (const delimiter of profile.strings) {
        if (delimiter.open.length === 0 || !line.startsWith(delimiter.open, index)) continue;
        if (best === null || delimiter.open.length > best.open.length) best = delimiter;
    }

    if (best === null) return null;
    if (profile.id === 'rust' && best.open === "'" && !isRustCharLiteral(line, index)) return null;

    return best;
};

/**
 * Searches the closing delimiter of a string literal.
 *
 * `escapedFirst` marks a first character that is escaped by a backslash at
 * the end of the previous line.
 */
const findClosing = (line: string, from: number, delimiter: StringDelimiter, escapedFirst: boolean): ClosingSearch => {
    const close = delimiter.close;
    let index = from;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (delimiter.escape === 'backslash' && line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, escaped: true };
            index += 2;
            continue;
        }

        if (!line.startsWith(close, index)) {
            index += 1;
            continue;
        }

        if (delimiter.escape === 'doubled' && line.startsWith(close, index + close.length)) {
            index += close.length * 2;
            continue;
        }

        return { index, escaped: false };
    }

    return { index: -1, escaped: false };
};

/**
 * Scans `code` with the lexical rules of `profile`.
 *
 * @param code - The source text to scan.
 * @returns A function that takes the language profile and returns the scan result.
 */
export const scanSource =
    (code: string) =>
    (profile: LanguageProfile): ScanResult => {
        const lines = code.split('\n');
        const codeRegions: CodeRegion[][] = [];
        const lineComments: (LineComment | undefined)[] = [];

        /** Closing delimiter of the block comment that is currently open. */
        let openBlock: string | null = null;
        /** String literal that is currently open — it may span several lines. */
        let openString: StringDelimiter | null = null;
        /** Whether the first character of the current line is escaped. */
        let escaped = false;

        for (const line of lines) {
            const regions: CodeRegion[] = [];
            let regionStart = -1;
            let comment: LineComment | undefined;
            let index = 0;

            const closeRegion = (end: number): void => {
                if (regionStart < 0) return;
                regions.push({ start: regionStart, end });
                regionStart = -1;
            };

            while (index < line.length) {
                if (openBlock !== null) {
                    const found = line.indexOf(openBlock, index);
                    if (found < 0) {
                        index = line.length;
                        break;
                    }
                    index = found + openBlock.length;
                    openBlock = null;
                    continue;
                }

                if (openString !== null) {
                    const search = findClosing(line, index, openString, escaped);
                    if (search.index < 0) {
                        escaped = search.escaped;
                        index = line.length;
                        break;
                    }
                    escaped = false;
                    index = search.index + openString.close.length;
                    openString = null;
                    continue;
                }

                const marker = matchLongest(line, index, profile.lineComments);
                if (marker !== null) {
                    closeRegion(index);
                    comment = { column: index, marker };
                    index = line.length;
                    break;
                }

                const block = matchBlockComment(line, index, profile.blockComments);
                if (block !== null) {
                    closeRegion(index);
                    index += block[0].length;
                    openBlock = block[1];
                    continue;
                }

                const delimiter = matchString(line, index, profile);
                if (delimiter !== null) {
                    closeRegion(index);
                    index += delimiter.open.length;
                    if (delimiter.multiline) {
                        openString = delimiter;
                        continue;
                    }
                    const search = findClosing(line, index, delimiter, false);
                    if (search.index < 0) {
                        index = line.length;
                        break;
                    }
                    index = search.index + delimiter.close.length;
                    continue;
                }

                if (regionStart < 0) regionStart = index;
                index += 1;
            }

            closeRegion(line.length);
            codeRegions.push(regions);
            lineComments.push(comment);
        }

        return { codeRegions, lineComments };
    };
