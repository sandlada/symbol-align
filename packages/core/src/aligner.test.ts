import { describe, expect, it } from 'vitest';
import { align, alignLanguage, alignSymbols, alignWith } from './aligner.js';
import { csharpDeclarations, customTypeDeclarations, declarationEndAnchor, solanaTypeFirst } from './fixtures.js';

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

    it('keeps every nesting level on its own column with the indent scope', () => {
        const nested = ['function f() {', '    const a = 1;', '    const bbbb = 22;', '}'];
        const result = align(nested.join('\n'))({ scope: 'indent' });

        expect(result.code.split('\n')[1]).toBe('    const a    = 1;');
        expect(result.code.split('\n')[2]).toBe('    const bbbb = 22;');
    });

    it('does not mix nesting levels with the indent scope', () => {
        const nested = ['const a = 1;', '    const bbbb = 22;'];
        const result = align(nested.join('\n'))({ scope: 'indent' });

        expect(result.code).toBe(nested.join('\n'));
        expect(result.changes).toBe(0);
    });

    it('aligns the lines of one nesting level with the indent scope', () => {
        const nested = ['    const a = 1;', '    const bbbb = 22;'];
        const result = align(nested.join('\n'))({ scope: 'indent' });

        expect(result.code).toBe('    const a    = 1;\n    const bbbb = 22;');
    });
});

describe('range', () => {
    const code = ['const a = 1;', 'const bbbb = 22;', 'const cccccc = 333;'].join('\n');

    it('aligns only the lines of the range', () => {
        const result = align(code)({ range: { start: 1, end: 3 } });

        expect(result.code.split('\n')[0]).toBe('const a = 1;');
        expect(result.code.split('\n')[1]).toBe('const bbbb   = 22;');
        expect(result.code.split('\n')[2]).toBe('const cccccc = 333;');
    });

    it('leaves the input untouched when the range is empty', () => {
        const result = align(code)({ range: { start: 1, end: 1 } });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('clamps a range that reaches beyond the input', () => {
        const result = align(code)({ range: { start: -5, end: 99 } });

        expect(result.code).toBe('const a      = 1;\nconst bbbb   = 22;\nconst cccccc = 333;');
    });

    it('still recognises a string that reaches into the range', () => {
        const withString = ['const a = "=', 'still a string";', 'const bbbb = 22;'].join('\n');
        const result = align(withString)({ range: { start: 2, end: 3 } });

        expect(result.code.split('\n')[2]).toBe('const bbbb = 22;');
        expect(result.changes).toBe(0);
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

describe('declarations', () => {
    it('aligns the declaration columns at their start by default', () => {
        expect(align(csharpDeclarations.input)({ language: 'csharp' }).code).toBe(csharpDeclarations.output);
    });

    it('right-aligns the type with the end anchor', () => {
        expect(align(declarationEndAnchor.input)({ language: 'csharp', declarationAnchor: 'end' }).code).toBe(declarationEndAnchor.output);
    });

    it('aligns a custom type with its name', () => {
        expect(align(customTypeDeclarations.input)({ language: 'csharp' }).code).toBe(customTypeDeclarations.output);
    });

    it('aligns a generic type with its name', () => {
        const code = ['List<Product> items = new List<Product>();', 'Dictionary<string, int> map = new Dictionary<string, int>();'].join('\n');
        const result = align(code)({ language: 'csharp' });

        expect(result.code).toBe(['List<Product>           items = new List<Product>();', 'Dictionary<string, int> map   = new Dictionary<string, int>();'].join('\n'));
    });

    it('never aligns declarations across indentation levels', () => {
        const code = ['string shortName = "a";', '    string muchLongerName = "b";'].join('\n');
        const result = align(code)({ language: 'csharp' });
        const before = code.split('\n');
        const after = result.code.split('\n');

        expect(result.code).toBe(['string shortName          = "a";', '    string muchLongerName = "b";'].join('\n'));
        after.forEach((line, index) => {
            expect(line.length - line.trimStart().length).toBe(before[index].length - before[index].trimStart().length);
        });
    });

    it('aligns declarations of the same indentation with the indent scope', () => {
        const code = ['class C', '{', '    public string a = "1";', '    public int muchLongerName = "2";', '}'].join('\n');
        const result = align(code)({ language: 'csharp', scope: 'indent' });

        expect(result.code).toBe(['class C', '{', '    public string a              = "1";', '    public int    muchLongerName = "2";', '}'].join('\n'));
    });

    it('aligns declarations across blank lines with the file scope', () => {
        const code = ['public string a = "1";', '', 'public int longerName = "2";'].join('\n');
        const result = align(code)({ language: 'csharp', scope: 'file' });

        expect(result.code).toBe(['public string a          = "1";', '', 'public int    longerName = "2";'].join('\n'));
    });

    it('leaves declarations outside the range untouched', () => {
        const code = ['public string a = "1";', 'public int longerName = "2";', 'public long x = "3";'].join('\n');
        const result = align(code)({ language: 'csharp', range: { start: 1, end: 3 } });

        expect(result.code).toBe(['public string a = "1";', 'public int  longerName = "2";', 'public long x          = "3";'].join('\n'));
    });

    it('is idempotent with the start anchor', () => {
        const first = align(csharpDeclarations.input)({ language: 'csharp' });
        const second = align(first.code)({ language: 'csharp' });

        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('is idempotent with the end anchor', () => {
        const first = align(declarationEndAnchor.input)({ language: 'csharp', declarationAnchor: 'end' });
        const second = align(first.code)({ language: 'csharp', declarationAnchor: 'end' });

        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('leaves a far outlier untouched with a small declaration pad limit', () => {
        const code = ['public int a { get; set; }', 'public VeryLongType b { get; set; }'].join('\n');
        const result = align(code)({ language: 'csharp', maxDeclarationPad: 1 });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('measures the declaration pad limit against the final column', () => {
        const code = ['public int a = 1;', 'private  long b = 2;', 'public  bool c = 3;'].join('\n');
        const options = { language: 'csharp', maxDeclarationPad: 1, symbols: ['=>'] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The type starts are 7 / 9 / 8. The target is 9, so only the line at 8
        // is one column away and moves; the 9 outlier stays untouched. The
        // old nearest-based limit padded 7 to 8 and then pulled 9 in on the
        // next iteration, ending at 9 / 9 / 9.
        expect(first.code).toBe(['public int a = 1;', 'private  long b = 2;', 'public   bool c = 3;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('never pads a declaration line farther than the limit', () => {
        const code = ['int a0 = 0;', `T${'x'.repeat(14)} b1 = 1;`, `T${'x'.repeat(26)} c2 = 2;`].join('\n');
        const options = { language: 'csharp', maxDeclarationPad: 12, symbols: ['=>'] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // Name starts 4 / 16 / 28. Only the line 12 columns away joins the
        // final column; the 24 column outlier is left alone instead of being
        // stretched by the chain.
        expect(first.code).toBe(['int a0 = 0;', `T${'x'.repeat(14)}             b1 = 1;`, `T${'x'.repeat(26)} c2 = 2;`].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.changes).toBe(0);
    });

    it('aligns the largest cluster instead of the longest declaration type', () => {
        const code = ['private const int                  a = 1;', 'private const string                bb = 2;', 'private const Dictionary<string, int>                             ccc = 3;'].join('\n');
        const options = { language: 'csharp', maxDeclarationPad: 12, symbols: ['=>'] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);
        const defaults = align(code)({ language: 'csharp', maxDeclarationPad: 12 });

        // The names sit at 35 / 36 / 66. The two ordinary declarations build
        // the largest cluster and meet at 36; the generic type keeps its own
        // column instead of pulling the whole block apart.
        expect(first.code).toBe(['private const int                   a = 1;', 'private const string                bb = 2;', 'private const Dictionary<string, int>                             ccc = 3;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.changes).toBe(0);
        expect(defaults.code.split('\n')[2]).toBe(code.split('\n')[2]);
        expect(new Set(defaults.code.split('\n').map((line) => line.indexOf('='))).size).toBe(1);
    });

    it('aligns two equal clusters to the right-most one', () => {
        const code = ['int a = 1;', 'long bb = 2;', 'Txxxxxxxxx c = 3;', 'Txxxxxxxxyy d = 4;'].join('\n');
        const options = { language: 'csharp', maxDeclarationPad: 2, symbols: ['=>'] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // Two clusters of two lines each, six columns apart. Ties resolve to
        // the window that ends farthest right, so only its short line moves.
        expect(first.code).toBe(['int a = 1;', 'long bb = 2;', 'Txxxxxxxxx  c = 3;', 'Txxxxxxxxyy d = 4;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.changes).toBe(0);
    });

    it('leaves identical declarations untouched', () => {
        const code = ['int longer = 1;', 'int longer = 2;', 'int longer = 3;'].join('\n');
        const result = align(code)({ language: 'csharp', maxDeclarationPad: 12 });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('pads the 8 start of a 7/9/8 block to 9 with a limit of 1', () => {
        const code = ['public int a = 1;', 'private  long b = 2;', 'public  bool c = 3;'].join('\n');
        const options = { language: 'csharp', maxDeclarationPad: 1, symbols: ['=>'] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The starts 7 / 9 / 8 form the windows [7, 8] and [8, 9], both with
        // two lines. The right-most window wins: 8 joins 9, 7 stays put.
        expect(first.code).toBe(['public int a = 1;', 'private  long b = 2;', 'public   bool c = 3;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.changes).toBe(0);
    });

    it('never pads a lone declaration line', () => {
        const code = ['int a = 1;', 'int bb = 2;', 'aVeryLongCustomType c = 3;'].join('\n');
        const options = { language: 'csharp', maxDeclarationPad: 12, symbols: ['=>'] } as const;
        const result = align(code)(options);

        // The two-line cluster at 4 wins over the single line at 20; the lone
        // declaration is neither padded nor used as the target.
        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('aligns a chain of increasing declaration types in one run', () => {
        const code = ['int v0 = 0;', 'Txxxxxxxxx v1 = 1;', 'Txxxxxxxxxxxxxxxx v2 = 2;', 'Txxxxxxxxxxxxxxxxxxxxxxx v3 = 3;', 'Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxx v4 = 4;', 'Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx v5 = 5;'].join('\n');
        const first = align(code)({ language: 'csharp' });
        const second = align(first.code)({ language: 'csharp' });
        const declarationsOnly = align(code)({ language: 'csharp', symbols: ['=>'] });
        const columns = first.code.split('\n').map((line) => line.indexOf('='));

        // The old pass ratcheted one column per fixpoint iteration and fell
        // back to the input after five runs, so this block silently kept its
        // original layout.
        expect(first.changes).toBeGreaterThan(0);
        expect(new Set(columns).size).toBe(1);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
        expect(declarationsOnly.changes).toBeGreaterThan(0);
        expect(align(declarationsOnly.code)({ language: 'csharp', symbols: ['=>'] }).changes).toBe(0);
    });

    it('leaves statement lines untouched', () => {
        const code = ['x < y;', 'a && b;', 'a + b;', 'a * b;', 'a ? b : c;', 'a<b;', 'foo(bar);', 'bool operator<(const Foo& other) {'].join('\n');
        const result = align(code)({ language: 'csharp', symbols: ['=>'] });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('aligns qualified types over their qualifier', () => {
        const code = ['std::string name;', 'std::tuple<int, int> t;'].join('\n');
        const result = align(code)({ language: 'csharp', symbols: ['=>'] });

        expect(result.code).toBe(['std::string          name;', 'std::tuple<int, int> t;'].join('\n'));
    });

    it('aligns tuple types', () => {
        const code = ['(int, string) pair;', '(long, bool) other;'].join('\n');
        const result = align(code)({ language: 'csharp', symbols: ['=>'] });

        expect(result.code).toBe(['(int, string) pair;', '(long, bool)  other;'].join('\n'));
    });

    it('pads both declaration gaps of one line exactly once', () => {
        const code = ['public int a = 1;', 'internal readonly long b = 2;', 'protected string c = 3;'].join('\n');
        const options = { language: 'csharp', symbols: ['=>'] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The first line needs 11 columns at the modifiers/type boundary and 3
        // at the type/name boundary. Applying the shifted offset of the second
        // insertion from the right appends it at the end of the line instead.
        expect(first.code).toBe(['public            int    a = 1;', 'internal readonly long   b = 2;', 'protected         string c = 3;'].join('\n'));
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('is idempotent for the end anchor with different modifier runs', () => {
        const code = ['private const string Product = "symbol-align";', 'private int DefaultPort = 5173;', 'private const bool Enabled = true;'].join('\n');
        const options = { language: 'csharp', declarationAnchor: 'end' } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        expect(first.code).toBe(['private const string Product     = "symbol-align";', 'private          int DefaultPort = 5173;', 'private const   bool Enabled     = true;'].join('\n'));
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it.each(['csharp', 'java', 'dart'] as const)('treats var and dynamic as types in %s', (language) => {
        const result = align(['var x = 1;', 'dynamic longName = 2;'].join('\n'))({ language });

        expect(result.code).toBe(['var     x        = 1;', 'dynamic longName = 2;'].join('\n'));
    });

    it('keeps the declaration pass within four times of declarations off', () => {
        const types = ['int', 'long', 'string', 'bool', 'Product'];
        const code = Array.from({ length: 4000 }, (_value, index) => `    private ${types[index % types.length]} field${index} = ${index};`).join('\n');
        const measure = (declarations: boolean): number => {
            const started = performance.now();
            align(code)({ language: 'csharp', declarations });
            return performance.now() - started;
        };

        measure(false);
        const off = Math.min(measure(false), measure(false));
        const on = Math.min(measure(true), measure(true));

        expect(on).toBeLessThan(off * 4);
    });

    it('keeps the pre-declaration output when declarations are disabled', () => {
        const code = ['public required string name = "value";', 'internal readonly int longValue = 42;', 'protected string x = "default";'].join('\n');
        const result = align(code)({ language: 'csharp', declarations: false });

        expect(result.code).toBe(['public required string name     = "value";', 'internal readonly int longValue = 42;', 'protected string x              = "default";'].join('\n'));
        expect(result.changes).toBe(2);
    });

    it('does not align declarations without a language profile', () => {
        const code = ['int x = 1;', 'int longer = 2;'].join('\n');

        expect(align(code)().code).toBe(['int x      = 1;', 'int longer = 2;'].join('\n'));
    });

    it('aligns type-first declarations of solidity', () => {
        expect(align(solanaTypeFirst.input)({ language: 'solidity' }).code).toBe(solanaTypeFirst.output);
    });
});
