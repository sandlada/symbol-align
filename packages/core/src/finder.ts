/**
 * Symbol finder adapter of `@sandlada/symbol-align`.
 *
 * The finder itself is implemented in Rust; this module rebuilds the
 * `ReadonlyMap` of the public API.
 */

import { findSymbols } from './abi.js';
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

/** Finds the positions of the requested symbols inside the code regions of a line. */
export const findSymbolPositions =
    (line: string) =>
    (options: FindOptions): ReadonlyMap<string, readonly number[]> => {
        const pairs = JSON.parse(findSymbols(line, JSON.stringify(options))) as readonly (readonly [string, readonly number[]])[];

        return new Map(pairs.map(([symbol, positions]) => [symbol, [...positions]]));
    };
