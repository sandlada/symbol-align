/**
 * The error contract of `@sandlada/symbol-align`.
 *
 * Every failure that happens inside the Rust core is reported as a
 * {@link SymbolAlignError}. The error names the operation that failed, so a
 * caller can tell an alignment failure from a scanner failure, and it keeps
 * the original error as its `cause`.
 */

/** The operation of the core that failed. */
export type SymbolAlignOperation = 'align' | 'scan' | 'findSymbols' | 'findDeclarations' | 'profiles' | 'load';

/** An error that was raised inside the core. */
export class SymbolAlignError extends Error {
    /** The operation of the core that failed. */
    readonly operation: SymbolAlignOperation;

    constructor(operation: SymbolAlignOperation, message: string, options?: { readonly cause?: unknown }) {
        super(message, options === undefined ? undefined : { cause: options.cause });
        this.name = 'SymbolAlignError';
        this.operation = operation;
    }
}
