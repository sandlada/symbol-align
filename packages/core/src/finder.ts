/**
 * Symbol finder for `@sandlada/symbol-align`.
 *
 * The finder never parses code — it only looks at the code regions reported by
 * the scanner and locates the requested symbols inside them. A symbol is
 * rejected when it is only a fragment of a longer operator (`=` inside `=>`,
 * `==` or `:=`) or when it violates a word boundary.
 */

import type { AlignSymbol, CodeRegion, LineComment } from './types.js';

/** Options accepted by {@link findSymbolPositions}. */
export interface FindOptions {
    /** Code regions of the line (real code only). */
    readonly regions: readonly CodeRegion[];
    /** Symbols to look for. */
    readonly symbols: readonly AlignSymbol[];
    /** Operator tokens of the language. */
    readonly operators?: readonly string[];
    /** The trailing line comment of the line, if any. */
    readonly comment?: LineComment;
}

/** Whether `character` is a letter, a digit or an underscore. */
const isWordChar = (character: string): boolean => (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character === '_';

/**
 * Whether `character` can continue an identifier.
 *
 * ASCII letters, digits and underscores always can; any other visible
 * character outside the ASCII range (letters with diacritics, CJK ideographs,
 * emoji, …) can as well, so a keyword prefix is never claimed inside a
 * longer Unicode identifier. Whitespace never continues one.
 */
const isIdentifierChar = (character: string): boolean => isWordChar(character) || (character > '~' && character.trim().length > 0);

/** Whether `symbol` consists of word characters only. */
const isWordSymbol = (symbol: string): boolean => symbol.length > 0 && [...symbol].every(isWordChar);

/** Whether `character` is a punctuation-like operator character. */
const isOperatorChar = (character: string): boolean => !isWordChar(character) && character.trim().length > 0;

/** Whether `symbol` consists of operator characters only. */
const isOperatorSymbol = (symbol: string): boolean => symbol.length > 0 && [...symbol].every(isOperatorChar);

/** Whether the range `[start, end)` lies completely inside one of the regions. */
const isInsideRegion = (regions: readonly CodeRegion[], start: number, end: number): boolean => regions.some((region) => start >= region.start && end <= region.end);

/**
 * Marks every column that is covered by an operator token.
 *
 * `coverage[column]` holds the length of the longest operator that covers that
 * column. A single character operator never covers more than itself, so it is
 * skipped — only multi character operators can invalidate a match.
 */
const operatorCoverage = (line: string, regions: readonly CodeRegion[], operators: readonly string[]): Uint8Array => {
    const coverage = new Uint8Array(line.length);
    const multiCharOperators = operators.filter((operator) => operator.length > 1);

    if (multiCharOperators.length === 0) {
        return coverage;
    }

    const byFirstCharacter = new Map<string, string[]>();
    multiCharOperators.forEach((operator) => {
        const first = operator[0];
        byFirstCharacter.set(first, [...(byFirstCharacter.get(first) ?? []), operator]);
    });

    regions.forEach((region) => {
        for (let index = region.start; index < region.end; index += 1) {
            const candidates = byFirstCharacter.get(line[index]);
            if (candidates === undefined) {
                continue;
            }
            candidates.forEach((operator) => {
                if (index + operator.length > region.end || !line.startsWith(operator, index)) {
                    return;
                }
                for (let column = index; column < index + operator.length; column += 1) {
                    coverage[column] = Math.max(coverage[column], operator.length);
                }
            });
        }
    });

    return coverage;
};

/** Length of the longest operator that covers the range `[start, end)`. */
const coveredBy = (coverage: Uint8Array, start: number, end: number): number => {
    let longest = 0;
    for (let column = start; column < end; column += 1) {
        longest = Math.max(longest, coverage[column]);
    }
    return longest;
};

/**
 * Finds the positions of the requested symbols inside the code regions of a line.
 *
 * @param line - The line of code to search.
 * @returns A function that takes the find options and returns the symbol positions.
 */
export const findSymbolPositions =
    (line: string) =>
    (options: FindOptions): ReadonlyMap<string, readonly number[]> => {
        const positions = new Map<string, number[]>();

        options.symbols.forEach((symbol) => {
            if (!positions.has(symbol)) positions.set(symbol, []);
        });

        if (options.symbols.length === 0) {
            return positions;
        }

        const candidates = [...options.symbols].sort((left, right) => right.length - left.length);
        const coverage = operatorCoverage(line, options.regions, options.operators ?? []);
        let index = 0;

        while (index < line.length) {
            const symbol = candidates.find((candidate) => candidate.length > 0 && line.startsWith(candidate, index));
            if (symbol === undefined) {
                index += 1;
                continue;
            }

            const start = index;
            const end = index + symbol.length;

            if (!isInsideRegion(options.regions, start, end)) {
                index += 1;
                continue;
            }

            if (isOperatorSymbol(symbol) && coveredBy(coverage, start, end) > symbol.length) {
                index = end;
                continue;
            }

            if (isWordSymbol(symbol)) {
                const before = start > 0 ? line[start - 1] : '';
                const after = end < line.length ? line[end] : '';
                if (isIdentifierChar(before) || isIdentifierChar(after)) {
                    index = end;
                    continue;
                }
            }

            positions.get(symbol)?.push(start);
            index = end;
        }

        const { comment } = options;
        if (comment !== undefined && positions.has(comment.marker)) {
            positions.get(comment.marker)?.push(comment.column);
        }

        return positions;
    };
