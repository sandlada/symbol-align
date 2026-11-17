/**
 * The boundary between the TypeScript wrapper and the Rust core.
 *
 * The core runs inside a wasm module, so a failure of the Rust code reaches
 * JavaScript as a trap — an `unreachable` instruction that the host reports as
 * a `WebAssembly.RuntimeError`. The helpers of this module turn such a trap
 * into a {@link SymbolAlignError} that names the failed operation and keeps the
 * original error as its `cause`.
 */

import { SymbolAlignError, type SymbolAlignOperation } from './errors.js';

/**
 * Runs a call into the core.
 *
 * A trap of the wasm module — a panic of the Rust code — is turned into a
 * `SymbolAlignError`. An error that already is a `SymbolAlignError` is passed
 * through unchanged.
 */
export const runBoundary = <T>(operation: SymbolAlignOperation, invoke: () => T): T => {
    try {
        return invoke();
    } catch (error) {
        if (error instanceof SymbolAlignError) {
            throw error;
        }

        throw new SymbolAlignError(operation, `The core failed while running "${operation}".`, { cause: error });
    }
};

/**
 * Parses a JSON payload that the core returned.
 *
 * A payload that is not valid JSON is a defect of the core, so it is reported
 * as a `SymbolAlignError` instead of a bare `SyntaxError`.
 */
export const parsePayload = <T>(operation: SymbolAlignOperation, payload: string): T => {
    try {
        return JSON.parse(payload) as T;
    } catch (error) {
        throw new SymbolAlignError(operation, `The core returned a malformed "${operation}" payload.`, { cause: error });
    }
};
