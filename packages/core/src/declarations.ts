/**
 * Declaration locator adapter of `@sandlada/symbol-align`.
 *
 * The locator itself is implemented in Rust; this module rehydrates the cells.
 */

import { findDeclarations } from './abi.js';
import { parsePayload } from './boundary.js';
import { SymbolAlignError } from './errors.js';
import type { DeclarationCell, DeclarationOptions } from './types.js';

/** Whether the payload of the core has the shape of a declaration result. */
const isWireCells = (value: unknown): value is readonly DeclarationCell[] | null => value === null || (Array.isArray(value) && value.every((cell) => typeof cell === 'object' && cell !== null));

/** Locates the declaration cells of a line, or `null` when it is not a declaration. */
export const findDeclarationCells =
    (line: string) =>
    (options: DeclarationOptions): readonly DeclarationCell[] | null => {
        const payload = parsePayload<unknown>('findDeclarations', findDeclarations(line, JSON.stringify(options)));

        if (!isWireCells(payload)) {
            throw new SymbolAlignError('findDeclarations', 'The core returned a malformed "findDeclarations" payload.');
        }

        return payload;
    };
