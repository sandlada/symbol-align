import { describe, it, expect } from 'vitest';
import { scanSource } from './scanner.js';
import type { LanguageProfile } from './types.js';

const profile = (overrides: Partial<LanguageProfile> & Pick<LanguageProfile, 'id' | 'name'>): LanguageProfile => ({
    extensions: [],
    lineComments: [],
    blockComments: [],
    strings: [],
    operators: [],
    defaultSymbols: ['='],
    declarations: 'none',
    ...overrides,
});

const jsProfile = profile({
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    strings: [
        { open: "'", close: "'", escape: 'backslash', multiline: false },
        { open: '"', close: '"', escape: 'backslash', multiline: false },
        { open: '`', close: '`', escape: 'backslash', multiline: true },
    ],
    operators: ['===', '!==', '**=', '&&', '||', '??', '=>', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/='],
    defaultSymbols: ['='],
});

const hashProfile = profile({
    id: 'python',
    name: 'Python',
    extensions: ['py'],
    lineComments: ['#'],
    blockComments: [],
    strings: [
        { open: "'", close: "'", escape: 'backslash', multiline: false },
        { open: '"', close: '"', escape: 'backslash', multiline: false },
        { open: "'''", close: "'''", escape: 'backslash', multiline: true },
        { open: '"""', close: '"""', escape: 'backslash', multiline: true },
    ],
    operators: ['==', '!=', '<=', '>=', '+=', '-=', '->'],
    defaultSymbols: ['='],
});

const goProfile = profile({
    id: 'go',
    name: 'Go',
    extensions: ['go'],
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    strings: [
        { open: '"', close: '"', escape: 'backslash', multiline: false },
        { open: '`', close: '`', escape: 'none', multiline: true },
    ],
    operators: ['==', '!=', '<=', '>=', '+=', '-=', ':=', '->'],
    defaultSymbols: ['='],
});

const csharpProfile = profile({
    id: 'csharp',
    name: 'C#',
    extensions: ['cs'],
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    strings: [
        { open: '@"', close: '"', escape: 'doubled', multiline: false },
        { open: '$"', close: '"', escape: 'doubled', multiline: true },
        { open: '"', close: '"', escape: 'backslash', multiline: false },
    ],
    operators: ['==', '!=', '<=', '>=', '=>', '??', '?.'],
    defaultSymbols: ['='],
});

const fsharpProfile = profile({
    id: 'fsharp',
    name: 'F#',
    extensions: ['fs', 'fsi', 'fsx'],
    lineComments: ['//'],
    blockComments: [['(*', '*)']],
    strings: [
        { open: '$$"""', close: '"""', escape: 'none', multiline: true },
        { open: '$"""', close: '"""', escape: 'none', multiline: true },
        { open: '$@"', close: '"', escape: 'doubled', multiline: true },
        { open: '@$"', close: '"', escape: 'doubled', multiline: true },
        { open: '"""', close: '"""', escape: 'none', multiline: true },
        { open: '$"', close: '"', escape: 'backslash', multiline: false },
        { open: '@"', close: '"', escape: 'doubled', multiline: true },
        { open: '"', close: '"', escape: 'backslash', multiline: false },
        { open: "'", close: "'", escape: 'backslash', multiline: false },
    ],
    operators: ['|>', '<|', '->', '<-', '::', ':>', '=', '>', '<'],
    defaultSymbols: ['=', '->', ':'],
});

const rustProfile = profile({
    id: 'rust',
    name: 'Rust',
    extensions: ['rs'],
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    strings: [
        { open: "'", close: "'", escape: 'backslash', multiline: false },
        { open: '"', close: '"', escape: 'backslash', multiline: false },
    ],
    operators: ['==', '!=', '<=', '>=', '=>', '&&', '||', '+=', '-='],
    defaultSymbols: ['='],
});

describe('scanSource', () => {
    it('reports one code region covering a plain code line', () => {
        const result = scanSource('const x = 1')(jsProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 11 }]);
        expect(result.lineComments[0]).toBeUndefined();
    });

    it('stops the code region before a line comment and reports the marker', () => {
        const result = scanSource('const x = 1 // note')(jsProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 12 }]);
        expect(result.lineComments[0]).toEqual({ column: 12, marker: '//' });
    });

    it('supports a hash line comment marker', () => {
        const result = scanSource('x = 1 # note')(hashProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 6 }]);
        expect(result.lineComments[0]).toEqual({ column: 6, marker: '#' });
    });

    it('prefers the longest matching line comment marker', () => {
        const result = scanSource('x /// note')(profile({ ...jsProfile, lineComments: ['//', '///'] }));
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 2 }]);
        expect(result.lineComments[0]).toEqual({ column: 2, marker: '///' });
    });

    it('excludes a single line block comment', () => {
        const result = scanSource('const x = /* c */ 1')(jsProfile);
        expect(result.codeRegions[0]).toEqual([
            { start: 0, end: 10 },
            { start: 17, end: 19 },
        ]);
        expect(result.lineComments[0]).toBeUndefined();
    });

    it('excludes a block comment that spans several lines', () => {
        const code = ['const a = 1;', '/* start', 'middle', 'end */', 'const b = 2;'].join('\n');
        const result = scanSource(code)(jsProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 12 }]);
        expect(result.codeRegions[1]).toEqual([]);
        expect(result.codeRegions[2]).toEqual([]);
        expect(result.codeRegions[3]).toEqual([]);
        expect(result.codeRegions[4]).toEqual([{ start: 0, end: 12 }]);
    });

    it('excludes a single quoted string', () => {
        const result = scanSource("const s = 'a = b'")(jsProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 10 }]);
    });

    it('excludes a double quoted string', () => {
        const result = scanSource('const s = "a = b"')(jsProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 10 }]);
    });

    it('excludes a template literal that spans several lines', () => {
        const result = scanSource(['const s = `a', 'b`;'].join('\n'))(jsProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 10 }]);
        expect(result.codeRegions[1]).toEqual([{ start: 2, end: 3 }]);
    });

    it('excludes a python triple quoted string that spans several lines', () => {
        const result = scanSource(['s = """', 'text', '"""'].join('\n'))(hashProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 4 }]);
        expect(result.codeRegions[1]).toEqual([]);
        expect(result.codeRegions[2]).toEqual([]);
    });

    it('does not process escapes inside a go raw string', () => {
        const result = scanSource('s := `a\\b`')(goProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 5 }]);
    });

    it('does not end a C# verbatim string at a doubled quote', () => {
        const result = scanSource('@"a""b"')(csharpProfile);
        expect(result.codeRegions[0]).toEqual([]);
    });

    it('treats a rust lifetime as code', () => {
        const result = scanSource("fn f<'a>(x: &'a str)")(rustProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 20 }]);
    });

    it('treats a rust char literal as a string', () => {
        const result = scanSource("let c = 'x';")(rustProfile);
        expect(result.codeRegions[0]).toEqual([
            { start: 0, end: 8 },
            { start: 11, end: 12 },
        ]);
    });

    it('treats a nested F# block comment as one comment', () => {
        const result = scanSource(['let x = 1 (* a (* b *) c *)', 'let y = 2'].join('\n'))(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 10 }]);
        expect(result.codeRegions[1]).toEqual([{ start: 0, end: 9 }]);
        expect(result.lineComments[0]).toBeUndefined();
    });

    it('excludes an F# triple quoted string that spans several lines', () => {
        const result = scanSource(['let s = """a', 'b = c', 'd"""'].join('\n'))(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
        expect(result.codeRegions[1]).toEqual([]);
        expect(result.codeRegions[2]).toEqual([]);
    });

    it('does not end an F# verbatim string at a doubled quote', () => {
        const result = scanSource('let s = @"a""b = c"')(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('treats an F# type parameter as code', () => {
        const result = scanSource("let f (x: 'T) = x")(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 17 }]);
    });

    it('treats an F# char literal as a string', () => {
        const result = scanSource("let c = 'a'")(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('treats an escaped F# char literal as a string', () => {
        const result = scanSource("let c = '\\n'")(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('treats an escaped quote inside an F# char literal as string content', () => {
        const result = scanSource("let c = '\\''")(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('treats an F# unicode char escape as a string', () => {
        const result = scanSource("let c = '\\u0041'")(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('treats the F# (*) operator as code', () => {
        const result = scanSource(['let mul = (*)', 'let x = 1'].join('\n'))(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 13 }]);
        expect(result.codeRegions[1]).toEqual([{ start: 0, end: 9 }]);
    });

    it('treats the F# (**) operator as code', () => {
        const result = scanSource('let mul = (**)')(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 14 }]);
    });

    it('does not nest an F# comment at the (*) operator', () => {
        const result = scanSource(['x = 1 (* a (*) b *)', 'y = 2'].join('\n'))(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 6 }]);
        expect(result.codeRegions[1]).toEqual([{ start: 0, end: 5 }]);
    });

    it('keeps a later F# string intact after the (*) operator', () => {
        const result = scanSource(['let mul = (*)', 'let s = "*) a = b"'].join('\n'))(fsharpProfile);

        expect(result.codeRegions[1]).toEqual([{ start: 0, end: 8 }]);
    });

    it('hides an F# interpolated hole with nested indexing', () => {
        const result = scanSource('printfn $"{dict.["a = b"]}"')(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('hides an F# interpolated hole with a verbatim doubled quote', () => {
        const result = scanSource('let s = $@"He said ""{name = 1}"""')(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('hides an F# triple quoted interpolated hole', () => {
        const result = scanSource('let s = $"""Name: {"Phillip"}"""')(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('hides an F# double interpolated triple quoted hole', () => {
        const result = scanSource('let s = $$"""Name: {{dict.["a = b"]}}"""')(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
    });

    it('keeps a single literal brace inside an F# double interpolated string', () => {
        const result = scanSource(['let s = $$"""open { brace"""', 'let x = 1'].join('\n'))(fsharpProfile);

        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 8 }]);
        expect(result.codeRegions[1]).toEqual([{ start: 0, end: 9 }]);
    });

    it('does not end a string at an escaped quote', () => {
        const result = scanSource("const s = 'a \\' = b' = c")(jsProfile);
        expect(result.codeRegions[0]).toEqual([
            { start: 0, end: 10 },
            { start: 20, end: 24 },
        ]);
    });

    it('reports no code region for a line inside a multi line string', () => {
        const result = scanSource(['const s = `a', 'b', 'c`;'].join('\n'))(jsProfile);
        expect(result.codeRegions[1]).toEqual([]);
        expect(result.codeRegions[2]).toEqual([{ start: 2, end: 3 }]);
    });

    it('reports one entry per line for every line of the source', () => {
        const code = 'a\nb\n';
        const result = scanSource(code)(jsProfile);
        expect(result.codeRegions).toHaveLength(code.split('\n').length);
        expect(result.lineComments).toHaveLength(code.split('\n').length);
        expect(result.codeRegions[2]).toEqual([]);
    });

    it('keeps a carriage return at the end of the line', () => {
        const result = scanSource('const x = 1\r\nconst y = 2')(jsProfile);
        expect(result.codeRegions[0]).toEqual([{ start: 0, end: 12 }]);
        expect(result.codeRegions[1]).toEqual([{ start: 0, end: 11 }]);
    });
});
