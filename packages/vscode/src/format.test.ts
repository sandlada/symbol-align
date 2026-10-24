import { describe, expect, it } from 'vitest';

import { formatText, linesOfRange, selectionLineRange } from './format.js';

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

describe('formatText options', () => {
    const legacyInput = ['public required string name = "value";', 'internal readonly int longValue = 42;', 'protected string x = "default";'].join('\n');

    it('aligns the declaration columns by default', () => {
        const result = formatText({
            text: ['private const string Product = "value";', 'private const int DefaultPort = 8080;'].join('\n'),
            languageId: 'csharp',
            language: 'csharp',
            scope: 'block',
        });

        expect(result.text).toBe(['private const string Product     = "value";', 'private const int    DefaultPort = 8080;'].join('\n'));
    });

    it('forwards declarations: false and keeps the legacy output', () => {
        const result = formatText({
            text: legacyInput,
            languageId: 'csharp',
            language: 'csharp',
            scope: 'block',
            declarations: false,
        });

        expect(result.text).toBe(['public required string name     = "value";', 'internal readonly int longValue = 42;', 'protected string x              = "default";'].join('\n'));
    });

    it('forwards declarationAnchor: end', () => {
        const result = formatText({
            text: ['private const string Product = "value";', 'private const int DefaultPort = 8080;'].join('\n'),
            languageId: 'csharp',
            language: 'csharp',
            scope: 'block',
            declarationAnchor: 'end',
        });

        expect(result.text).toBe(['private const string Product     = "value";', 'private const    int DefaultPort = 8080;'].join('\n'));
    });

    it('forwards maxDeclarationPad', () => {
        const result = formatText({
            text: ['public static int shortName;', 'public static long mediumName;', 'public static Map<String, List<Integer>> outlierName;'].join('\n'),
            languageId: 'java',
            language: 'java',
            scope: 'block',
            maxDeclarationPad: 100,
        });

        expect(result.text).toBe(['public static int                        shortName;', 'public static long                       mediumName;', 'public static Map<String, List<Integer>> outlierName;'].join('\n'));
    });

    it('forwards groups and aligns the members to one column', () => {
        const result = formatText({
            text: ['let status = MY_STATE1;', 'let longName = MY_STATE2;'].join('\n'),
            languageId: 'typescript',
            language: 'typescript',
            scope: 'block',
            groups: [['MY_STATE1', 'MY_STATE2']],
        });

        expect(result.text).toBe(['let status   =   MY_STATE1;', 'let longName =   MY_STATE2;'].join('\n'));
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

describe('selectionLineRange', () => {
    it('covers every touched line', () => {
        expect(selectionLineRange({ start: { line: 1, character: 2 }, end: { line: 3, character: 5 } })).toEqual({ start: 1, end: 4 });
    });

    it('covers a single line selected in full', () => {
        expect(selectionLineRange({ start: { line: 1, character: 0 }, end: { line: 1, character: 9 } })).toEqual({ start: 1, end: 2 });
    });

    it('covers the line of a collapsed cursor', () => {
        expect(selectionLineRange({ start: { line: 2, character: 0 }, end: { line: 2, character: 0 } })).toEqual({ start: 2, end: 3 });
    });

    it('excludes a trailing line that only holds the caret', () => {
        expect(selectionLineRange({ start: { line: 0, character: 0 }, end: { line: 2, character: 0 } })).toEqual({ start: 0, end: 2 });
    });
});

describe('linesOfRange', () => {
    it('returns the lines of the range', () => {
        expect(linesOfRange('a = 1\nbb = 2\nccc = 3', { start: 1, end: 3 })).toBe('bb = 2\nccc = 3');
    });

    it('returns an empty text for an empty range', () => {
        expect(linesOfRange('a = 1\nbb = 2', { start: 1, end: 1 })).toBe('');
    });
});
