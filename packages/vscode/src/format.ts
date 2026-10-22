/**
 * Pure alignment logic of the extension.
 *
 * The module never imports `vscode` so that it stays unit testable — the
 * editor adapter lives in `extension.ts`.
 */

import type { AlignmentScope, AlignOptions, LanguageId, LineRange } from '@sandlada/symbol-align';
import { align } from '@sandlada/symbol-align';

import { resolveLanguage } from './language.js';

/** Everything the formatter needs to align a piece of text. */
export interface FormatRequest {
    /** The text to align. */
    readonly text: string;
    /** The VS Code language id of the document, e.g. `typescript`. */
    readonly languageId: string;
    /** Symbols to align — an empty list means "use the language defaults". */
    readonly symbols?: readonly string[];
    /** The language profile to use — `undefined` means "detect it from the language id". */
    readonly language?: LanguageId;
    /** The grouping strategy. */
    readonly scope: AlignmentScope;
    /**
     * The lines that are aligned — `undefined` means "align the whole text".
     *
     * The lines outside of the range are still scanned, so a string or a
     * comment that reaches into the range is recognised.
     */
    readonly range?: LineRange;
}

/** The outcome of an alignment run. */
export interface FormatResponse {
    /** The aligned text. */
    readonly text: string;
    /** Number of distinct lines that changed. */
    readonly changes: number;
}

/**
 * Builds the options of the core library.
 *
 * Options that are not set are left out completely so that the core applies
 * its own defaults. An empty symbol list means "use the symbols that are
 * conventional for the language" and is left out as well.
 */
const toAlignOptions = (request: FormatRequest, language: LanguageId | undefined): AlignOptions => ({
    ...(request.symbols === undefined || request.symbols.length === 0 ? {} : { symbols: request.symbols }),
    ...(language === undefined ? {} : { language }),
    ...(request.range === undefined ? {} : { range: request.range }),
    scope: request.scope,
});

/**
 * Aligns the symbols of a piece of text.
 *
 * The language profile is the one of the request; when the request does not
 * name one it is detected from the VS Code language id. When the request
 * carries a range, only the lines of that range are aligned — the remaining
 * text is still scanned, so the lexical context stays intact.
 */
export const formatText = (request: FormatRequest): FormatResponse => {
    const language = request.language ?? resolveLanguage(request.languageId);
    const result = align(request.text)(toAlignOptions(request, language));

    return { text: result.code, changes: result.changes };
};
