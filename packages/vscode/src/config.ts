/**
 * The configuration of a document.
 *
 * The module is free of the editor API and of the filesystem: it merges the
 * configuration file of the repository with the settings the user set
 * explicitly, so the precedence between them can be unit tested.
 */

import type { AlignOptions, LanguageId, SymbolAlignConfig } from '@sandlada/symbol-align';
import { resolveConfig } from '@sandlada/symbol-align';

import { resolveTargetLanguage } from './settings.js';
import type { ExplicitSettings } from './settings.js';

/** Drops the entries that are not set. */
const defined = <T extends object>(source: T): Partial<T> => Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as Partial<T>;

/**
 * The options of a document.
 *
 * The configuration file of the repository is the base — its overrides that
 * match the file are applied — and every setting the user set explicitly wins
 * over it. The language is not part of the result: it is resolved separately,
 * because the profile of a document may also come from its language id.
 */
export const resolveOptions = (config: SymbolAlignConfig | undefined, explicit: ExplicitSettings, filePath?: string): AlignOptions => {
    const { language: _configLanguage, ...base } = config === undefined ? {} : resolveConfig(config)(filePath);
    const { language: _language, ...overrides } = explicit;

    return { ...base, ...defined(overrides) };
};

/**
 * The language profile of a document.
 *
 * The profile of an explicit setting wins, then the profile of the
 * configuration file and finally the profile that belongs to the language of
 * the document. A document without a known profile is left untouched.
 */
export const resolveProfile = (config: SymbolAlignConfig | undefined, explicit: ExplicitSettings, languageId: string): LanguageId | undefined => resolveTargetLanguage(explicit.language ?? config?.language ?? 'auto', languageId);
