/**
 * Declaration locator adapter of `@sandlada/symbol-align`.
 *
 * The locator itself is implemented in Rust; this module rehydrates the cells.
 */

import { findDeclarations } from './abi.js';
import type { DeclarationCell, DeclarationOptions } from './types.js';

/** Locates the declaration cells of a line, or `null` when it is not a declaration. */
export const findDeclarationCells =
    (line: string) =>
    (options: DeclarationOptions): readonly DeclarationCell[] | null =>
        JSON.parse(findDeclarations(line, JSON.stringify(options))) as readonly DeclarationCell[] | null;
