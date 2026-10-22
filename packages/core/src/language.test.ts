import { describe, it, expect } from 'vitest';
import { allLanguages, detectLanguage, isLanguageId, languageProfile } from './language.js';
import type { LanguageId } from './types.js';

/**
 * Every supported language id, in the order they are declared in `types.ts`.
 *
 * The `Record` type makes a missing or unknown language a compile-time error,
 * so this list cannot drift away from the `LanguageId` union.
 */
const LANGUAGE_IDS = {
    generic: true,
    javascript: true,
    typescript: true,
    python: true,
    go: true,
    rust: true,
    java: true,
    kotlin: true,
    swift: true,
    csharp: true,
    cpp: true,
    c: true,
    ruby: true,
    php: true,
    dart: true,
    shell: true,
    sql: true,
    yaml: true,
    json: true,
    css: true,
    html: true,
    xml: true,
    markdown: true,
    plaintext: true,
} as const satisfies Record<LanguageId, true>;

const expectedIds = Object.keys(LANGUAGE_IDS);

describe('allLanguages', () => {
    it('contains one profile per language id', () => {
        expect(allLanguages).toHaveLength(expectedIds.length);
        expect(allLanguages.map((profile) => profile.id)).toEqual(expectedIds);
    });

    it('uses unique ids', () => {
        const ids = allLanguages.map((profile) => profile.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives every profile a human readable name', () => {
        for (const profile of allLanguages) {
            expect(profile.name.length).toBeGreaterThan(0);
        }
    });

    it('maps every extension to exactly one language', () => {
        const owners = new Map<string, string[]>();

        for (const profile of allLanguages) {
            for (const extension of profile.extensions) {
                owners.set(extension, [...(owners.get(extension) ?? []), profile.id]);
            }
        }

        const conflicts = [...owners.entries()].filter(([, ids]) => ids.length > 1);
        expect(conflicts).toEqual([]);
    });

    it('stores extensions lowercased and without a leading dot', () => {
        for (const profile of allLanguages) {
            for (const extension of profile.extensions) {
                expect(extension.length).toBeGreaterThan(0);
                expect(extension).toBe(extension.toLowerCase());
                expect(extension.startsWith('.')).toBe(false);
            }
        }
    });

    it('sorts every operator list longest first', () => {
        const unsorted = allLanguages.filter((profile) => {
            const lengths = profile.operators.map((operator) => operator.length);
            return lengths.some((length, index) => index > 0 && length > lengths[index - 1]);
        });

        expect(unsorted.map((profile) => profile.id)).toEqual([]);
    });

    it('never lists `=` before a longer operator that starts with `=`', () => {
        const violations = allLanguages.flatMap((profile) => {
            const assignmentIndex = profile.operators.indexOf('=');

            if (assignmentIndex === -1) {
                return [];
            }

            return ['==', '===', '=>'].filter((longer) => profile.operators.indexOf(longer) > assignmentIndex).map((longer) => `${profile.id}: ${longer} has to come before =`);
        });

        expect(violations).toEqual([]);
    });

    it('aligns at least one symbol by default', () => {
        for (const profile of allLanguages) {
            expect(profile.defaultSymbols.length).toBeGreaterThan(0);
        }
    });

    it('uses non empty string delimiters', () => {
        for (const profile of allLanguages) {
            for (const delimiter of profile.strings) {
                expect(delimiter.open.length).toBeGreaterThan(0);
                expect(delimiter.close.length).toBeGreaterThan(0);
            }
        }
    });
});

describe('languageProfile', () => {
    it('returns the profile of a known id', () => {
        expect(languageProfile('typescript').id).toBe('typescript');
        expect(languageProfile('typescript')).toBe(allLanguages.find((profile) => profile.id === 'typescript'));
    });

    it('returns the same profile instance on every call', () => {
        expect(languageProfile('python')).toBe(languageProfile('python'));
    });

    it('falls back to the generic profile for an unknown id', () => {
        expect(languageProfile('cobol' as LanguageId)).toBe(languageProfile('generic'));
    });
});

describe('isLanguageId', () => {
    it('accepts known ids', () => {
        expect(isLanguageId('javascript')).toBe(true);
        expect(isLanguageId('plaintext')).toBe(true);
    });

    it('rejects unknown ids', () => {
        expect(isLanguageId('cobol')).toBe(false);
        expect(isLanguageId('')).toBe(false);
    });

    it('rejects inherited object properties', () => {
        expect(isLanguageId('toString')).toBe(false);
        expect(isLanguageId('constructor')).toBe(false);
    });
});

describe('detectLanguage', () => {
    it('detects typescript', () => {
        expect(detectLanguage('a.ts')).toBe('typescript');
    });

    it('detects python', () => {
        expect(detectLanguage('a.py')).toBe('python');
    });

    it('detects go', () => {
        expect(detectLanguage('a.go')).toBe('go');
    });

    it('detects rust', () => {
        expect(detectLanguage('a.rs')).toBe('rust');
    });

    it('detects csharp', () => {
        expect(detectLanguage('a.cs')).toBe('csharp');
    });

    it('detects ruby', () => {
        expect(detectLanguage('a.rb')).toBe('ruby');
    });

    it('detects php', () => {
        expect(detectLanguage('a.php')).toBe('php');
    });

    it('detects markdown', () => {
        expect(detectLanguage('a.md')).toBe('markdown');
    });

    it('falls back to generic for an unknown extension', () => {
        expect(detectLanguage('a.unknown')).toBe('generic');
    });

    it('falls back to generic for a file without extension', () => {
        expect(detectLanguage('noextension')).toBe('generic');
    });

    it('ignores the case of the extension', () => {
        expect(detectLanguage('A.TS')).toBe('typescript');
    });

    it('uses the last dot segment of the file name', () => {
        expect(detectLanguage('dir.with.dots/file.ts')).toBe('typescript');
    });

    it('ignores dots that belong to a directory', () => {
        expect(detectLanguage('dir.with.dots/file')).toBe('generic');
    });

    it('detects plain text files as plaintext', () => {
        expect(detectLanguage('notes.txt')).toBe('plaintext');
    });
});
