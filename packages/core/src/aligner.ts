/**
 * Vertical alignment engine of `@sandlada/symbol-align`.
 *
 * The curried API is rebuilt here; the alignment itself runs in the Rust core.
 * The only data that crosses the boundary is the source text, a small JSON
 * options payload and the aligned text with its change counter.
 */

import { alignCode } from './abi.js';
import type { AlignOptions, AlignResult, AlignSymbol, LanguageId, LineRange } from './types.js';

/** Number of lines of a source text, matching `code.split('\n').length`. */
const lineCount = (code: string): number => code.split('\n').length;

/**
 * Clamps a range to the lines of the input and converts it to the
 * non-negative integers the Rust boundary accepts.
 *
 * The `ceil` calls preserve the comparison semantics of the TypeScript
 * implementation for fractional ranges: a line joins when
 * `start <= index < end`.
 */
const normalizeRange = (range: LineRange | undefined, count: number): LineRange => {
    if (range === undefined) {
        return { start: 0, end: count };
    }

    const start = Math.max(0, Math.min(range.start, count));
    const end = Math.max(start, Math.min(range.end, count));

    return { start: Math.ceil(start), end: Math.ceil(end) };
};

/** Serializes the public options into the payload of the Rust core. */
const optionsPayload = (options: AlignOptions, code: string): string =>
    JSON.stringify({
        language: options.language ?? null,
        symbols: options.symbols ?? null,
        groups: options.groups ?? [],
        scope: options.scope ?? null,
        range: normalizeRange(options.range, lineCount(code)),
        declarations: options.declarations ?? null,
        declarationAnchor: options.declarationAnchor ?? null,
        maxDeclarationPad: options.maxDeclarationPad ?? null,
    });

/** Aligns the punctuation symbols of a code snippet. */
export const align =
    (code: string) =>
    (options: AlignOptions = {}): AlignResult =>
        alignWith(options)(code);

/** Builds an aligner from a fixed set of options. */
export const alignWith =
    (options: AlignOptions) =>
    (code: string): AlignResult =>
        alignCode(code, optionsPayload(options, code));

/** Builds an aligner for an explicit list of symbols. */
export const alignSymbols =
    (...symbols: readonly AlignSymbol[]) =>
    (code: string): AlignResult =>
        alignWith({ symbols })(code);

/** Builds an aligner for a language profile. */
export const alignLanguage =
    (language: LanguageId) =>
    (code: string): AlignResult =>
        alignWith({ language })(code);
