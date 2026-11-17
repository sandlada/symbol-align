import { describe, expect, it } from 'vitest';

import { documentReplacement, rangeReplacement, type FormattableDocument } from './edits.js';

/** A document that only knows its language id and its text. */
const documentOf = (text: string, languageId = 'typescript'): FormattableDocument => ({
    languageId,
    getText: () => text,
});

/** The options of the core library with the defaults of the extension. */
const options = () => ({ language: 'typescript' as const, scope: 'block' as const });

describe('documentReplacement', () => {
    it('replaces the whole document', () => {
        const text = 'const a = 1;\nconst bbbb = 22;';
        const replacement = documentReplacement(documentOf(text), options());

        expect(replacement).toEqual({ start: 0, end: text.length, text: 'const a    = 1;\nconst bbbb = 22;' });
    });

    it('returns nothing when the document is already aligned', () => {
        const text = 'const a    = 1;\nconst bbbb = 22;';

        expect(documentReplacement(documentOf(text), options())).toBeUndefined();
    });
});

describe('rangeReplacement', () => {
    const text = 'const a = 1;\nconst bbbb = 22;\nconst cccccc = 333;';

    it('replaces the lines of the range only', () => {
        const replacement = rangeReplacement(documentOf(text), options(), { start: 1, end: 3 });

        expect(replacement).toEqual({
            start: 13,
            end: 49,
            text: 'const bbbb   = 22;\nconst cccccc = 333;',
        });
    });

    it('keeps the lines outside of the range untouched', () => {
        const replacement = rangeReplacement(documentOf(text), options(), { start: 1, end: 3 });

        expect(replacement).toBeDefined();

        const applied = text.slice(0, replacement?.start) + replacement?.text + text.slice(replacement?.end ?? 0);

        expect(applied).toBe('const a = 1;\nconst bbbb   = 22;\nconst cccccc = 333;');
    });

    it('returns nothing when the lines of the range are already aligned', () => {
        const aligned = 'const a = 1;\nconst bbbb   = 22;\nconst cccccc = 333;';

        expect(rangeReplacement(documentOf(aligned), options(), { start: 1, end: 3 })).toBeUndefined();
    });

    it('returns nothing for an empty range', () => {
        expect(rangeReplacement(documentOf(text), options(), { start: 1, end: 1 })).toBeUndefined();
    });

    it('keeps the carriage returns of a windows document', () => {
        const windows = 'const a = 1;\r\nconst bbbb = 22;\r\nconst cc = 3;';
        const replacement = rangeReplacement(documentOf(windows), options(), { start: 0, end: 2 });

        expect(replacement).toBeDefined();

        const applied = windows.slice(0, replacement?.start) + replacement?.text + windows.slice(replacement?.end ?? 0);

        expect(applied).toBe('const a    = 1;\r\nconst bbbb = 22;\r\nconst cc = 3;');
    });
});
