import { describe, expect, it } from 'vitest';
import { align, alignLanguage, alignSymbols, alignWith } from './aligner.js';

describe('align', () => {
    it('aligns equals signs', () => {
        const result = align('const foo = 1\nconst foobar = 22')();

        expect(result.code).toBe('const foo    = 1\nconst foobar = 22');
        expect(result.changes).toBe(1);
    });

    it('aligns colons', () => {
        const result = align('const x: string;\nconst yy: number;')({ symbols: [':'] });

        expect(result.code).toBe('const x : string;\nconst yy: number;');
    });

    it('aligns arrows', () => {
        const result = align('const f = (x) => x;\nconst g = (xyz) => xyz;')({ symbols: ['=>'] });

        expect(result.code).toBe('const f = (x)   => x;\nconst g = (xyz) => xyz;');
    });

    it('aligns trailing comments', () => {
        const result = align('const a = 1;  // short\nconst bb = 22; // longer')({ symbols: ['//'] });

        expect(result.code).toBe('const a = 1;   // short\nconst bb = 22; // longer');
    });

    it('leaves an already aligned snippet untouched', () => {
        const result = align('const foo    = 1;\nconst foobar = 22;')();

        expect(result.code).toBe('const foo    = 1;\nconst foobar = 22;');
        expect(result.changes).toBe(0);
    });

    it('handles an empty snippet', () => {
        const result = align('')();

        expect(result.code).toBe('');
        expect(result.changes).toBe(0);
    });

    it('handles a snippet without the requested symbol', () => {
        const result = align('function foo() {\n  return bar;\n}')();

        expect(result.code).toBe('function foo() {\n  return bar;\n}');
        expect(result.changes).toBe(0);
    });

    it('does nothing when the symbol list is empty', () => {
        const code = 'const a = 1\nconst bb = 22';

        expect(align(code)({ symbols: [] }).code).toBe(code);
    });
});

describe('changes', () => {
    it('counts the distinct lines that were modified', () => {
        const result = align('const x: Type = 1;\nconst yy: AnotherType = 22;')({ symbols: [':', '='] });

        expect(result.changes).toBe(1);
    });

    it('counts a line only once even when two symbols move it', () => {
        const result = align('const x: Type = 1;\nconst yy: AnotherType = 22;')({ symbols: [':', '='] });
        const changedLines = result.code.split('\n').filter((line, index) => line !== 'const x: Type = 1;\nconst yy: AnotherType = 22;'.split('\n')[index]).length;

        expect(changedLines).toBe(1);
        expect(result.changes).toBe(changedLines);
    });
});

describe('scope', () => {
    const code = 'name = "foo"\n\nvalue = "bar"';

    it('does not align across a blank line by default', () => {
        expect(align(code)().code).toBe(code);
    });

    it('aligns across blank lines with the file scope', () => {
        expect(align(code)({ scope: 'file' }).code).toBe('name  = "foo"\n\nvalue = "bar"');
    });
});

describe('strings and comments', () => {
    it('ignores symbols inside strings', () => {
        const result = align("const msg = 'hello = world';\nconst greeting = 'hi';")();

        expect(result.code).toBe("const msg      = 'hello = world';\nconst greeting = 'hi';");
    });

    it('ignores symbols inside block comments', () => {
        const result = align('const a = 1; /* = */\nconst bb = 2;')();

        expect(result.code).toBe('const a  = 1; /* = */\nconst bb = 2;');
    });

    it('ignores symbols inside a multi line block comment', () => {
        const result = align('const a = 1;\n/*\nconst ignored = 2;\n*/\nconst bbbb = 3;')();

        expect(result.code).toBe('const a    = 1;\n/*\nconst ignored = 2;\n*/\nconst bbbb = 3;');
    });

    it('ignores symbols inside a python docstring', () => {
        const code = 'def f():\n    """\n    a = b\n    """\n    x = 1';

        expect(align(code)({ language: 'python' }).code).toBe(code);
    });

    it('ignores symbols inside a go raw string', () => {
        const result = align('const query = `\nSELECT id\n`\nvar total = 1')({ language: 'go' });

        expect(result.code).toBe('const query = `\nSELECT id\n`\nvar total   = 1');
    });

    it('treats a rust lifetime as code and not as a string', () => {
        const code = "fn longest<'a>(first: &'a str) -> &'a str {\n    first\n}";

        expect(align(code)({ language: 'rust' }).code).toBe(code);
    });
});

describe('operator fragments', () => {
    it('does not align the equals sign of an arrow', () => {
        const code = 'const f = (x) => x\nconst g = (xyz) => xyz';

        expect(align(code)().code).toBe(code);
    });

    it('does not align the equals sign of an equality check', () => {
        const code = 'if (a == b) {}\nif (cccc == d) {}';

        expect(align(code)().code).toBe(code);
    });

    it('does not align the equals sign of a go short declaration', () => {
        const code = 'x := 1\nyyyy := 22';

        expect(align(code)({ language: 'go', symbols: ['='] }).code).toBe(code);
    });

    it('does align the arrow itself', () => {
        const result = align('const f = (x) => x\nconst g = (xyz) => xyz')({ symbols: ['=>'] });

        expect(result.code).toBe('const f = (x)   => x\nconst g = (xyz) => xyz');
    });
});

describe('prefix keywords', () => {
    it('pads the content of lines that miss the keyword', () => {
        const result = align('export const foo = 1;\nconst bar = 22;\nexport const baz = 333;')({ symbols: ['export', '='] });

        expect(result.code).toBe('export const foo = 1;\n       const bar = 22;\nexport const baz = 333;');
    });

    it('ignores a word that only starts with the keyword', () => {
        const result = align('exportedValue = 1;\nvalue = 2;')({ symbols: ['export', '='] });

        expect(result.code).toBe('exportedValue = 1;\nvalue         = 2;');
        expect(result.changes).toBe(1);
    });
});

describe('curried entry points', () => {
    const code = 'const foo = 1\nconst foobar = 22';

    it('alignWith applies fixed options', () => {
        expect(alignWith({ symbols: ['='] })(code).code).toBe('const foo    = 1\nconst foobar = 22');
    });

    it('alignSymbols applies a symbol list', () => {
        expect(alignSymbols('=')(code).code).toBe('const foo    = 1\nconst foobar = 22');
    });

    it('alignLanguage applies a language profile', () => {
        expect(alignLanguage('python')(code).code).toBe('const foo    = 1\nconst foobar = 22');
    });

    it('alignLanguage uses the symbols of the language', () => {
        const result = alignLanguage('go')('x := 1\nyyyy := 22');

        expect(result.code).toBe('x    := 1\nyyyy := 22');
    });
});

describe('idempotency', () => {
    it('is stable for a single symbol', () => {
        const first = align('const foo = 1\nconst foobar = 22')();
        const second = align(first.code)();

        expect(second.changes).toBe(0);
        expect(second.code).toBe(first.code);
    });

    it('is stable for multiple symbols', () => {
        const first = align('export const x: Type = 1;\nexport const yy: Another = 22;')({ symbols: [':', '='] });
        const second = align(first.code)({ symbols: [':', '='] });

        expect(second.changes).toBe(0);
        expect(second.code).toBe(first.code);
    });

    it('is stable for prefix keyword padding', () => {
        const first = align('export const foo = 1;\nconst bar = 22;\nexport const baz = 333;')({ symbols: ['export', '='] });
        const second = align(first.code)({ symbols: ['export', '='] });

        expect(second.changes).toBe(0);
        expect(second.code).toBe(first.code);
    });
});
