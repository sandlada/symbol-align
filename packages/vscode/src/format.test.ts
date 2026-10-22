import { describe, expect, it } from 'vitest';

import { formatText } from './format.js';

describe('formatText', () => {
    it('aligns the equals signs of a typescript snippet', () => {
        const result = formatText({
            text: 'const foo = 1;\nconst foobar = 22;',
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
        });

        expect(result.text).toBe('const foo    = 1;\nconst foobar = 22;');
    });

    it('aligns the colons when the colon is requested', () => {
        const result = formatText({
            text: 'const x: string;\nconst yy: number;',
            languageId: 'typescript',
            language: 'typescript',
            symbols: [':'],
            scope: 'block',
        });

        expect(result.text).toBe('const x : string;\nconst yy: number;');
    });

    it('uses the symbols of the language when no symbols are requested', () => {
        const result = formatText({
            text: '# a comment\nx = 1\nyy = 2',
            languageId: 'python',
            language: 'python',
            scope: 'block',
        });

        expect(result.text).toBe('# a comment\nx  = 1\nyy = 2');
    });

    it('uses the symbols of the language when the symbol list is empty', () => {
        const result = formatText({
            text: 'x = 1\nyy = 2',
            languageId: 'python',
            language: 'python',
            symbols: [],
            scope: 'block',
        });

        expect(result.text).toBe('x  = 1\nyy = 2');
    });

    it('detects the language profile from the language id', () => {
        const result = formatText({
            text: 'x = 1\nyy = 2',
            languageId: 'python',
            scope: 'block',
        });

        expect(result.text).toBe('x  = 1\nyy = 2');
    });

    it('reports the number of changed lines', () => {
        const result = formatText({
            text: 'const a = 1;\nconst b = 2;\nconst cc = 3;',
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
        });

        expect(result.changes).toBe(2);
    });

    it('returns the text unchanged when there is nothing to align', () => {
        const result = formatText({
            text: 'const a = 1;',
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
        });

        expect(result.text).toBe('const a = 1;');
        expect(result.changes).toBe(0);
    });

    it('keeps the blocks of a document apart when the scope is block', () => {
        const result = formatText({
            text: 'a = 1\n\nbbbb = 2',
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
        });

        expect(result.text).toBe('a = 1\n\nbbbb = 2');
    });

    it('aligns the whole document when the scope is file', () => {
        const result = formatText({
            text: 'a = 1\n\nbbbb = 2',
            languageId: 'typescript',
            language: 'typescript',
            scope: 'file',
        });

        expect(result.text).toBe('a    = 1\n\nbbbb = 2');
    });

    it('keeps every nesting level on its own column when the scope is indent', () => {
        const result = formatText({
            text: 'function f() {\n    const a = 1;\n    const bbbb = 22;\n}',
            languageId: 'typescript',
            language: 'typescript',
            scope: 'indent',
        });

        expect(result.text.split('\n')).toEqual(['function f() {', '    const a    = 1;', '    const bbbb = 22;', '}']);
    });

    it('does not mix the nesting levels when the scope is indent', () => {
        const result = formatText({
            text: 'const a = 1;\n    const bbbb = 22;',
            languageId: 'typescript',
            language: 'typescript',
            scope: 'indent',
        });

        expect(result.text).toBe('const a = 1;\n    const bbbb = 22;');
    });
});

describe('formatText with a range', () => {
    const text = 'const a = 1;\nconst bbbb = 22;\nconst cccccc = 333;';

    it('aligns only the lines of the range', () => {
        const result = formatText({
            text,
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
            range: { start: 1, end: 3 },
        });

        expect(result.text.split('\n')).toEqual(['const a = 1;', 'const bbbb   = 22;', 'const cccccc = 333;']);
    });

    it('aligns the whole text when no range is given', () => {
        const result = formatText({
            text,
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
        });

        expect(result.text.split('\n')).toEqual(['const a      = 1;', 'const bbbb   = 22;', 'const cccccc = 333;']);
    });

    it('leaves the text unchanged when the range is empty', () => {
        const result = formatText({
            text,
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
            range: { start: 1, end: 1 },
        });

        expect(result.text).toBe(text);
        expect(result.changes).toBe(0);
    });

    it('recognises a string that reaches into the range', () => {
        const withString = 'const a = "=\nstill a string";\nconst bbbb = 22;';
        const result = formatText({
            text: withString,
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
            range: { start: 2, end: 3 },
        });

        expect(result.text.split('\n')[2]).toBe('const bbbb = 22;');
        expect(result.changes).toBe(0);
    });
});
