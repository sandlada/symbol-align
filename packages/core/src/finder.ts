/**
 * Symbol finder adapter of `@sandlada/symbol-align`.
 *
 * The finder itself is implemented in Rust; this module rebuilds the
 * `ReadonlyMap` of the public API.
 */

import { findSymbols } from './abi.js';
import { parsePayload } from './boundary.js';
import { SymbolAlignError } from './errors.js';
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

/** One symbol with the columns it was found at. */
type WirePositions = readonly (readonly [string, readonly number[]])[];

/** Whether the payload of the core has the shape of a finder result. */
const isWirePositions = (value: unknown): value is WirePositions =>
    Array.isArray(value) && value.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && Array.isArray(entry[1]) && entry[1].every((column) => typeof column === 'number'));

/** Finds the positions of the requested symbols inside the code regions of a line. */
export const findSymbolPositions =
    (line: string) =>
    (options: FindOptions): ReadonlyMap<string, readonly number[]> => {
        const payload = parsePayload<unknown>('findSymbols', findSymbols(line, JSON.stringify(options)));

        if (!isWirePositions(payload)) {
            throw new SymbolAlignError('findSymbols', 'The core returned a malformed "findSymbols" payload.');
        }

        return new Map(payload.map(([symbol, positions]) => [symbol, [...positions]]));
    };
