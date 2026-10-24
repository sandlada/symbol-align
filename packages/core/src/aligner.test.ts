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

describe('groups', () => {
    it('aligns both tokens of a two member group to one column', () => {
        const result = align(['let status = MY_STATE1;', 'let longName = MY_STATE2;'].join('\n'))({ symbols: [], groups: [['MY_STATE1', 'MY_STATE2']] });

        expect(result.code).toBe(['let status =   MY_STATE1;', 'let longName = MY_STATE2;'].join('\n'));
        expect(result.changes).toBe(1);
    });

    it('aligns three members to one column', () => {
        const result = align(['const a = ALPHA;', 'const bbb = BETA_STATE;', 'const cc = GAMMA_STATE;'].join('\n'))({ symbols: [], groups: [['ALPHA', 'BETA_STATE', 'GAMMA_STATE']] });

        expect(result.code).toBe(['const a =   ALPHA;', 'const bbb = BETA_STATE;', 'const cc =  GAMMA_STATE;'].join('\n'));
        expect(result.changes).toBe(2);
    });

    it('respects the word boundary of a group member', () => {
        const code = ['const a = MY_STATE1;', 'const bb = MY_STATE10;'].join('\n');
        const result = align(code)({ symbols: [], groups: [['MY_STATE1', 'MY_STATE2']] });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('does not match a group member that is part of a longer operator', () => {
        const code = ['f(x) ->> value;', 'flag <<- TRUE;'].join('\n');
        const result = align(code)({ language: 'r', symbols: [], groups: [['->', '<-']] });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('leaves a line without a member untouched', () => {
        const result = align(['const a = MY_STATE1;', 'const untouched = other;', 'const cc = MY_STATE2;'].join('\n'))({ symbols: [], groups: [['MY_STATE1', 'MY_STATE2']] });

        expect(result.code).toBe(['const a =  MY_STATE1;', 'const untouched = other;', 'const cc = MY_STATE2;'].join('\n'));
        expect(result.changes).toBe(1);
    });

    it('aligns two independent groups to their own columns', () => {
        const result = align(['first = ALPHA;', 'longerThird = BETA;', 'second = GAMMA;', 'longerFourth = DELTA;'].join('\n'))({
            symbols: [],
            groups: [
                ['ALPHA', 'BETA'],
                ['GAMMA', 'DELTA'],
            ],
        });

        expect(result.code).toBe(['first =       ALPHA;', 'longerThird = BETA;', 'second =       GAMMA;', 'longerFourth = DELTA;'].join('\n'));
        expect(result.changes).toBe(2);
    });

    it('aligns a token that is both a member and a symbol once', () => {
        const code = ['let status = MY_STATE1;', 'let longName = MY_STATE2;'].join('\n');
        const options = { symbols: ['MY_STATE1', 'MY_STATE2'], groups: [['MY_STATE1', 'MY_STATE2']] } as const;
        const result = align(code)(options);

        expect(result.code).toBe(['let status =   MY_STATE1;', 'let longName = MY_STATE2;'].join('\n'));
        expect(result.changes).toBe(1);
        expect(align(result.code)(options).changes).toBe(0);
    });

    it('uses the first group member of a line and leaves the later one in place', () => {
        const code = ['a = MY_STATE1 + MY_STATE2;', 'longName = MY_STATE2 + MY_STATE1;'].join('\n');
        const options = { symbols: [], groups: [['MY_STATE1', 'MY_STATE2']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The first line chooses MY_STATE1 at column 4, the second line
        // chooses MY_STATE2 at column 11. The later member of the first line
        // moves with the padding but never defines the target.
        expect(first.code).toBe(['a =        MY_STATE1 + MY_STATE2;', 'longName = MY_STATE2 + MY_STATE1;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(first.code.indexOf('MY_STATE1')).toBe(11);
        expect(first.code.split('\n')[0].indexOf('MY_STATE2')).toBe(23);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('removes a group member from the symbol list', () => {
        const code = ['export const a = 1;', 'const b = 2;'].join('\n');
        const options = { symbols: ['export'], groups: [['export']] } as const;
        const result = align(code)(options);

        // Keeping `export` as a symbol would run its prefix padding and
        // indent the second line to `       const b = 2;`.
        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
        expect(align(result.code)(options).changes).toBe(0);
    });

    it('deduplicates members and drops empty members without changing the result', () => {
        const code = ['first = A;', 'longerName = B;'].join('\n');
        const expected = align(code)({ symbols: [], groups: [['A', 'B']] });
        const result = align(code)({ symbols: [], groups: [['A', '', 'A', 'B']] });

        expect(expected.changes).toBe(1);
        expect(result.code).toBe(expected.code);
        expect(result.changes).toBe(expected.changes);
    });

    it('treats a group that only holds empty members like no groups', () => {
        const code = ['int a = 1;', 'long b = 2;'].join('\n');
        const result = align(code)({ language: 'csharp', symbols: [], groups: [['']] });

        // The empty group prunes away, so the call takes the early return and
        // the declaration pass never runs; a surviving empty member would
        // align the declaration names instead.
        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('runs the groups in the order they are given', () => {
        const code = ['x = ALPHA BETA;', 'longName = ALPHA BETA;'].join('\n');
        const options = { symbols: [], groups: [['ALPHA'], ['BETA']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // ALPHA widens the first line first; BETA then finds both occurrences
        // already in one column. Reversing the group order would make BETA pad
        // the first line first and let the two passes climb on every run.
        expect(first.code).toBe(['x =        ALPHA BETA;', 'longName = ALPHA BETA;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('returns the input unchanged when two groups conflict', () => {
        const code = ['a = AAA BBB;', 'longName = BBB AAA;'].join('\n');
        const options = { symbols: [], groups: [['AAA'], ['BBB']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The two groups alternate their order across the lines, so every
        // pass moves the target of the other one. The aligner must fall back
        // to the original bytes instead of returning a partial mutation.
        expect(first.code).toBe(code);
        expect(first.changes).toBe(0);
        expect(second.code).toBe(code);
        expect(second.changes).toBe(0);
    });

    it('returns the input unchanged when conflicting groups would pad the indentation', () => {
        const code = ['AAA x BBB = 1;', 'BBB x AAA = 2;'].join('\n');
        const options = {
            symbols: [],
            groups: [
                ['AAA', 'ZZZ'],
                ['BBB', 'YYY'],
            ],
            scope: 'indent',
        } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // Padding AAA from column 0 would change the indentation of the first
        // line. The next iteration would then see two different indent groups,
        // call the result stable and return a partial mutation. A member in the
        // first column is not padded, so the conflict falls back to the input.
        expect(first.code).toBe(code);
        expect(first.changes).toBe(0);
        expect(second.code).toBe(code);
        expect(second.changes).toBe(0);
    });

    it.each(['block', 'file'] as const)('leaves the conflicting groups unchanged with scope %s', (scope) => {
        const code = ['AAA x BBB = 1;', 'BBB x AAA = 2;'].join('\n');
        const result = align(code)({
            symbols: [],
            groups: [
                ['AAA', 'ZZZ'],
                ['BBB', 'YYY'],
            ],
            scope,
        });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it.each(['block', 'indent', 'file'] as const)('leaves a three-group order conflict unchanged with scope %s', (scope) => {
        const code = ['AAA b CCC b EEE = 1;', 'EEE b AAA b CCC = 2;'].join('\n');
        const options = { symbols: ['='], groups: [['AAA'], ['CCC'], ['EEE']], scope } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // EEE, AAA and CCC rotate their order between the lines, so every
        // group pass moves the target of another one. The conflict is detected
        // before the first pass and the partial mutation never happens.
        expect(first.code).toBe(code);
        expect(first.changes).toBe(0);
        expect(second.code).toBe(code);
        expect(second.changes).toBe(0);
    });

    it.each(['block', 'indent', 'file'] as const)('leaves a two-group order conflict unchanged with scope %s', (scope) => {
        const code = ['AAA x BBB = 1;', 'BBB x AAA = 2;'].join('\n');
        const options = {
            symbols: [],
            groups: [
                ['AAA', 'ZZZ'],
                ['BBB', 'YYY'],
            ],
            scope,
        } as const;
        const first = align(code)(options);

        expect(first.code).toBe(code);
        expect(first.changes).toBe(0);
        expect(align(first.code)(options).changes).toBe(0);
    });

    it.each(['block', 'indent', 'file'] as const)('leaves a layout with one conflicting pair unchanged with scope %s', (scope) => {
        const code = ['AAA b CCC b EEE = 1;', 'CCC b AAA b EEE = 2;'].join('\n');
        const options = { symbols: ['='], groups: [['AAA'], ['CCC'], ['EEE']], scope } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // Only AAA and CCC swap places; AAA/EEE and CCC/EEE keep their order
        // on both lines. One contradictory pair is enough for a conflict, so
        // the whole input stays untouched.
        expect(first.code).toBe(code);
        expect(first.changes).toBe(0);
        expect(second.code).toBe(code);
        expect(second.changes).toBe(0);
    });

    it('aligns three groups that keep their order on every line', () => {
        const code = ['a FIRST_ALT b SECOND_ALT c THIRD_ALT = 1;', 'aa FIRST_ALT b SECOND_ALT c THIRD_ALT = 2;'].join('\n');
        const options = { symbols: ['='], groups: [['FIRST_ALT'], ['SECOND_ALT'], ['THIRD_ALT']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The relative order is identical on both lines, so the groups do not
        // conflict and the first group still pads the shorter prefix.
        expect(first.code).toBe(['a  FIRST_ALT b SECOND_ALT c THIRD_ALT = 1;', 'aa FIRST_ALT b SECOND_ALT c THIRD_ALT = 2;'].join('\n'));
        expect(first.changes).toBe(1);

        const lines = first.code.split('\n');
        for (const token of ['FIRST_ALT', 'SECOND_ALT', 'THIRD_ALT', '=']) {
            expect(new Set(lines.map((line) => line.indexOf(token))).size).toBe(1);
        }

        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('aligns a three-group layout whose groups sit at different columns', () => {
        const code = ['AAA b CCC b EEE = 1;', 'AAA b  CCC b  EEE = 2;'].join('\n');
        const options = { symbols: ['='], groups: [['AAA'], ['CCC'], ['EEE']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // Every pair keeps its order, so the group passes pad the first line
        // until all three groups share the column of the second line.
        expect(first.code).toBe(['AAA b  CCC b  EEE = 1;', 'AAA b  CCC b  EEE = 2;'].join('\n'));
        expect(first.changes).toBe(1);

        const lines = first.code.split('\n');
        for (const token of ['AAA', 'CCC', 'EEE', '=']) {
            expect(new Set(lines.map((line) => line.indexOf(token))).size).toBe(1);
        }

        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('does not treat a group that occurs on only one line as a conflict', () => {
        const code = ['a AAA ZZZ = 1;', 'longer AAA = 2;'].join('\n');
        const options = { symbols: [], groups: [['AAA'], ['ZZZ']] } as const;
        const first = align(code)(options);

        // Only the first line carries ZZZ, so no second line can contradict its
        // order; the shared AAA column is still aligned.
        expect(first.code).toBe(['a      AAA ZZZ = 1;', 'longer AAA = 2;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(align(first.code)(options).changes).toBe(0);
    });

    it('does not treat a group that occurs on one line only as a three-group conflict', () => {
        const code = ['AAA b CCC b EEE = 1;', 'AAA b EEE = 2;'].join('\n');
        const options = { symbols: ['='], groups: [['AAA'], ['CCC'], ['EEE']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // CCC is absent from the second line, so the CCC/EEE pair is ordered
        // on one line only and cannot contradict itself. A comparison of whole
        // presence sets would suppress the shared EEE column; the pairwise
        // check still aligns it.
        expect(first.code).toBe(['AAA b CCC b EEE = 1;', 'AAA b       EEE = 2;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('does not treat two groups that share a column on one line as a conflict', () => {
        const code = ['  x AAA b BBB = 1;', '  yy AAA b BBB = 2;', '  BBB b AAA = 3;'].join('\n');
        const options = {
            symbols: [],
            groups: [['AAA'], ['BBB', 'AAA']],
        } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The second group starts at the AAA of the first two lines, exactly
        // where the first group starts; equal columns never contradict each
        // other. Only the third line orders the pair (BBB before AAA), so the
        // repeated AAA of the first two lines is padded instead of falling
        // back to the unchanged input.
        expect(first.code).toBe(['  x     AAA b BBB = 1;', '  yy    AAA b BBB = 2;', '  BBB b AAA = 3;'].join('\n'));
        expect(first.changes).toBe(2);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('never compares groups across indent groups', () => {
        const code = ['  x AAA y BBB = 1;', '  xx AAA y BBB = 2;', '    BBB x AAA = 3;', '    BBB xx AAA = 4;'].join('\n');
        const options = { symbols: [], groups: [['AAA'], ['BBB']], scope: 'indent' } as const;
        const first = align(code)(options);

        // Each indent group keeps one order of its own; the opposite order of
        // the other indent group belongs to a different scope group and cannot
        // conflict, so both groups are still aligned internally.
        expect(first.code).toBe(['  x  AAA y BBB = 1;', '  xx AAA y BBB = 2;', '    BBB x  AAA = 3;', '    BBB xx AAA = 4;'].join('\n'));
        expect(first.changes).toBe(2);
        expect(align(first.code)(options).changes).toBe(0);
    });

    it('keeps the conflict fallback of a typed snippet idempotent', () => {
        const code = ['public AAA x BBB = 1;', 'public longlong BBB x AAA = 2;'].join('\n');
        const options = {
            language: 'csharp',
            symbols: ['='],
            groups: [
                ['AAA', 'ZZZ'],
                ['BBB', 'YYY'],
            ],
        } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The declaration pass and the symbol pass never run on a conflict, so
        // the original bytes stay untouched and a second run is a no-op.
        expect(first.code).toBe(code);
        expect(first.changes).toBe(0);
        expect(second.code).toBe(code);
        expect(second.changes).toBe(0);
    });

    it('never pads a group member that is the first token of a line', () => {
        const code = ['    AAA = 1;', 'ZZZ = 2;'].join('\n');
        const options = { symbols: [], groups: [['AAA', 'ZZZ']], scope: 'block' } as const;
        const first = align(code)(options);

        // Both members start at their indentation. Measuring them would pad the
        // second line by four spaces and change its indentation.
        expect(first.code).toBe(code);
        expect(first.changes).toBe(0);
        expect(align(first.code)(options).changes).toBe(0);
    });

    it('pads only the group members that start behind the indentation', () => {
        const code = ['AAA x = 1;', '  x AAA = 2;', '      x AAA = 3;'].join('\n');
        const first = align(code)({ symbols: [], groups: [['AAA', 'ZZZ']], scope: 'file' });

        // The first line keeps its first-column member untouched; only the two
        // later members are measured and the closer one is padded.
        expect(first.code).toBe(['AAA x = 1;', '  x     AAA = 2;', '      x AAA = 3;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(align(first.code)({ symbols: [], groups: [['AAA', 'ZZZ']], scope: 'file' }).changes).toBe(0);
    });

    it('still aligns a group whose members start behind the indentation', () => {
        const result = align(['    a = MY_STATE1;', '    longName = MY_STATE2;'].join('\n'))({ symbols: [], groups: [['MY_STATE1', 'MY_STATE2']], scope: 'indent' });

        expect(result.code).toBe(['    a =        MY_STATE1;', '    longName = MY_STATE2;'].join('\n'));
        expect(result.changes).toBe(1);
    });

    it('is idempotent', () => {
        const code = ['first = ALPHA;', 'longerThird = BETA;', 'second = GAMMA;', 'longerFourth = DELTA;'].join('\n');
        const options = {
            symbols: [],
            groups: [
                ['ALPHA', 'BETA'],
                ['GAMMA', 'DELTA'],
            ],
        } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('honours the indent scope and the range', () => {
        const result = align(['if (x) {', '    a = MY_STATE1;', '    longName = MY_STATE2;', '    untouchedName = MY_STATE2;', '}'].join('\n'))({
            symbols: [],
            groups: [['MY_STATE1', 'MY_STATE2']],
            scope: 'indent',
            range: { start: 2, end: 4 },
        });

        expect(result.code).toBe(['if (x) {', '    a = MY_STATE1;', '    longName =      MY_STATE2;', '    untouchedName = MY_STATE2;', '}'].join('\n'));
        expect(result.changes).toBe(1);
    });

    it('ignores members inside strings and comments', () => {
        const code = ['const a = "MY_STATE1";', 'const longName = MY_STATE2;', '/* MY_STATE1 */', '// MY_STATE2'].join('\n');
        const result = align(code)({ symbols: [], groups: [['MY_STATE1', 'MY_STATE2']] });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('deduplicates members and drops empty members', () => {
        const result = align(['let status = MY_STATE1;', 'let longName = MY_STATE2;'].join('\n'))({ symbols: [], groups: [['MY_STATE1', 'MY_STATE1', '', 'MY_STATE2']] });

        expect(result.code).toBe(['let status =   MY_STATE1;', 'let longName = MY_STATE2;'].join('\n'));
        expect(result.changes).toBe(1);
    });

    it('does not pad after a prefix keyword group member', () => {
        const code = ['export const a = 1;', 'const b = 2;'].join('\n');
        const result = align(code)({ symbols: [], groups: [['export']] });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('treats an empty group list like no groups', () => {
        const code = 'const foo = 1\nconst foobar = 22';

        expect(align(code)({ groups: [] }).code).toBe(align(code)().code);
        expect(align(code)({ groups: [[]] }).code).toBe(align(code)().code);
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

    it('aligns a group member inside a declaration instead of ratcheting', () => {
        const code = ['private const Product Product = new Product();', 'private const string Product = "x";'].join('\n');
        const options = { language: 'csharp', symbols: [], groups: [['Product']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);
        const columns = first.code.split('\n').map((line) => line.indexOf('Product'));

        // Both first occurrences are Product; the declaration pass would move
        // the type of the first line while the group pass moves the name, and
        // every run would add more spaces. The group owns the prefix instead.
        expect(first.code).toBe(['private const        Product Product = new Product();', 'private const string Product = "x";'].join('\n'));
        expect(columns).toEqual([21, 21]);
        expect(first.changes).toBe(1);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('keeps declaration alignment for lines that do not carry a group member', () => {
        const code = ['private const string Product = "x";', 'private const int DefaultPort = 5173;', 'private const bool Enabled = true;'].join('\n');
        const options = { language: 'csharp', symbols: [], groups: [['Product']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // Only the Product line leaves the declaration partition; the other
        // two lines still align their names with each other.
        expect(first.code).toBe(['private const string Product = "x";', 'private const int  DefaultPort = 5173;', 'private const bool Enabled = true;'].join('\n'));
        expect(first.changes).toBe(1);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it.each([
        { cell: 'modifier', group: ['private'] },
        { cell: 'type', group: ['string'] },
        { cell: 'name', group: ['Product'] },
    ])('excludes a declaration whose $cell cell carries a group member', ({ group }) => {
        const code = ['private const string Product = "x";', 'public static int DefaultPort = 5173;'].join('\n');
        const options = { language: 'csharp', symbols: [], groups: [group] } as const;
        const result = align(code)(options);

        // The group member only occurs on the first line. Without the
        // exclusion the second line would still be padded in front of
        // DefaultPort, because the declaration partition would hold both.
        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('does not compute group exclusions when declarations are disabled', () => {
        const code = ['private const Product Product = new Product();', 'private const string Product = "x";'].join('\n');
        const options = { language: 'csharp', declarations: false, symbols: [], groups: [['Product']] } as const;
        const result = align(code)(options);

        // With the declaration pass off only the group pass may run, so the
        // first member of the first line is padded to the second line.
        expect(result.code).toBe(['private const        Product Product = new Product();', 'private const string Product = "x";'].join('\n'));
        expect(result.changes).toBe(1);
    });

    it('keeps a declaration whose group member only appears in the initializer', () => {
        const code = ['private const string Alpha = Product.Create();', 'private const int Beta     = Product.Count;'].join('\n');
        const options = { language: 'csharp', groups: [['Product']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The member sits behind the name cell, so the prefix is free of it and
        // the declaration pass still moves the name of Beta from column 18 to
        // column 21. Excluding the whole line would leave Beta where it is.
        expect(first.code).toBe(['private const string Alpha    =    Product.Create();', 'private const int    Beta     =    Product.Count;'].join('\n'));
        expect(first.code.split('\n').map((line) => line.search(/Alpha|Beta/))).toEqual([21, 21]);
        expect(first.code.split('\n').map((line) => line.indexOf('Product'))).toEqual([35, 35]);
        expect(first.changes).toBe(2);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('does not exclude a declaration whose type only starts with a group member', () => {
        const code = ['private const ProductId Value = 1;', 'private const int Count = 2;'].join('\n');
        const options = { language: 'csharp', groups: [['Product']] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // ProductId is a longer identifier, so the group never matches inside
        // it and the line keeps its place in the declaration partition. A naive
        // substring check over the prefix would exclude it and leave Count at
        // column 18 instead of moving it to column 24.
        expect(first.code).toBe(['private const ProductId Value = 1;', 'private const int       Count = 2;'].join('\n'));
        expect(first.code.split('\n').map((line) => line.search(/Value|Count/))).toEqual([24, 24]);
        expect(first.changes).toBe(1);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('aligns the declaration names, the group tokens and the equals signs of one block', () => {
        const code = ['private const string Alpha = Product.Create();', 'private const int Beta = Product.Count;', 'private const bool Gamma = Product.Ready;'].join('\n');
        const options = { language: 'csharp', groups: [['Product']], symbols: ['='] } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        // The fixpoint hides the intermediate state, so the documented order
        // (declarations, then groups, then symbols) has no direct order test.
        // What is observable is the end state: the names, the group tokens and
        // the equals signs each share one column.
        expect(first.code).toBe(['private const string Alpha =  Product.Create();', 'private const int    Beta  =  Product.Count;', 'private const bool   Gamma =  Product.Ready;'].join('\n'));
        expect(first.code.split('\n').map((line) => line.search(/Alpha|Beta|Gamma/))).toEqual([21, 21, 21]);
        expect(first.code.split('\n').map((line) => line.indexOf('Product'))).toEqual([30, 30, 30]);
        expect(first.code.split('\n').map((line) => line.indexOf('='))).toEqual([27, 27, 27]);
        expect(first.changes).toBe(3);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });
});
