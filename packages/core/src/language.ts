/**
 * Language profiles of `@sandlada/symbol-align`.
 *
 * The table is generated from `languages.json` (the same source that generates
 * the Rust table), so profile lookups need no wasm round trip.
 */

import { languages } from './generated/languages.js';
import type { LanguageId, LanguageProfile } from './types.js';

/** Lookup by language id. */
const profileIndex: Readonly<Record<string, LanguageProfile>> = Object.freeze(Object.fromEntries(languages.map((profile) => [profile.id, profile])));

/** The fallback profile of unknown ids. */
const genericProfile = languages[0];

/** One profile per supported language, in the order the ids are declared in `types.ts`. */
export const allLanguages: readonly LanguageProfile[] = Object.freeze(languages);

/** Returns the profile of `id`; unknown ids fall back to `generic`. */
export const languageProfile = (id: LanguageId): LanguageProfile => profileIndex[id] ?? genericProfile;

/** Type guard for {@link LanguageId}. */
export const isLanguageId = (value: string): value is LanguageId => Object.hasOwn(profileIndex, value);

/** Lookup by file extension (without the leading dot). */
const extensionIndex: Readonly<Record<string, LanguageId>> = Object.freeze(Object.fromEntries(languages.flatMap((profile) => profile.extensions.map((extension) => [extension, profile.id] as const))));

/** Matches the last path segment of a POSIX or Windows style path. */
const FILE_NAME_PATTERN = /[^/\\]+$/;

/** Detects the language of `filePath` by its file extension. */
export const detectLanguage = (filePath: string): LanguageId => {
    const fileName = FILE_NAME_PATTERN.exec(filePath)?.[0] ?? '';
    const dotIndex = fileName.lastIndexOf('.');

    if (dotIndex <= 0) {
        return 'generic';
    }

    const extension = fileName.slice(dotIndex + 1).toLowerCase();

    return extensionIndex[extension] ?? 'generic';
};
