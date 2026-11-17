/**
 * The settings of the extension.
 *
 * The module is free of the editor API: it turns the raw values of the
 * workspace configuration into the values the formatter works with, so the
 * normalisation of a broken or unknown setting can be unit tested.
 */

import type { AlignmentScope, DeclarationAnchor, LanguageId } from '@sandlada/symbol-align';
import { isLanguageId } from '@sandlada/symbol-align';

import { resolveLanguage } from './language.js';

/** The raw values of the `symbolAlign` section of the workspace configuration. */
export interface RawSettings {
    /** Whether the document is aligned when it is formatted. */
    readonly enabled?: unknown;
    /** The symbols to align — an empty list means "use the language defaults". */
    readonly symbols?: unknown;
    /** Groups of alternative tokens that share one alignment column. */
    readonly groups?: unknown;
    /** The configured language profile — `auto` detects it from the document. */
    readonly language?: unknown;
    /** The grouping strategy. */
    readonly scope?: unknown;
    /** Whether the declaration columns are aligned. */
    readonly declarations?: unknown;
    /** Which edge of a declaration cell is aligned. */
    readonly declarationAnchor?: unknown;
    /** Largest start-column difference that still joins a declaration column. */
    readonly maxDeclarationPad?: unknown;
}

/** The settings of the extension as they are used by the formatter. */
export interface SymbolAlignSettings {
    /** Whether the document is aligned when it is formatted. */
    readonly enabled: boolean;
    /** The symbols to align — an empty list means "use the language defaults". */
    readonly symbols: readonly string[];
    /** Groups of alternative tokens that share one alignment column. */
    readonly groups: readonly (readonly string[])[];
    /** The configured language profile — `auto` detects it from the document. */
    readonly language: string;
    /** The grouping strategy. */
    readonly scope: AlignmentScope;
    /** Whether the declaration columns are aligned. */
    readonly declarations: boolean;
    /** Which edge of a declaration cell is aligned. */
    readonly declarationAnchor: DeclarationAnchor;
    /** Largest start-column difference that still joins a declaration column. */
    readonly maxDeclarationPad: number;
}

/**
 * The settings that the user set explicitly.
 *
 * A setting that is not set explicitly must not win over the configuration
 * file of the repository, so the two are kept apart.
 */
export interface ExplicitSettings {
    /** The symbols to align — an empty list means "use the language defaults". */
    readonly symbols?: readonly string[];
    /** Groups of alternative tokens that share one alignment column. */
    readonly groups?: readonly (readonly string[])[];
    /** The configured language profile — `auto` detects it from the document. */
    readonly language?: string;
    /** The grouping strategy. */
    readonly scope?: AlignmentScope;
    /** Whether the declaration columns are aligned. */
    readonly declarations?: boolean;
    /** Which edge of a declaration cell is aligned. */
    readonly declarationAnchor?: DeclarationAnchor;
    /** Largest start-column difference that still joins a declaration column. */
    readonly maxDeclarationPad?: number;
}

/** The default maximum difference of the core library. */
const DEFAULT_MAX_DECLARATION_PAD = 12;

/**
 * Reads the grouping strategy.
 *
 * An unknown value falls back to `block`, the default of the core library.
 */
export const readScope = (value: unknown): AlignmentScope => (value === 'indent' || value === 'file' ? value : 'block');

/**
 * Reads the declaration anchor.
 *
 * An unknown value falls back to `start`, the default of the core library.
 */
export const readDeclarationAnchor = (value: unknown): DeclarationAnchor => (value === 'end' ? 'end' : 'start');

/**
 * Reads the largest start-column difference that still joins a declaration column.
 *
 * A positive integer is used as it is and `0` means "unlimited", exactly like in
 * the API of the core library. Every other value falls back to the default of
 * the core library.
 */
export const readMaxDeclarationPad = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        return DEFAULT_MAX_DECLARATION_PAD;
    }

    return value >= 1 ? value : 0;
};

/**
 * Reads the symbols to align.
 *
 * Entries that are not a non empty string are dropped; an empty list means "use
 * the symbols that are conventional for the language".
 */
export const readSymbols = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0) : []);

/**
 * Reads the groups of alternative tokens.
 *
 * A group without a usable member is dropped; a group that is not a list is
 * ignored as well.
 */
export const readGroups = (value: unknown): readonly (readonly string[])[] => (Array.isArray(value) ? value.map((group) => readSymbols(group)).filter((group) => group.length > 0) : []);

/**
 * Resolves the language profile that is used for a document.
 *
 * The configured profile wins, the language of the document is only used when
 * the configuration says `auto`. A document whose language is unknown is left
 * untouched.
 */
export const resolveTargetLanguage = (configured: unknown, languageId: string): LanguageId | undefined => {
    if (typeof configured === 'string' && configured !== 'auto') {
        return isLanguageId(configured) ? configured : undefined;
    }

    return resolveLanguage(languageId);
};

/**
 * Builds the settings of the extension from the raw configuration values.
 *
 * Every value that is missing or of the wrong type falls back to the default of
 * the core library, so a broken setting never stops the formatter.
 */
export const readSettings = (raw: RawSettings): SymbolAlignSettings => ({
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    symbols: readSymbols(raw.symbols),
    groups: readGroups(raw.groups),
    language: typeof raw.language === 'string' && raw.language.length > 0 ? raw.language : 'auto',
    scope: readScope(raw.scope),
    declarations: typeof raw.declarations === 'boolean' ? raw.declarations : true,
    declarationAnchor: readDeclarationAnchor(raw.declarationAnchor),
    maxDeclarationPad: readMaxDeclarationPad(raw.maxDeclarationPad),
});

/**
 * Builds the settings that the user set explicitly.
 *
 * Only the values that are set are part of the result — a value that is
 * missing must not win over the configuration file of the repository. An empty
 * symbol or group list means "use the defaults of the language", so it is
 * dropped as well.
 */
export const toExplicitSettings = (raw: RawSettings): ExplicitSettings => {
    const symbols = readSymbols(raw.symbols);
    const groups = readGroups(raw.groups);

    return {
        ...(symbols.length === 0 ? {} : { symbols }),
        ...(groups.length === 0 ? {} : { groups }),
        ...(typeof raw.language === 'string' && raw.language.length > 0 ? { language: raw.language } : {}),
        ...(typeof raw.scope === 'string' ? { scope: readScope(raw.scope) } : {}),
        ...(typeof raw.declarations === 'boolean' ? { declarations: raw.declarations } : {}),
        ...(typeof raw.declarationAnchor === 'string' ? { declarationAnchor: readDeclarationAnchor(raw.declarationAnchor) } : {}),
        ...(typeof raw.maxDeclarationPad === 'number' ? { maxDeclarationPad: readMaxDeclarationPad(raw.maxDeclarationPad) } : {}),
    };
};
