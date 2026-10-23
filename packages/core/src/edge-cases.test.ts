import { describe, expect, it } from 'vitest';
import { align } from './aligner.js';
import { allLanguages, languageProfile } from './language.js';
import { scanSource } from './scanner.js';

describe('strings are never touched', () => {
    it('ignores a nested template literal', () => {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains a template hole
        const code = 'x = `o${`i=j`}e`\nlonger = 1';
        const result = align(code)({ language: 'javascript' });

        expect(result.code).not.toContain('i =');
        expect(result.code).not.toContain('i= ');
        const second = align(result.code)({ language: 'javascript' });

        expect(second.code).toBe(result.code);
        expect(second.changes).toBe(0);
    });

    it('hides JavaScript template holes', () => {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains a template hole
        const code = '`${p=q}`\nxx = 1';
        const result = align(code)({ language: 'javascript' });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('hides C# interpolated holes', () => {
        const code = 'var s = $"x{"a=b"}y"\nvar longer = 1';
        const result = align(code)({ language: 'csharp' });

        expect(result.code).toBe('var s      = $"x{"a=b"}y"\nvar longer = 1');
        expect(result.code).toContain('"a=b"');
    });

    it('hides a C# verbatim interpolated hole', () => {
        const code = 'var s = @$"a""b=c""d"\nvar longer = 1';
        const result = align(code)({ language: 'csharp' });

        expect(result.code).toContain('b=c');
        expect(result.code).not.toContain('b =c');
        expect(result.code).not.toContain('b= c');
    });

    it('treats SQL double quotes as strings', () => {
        const code = 'SELECT "x=y"\nSELECT a=1';
        const result = align(code)({ language: 'sql' });
        const profile = languageProfile('sql');
        const scan = scanSource(code)(profile);

        expect(scan.codeRegions[0]).toEqual([{ start: 0, end: 7 }]);
        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('hides GraphQL block strings', () => {
        const code = 'desc = """x: y = z"""\nlonger = 1';
        const result = align(code)({ language: 'graphql' });

        expect(result.code).toContain('x: y = z');
        expect(align(result.code)({ language: 'graphql' }).changes).toBe(0);
    });

    it('hides Scala triple-quoted strings', () => {
        const code = 'v = """x=y"""\nlonger = 1';
        const result = align(code)({ language: 'scala' });

        expect(result.code).toContain('x=y');
    });

    it('hides Rust raw strings', () => {
        const code = 's = r#"x=y"#\nlonger = 1';
        const result = align(code)({ language: 'rust' });

        expect(result.code).toContain('x=y');
        expect(align(result.code)({ language: 'rust' }).changes).toBe(0);
    });

    it('hides Lua long strings with levels', () => {
        const code = 'x = [=[s=t]=]\nlonger = 1';
        const result = align(code)({ language: 'lua' });

        expect(result.code).toContain('s=t');
        expect(align(result.code)({ language: 'lua' }).changes).toBe(0);
    });

    it('hides Python f-string holes with nested quotes', () => {
        const code = 'f"{"x=1"}"\nlonger_var = 2';
        const result = align(code)({ language: 'python' });

        expect(result.code).toBe(code);
        expect(result.changes).toBe(0);
    });

    it('hides TOML triple-quoted strings', () => {
        const code = 'a = """\nx = 1\n"""\nbb = 2';
        const result = align(code)({ language: 'toml' });

        expect(result.code).toContain('x = 1');
        expect(align(result.code)({ language: 'toml' }).changes).toBe(0);
    });

    it('hides Lua block comments', () => {
        const code = '--[[\nx = 1\n]]\na = 1\nbb = 2';
        const result = align(code)({ language: 'lua' });

        expect(result.code).toContain('x = 1');
        expect(align(result.code)({ language: 'lua' }).changes).toBe(0);
    });

    it('hides PowerShell here-strings', () => {
        const code = '$a = @"\nkey = value\n"@\n$longer_var = 2';
        const result = align(code)({ language: 'powershell' });

        expect(result.code).toContain('key = value');
        expect(align(result.code)({ language: 'powershell' }).changes).toBe(0);
    });

    it('hides shell heredoc bodies', () => {
        const code = 'cat <<EOF\nkey = value\nEOF\nshort=1\nlonger_var=2';
        const result = align(code)({ language: 'shell' });

        expect(result.code).toContain('key = value');
        expect(align(result.code)({ language: 'shell' }).changes).toBe(0);
    });

    it('hides quoted and indented shell heredocs without touching herestrings', () => {
        const quoted = align("cat <<'EOF'\na=b\nEOF\nx=1\nyy=2")({ language: 'shell' });
        expect(quoted.code).toContain('a=b');

        const herestring = align('cat <<< "a=b"\nxx = 1')({ language: 'shell' });
        expect(herestring.code).toContain('"a=b"');
        expect(herestring.changes).toBe(0);
    });

    it('hides ruby, perl and php heredoc bodies', () => {
        const ruby = align('cat <<~EOS\nkey = value\nEOS\nshort=1\nlonger_var=2')({ language: 'ruby' });
        expect(ruby.code).toContain('key = value');
        expect(align(ruby.code)({ language: 'ruby' }).changes).toBe(0);

        const perl = align('print <<EOF;\nkey = value\nEOF\nshort=1\nlonger_var=2')({ language: 'perl' });
        expect(perl.code).toContain('key = value');
        expect(align(perl.code)({ language: 'perl' }).changes).toBe(0);

        const php = align('$x = <<<EOF\nkey = value\nEOF;\n$short=1\n$longer_var=2')({ language: 'php' });
        expect(php.code).toContain('key = value');
        expect(align(php.code)({ language: 'php' }).changes).toBe(0);
    });

    it('leaves Haskell primes, Clojure quotes and BOM lines stable and untouched', () => {
        expect(align("foo' = 1\nfoobar = 2")({ language: 'haskell' }).changes).toBe(0);
        expect(align("'a = 1\n'bb = 2")({ language: 'clojure' }).changes).toBe(0);
        expect(align('﻿a = 1\nbb = 2')({}).changes).toBe(0);
    });

    it('hides Scala interpolated strings with nested quotes', () => {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('s"a ${"b=c"} d"\nxx = 1')({ language: 'scala' }).code).toBe('s"a ${"b=c"} d"\nxx = 1');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('f"a ${x} c"\nxx = 1')({ language: 'scala' }).changes).toBe(0);
        expect(align('raw"a=b"\nxx = 1')({ language: 'scala' }).changes).toBe(0);

        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        const outer = align('val s = s"a ${"b=c"} d"\nval longer = 1')({ language: 'scala' });
        expect(outer.code).toContain('"b=c"');
        expect(align(outer.code)({ language: 'scala' }).changes).toBe(0);
    });

    it('hides Swift interpolation holes with nested quotes', () => {
        expect(align('"a \\("b=c") d"\nxx = 1')({ language: 'swift' }).code).toBe('"a \\("b=c") d"\nxx = 1');

        const outer = align('let s = "a \\("b=c") d"\nlet longer = 1')({ language: 'swift' });
        expect(outer.code).toContain('"b=c"');
        expect(align(outer.code)({ language: 'swift' }).changes).toBe(0);
    });

    it('hides nested block comments where the language nests them', () => {
        const nested = align('{- a = b {- c = d -} e = f -}\nx = 1\nyy = 2')({ language: 'haskell' });
        expect(nested.code).toBe('{- a = b {- c = d -} e = f -}\nx  = 1\nyy = 2');
        expect(align(nested.code)({ language: 'haskell' }).changes).toBe(0);

        const julia = align('#= a #= b =# c =#\nx = 1\nyy = 2')({ language: 'julia' });
        expect(julia.code).toBe('#= a #= b =# c =#\nx  = 1\nyy = 2');
    });

    it('keeps non-nesting block comments closing at the first terminator', () => {
        expect(align('/* a /* b */\nx = 1\nyy = 2')({ language: 'c' }).code).toBe('/* a /* b */\nx  = 1\nyy = 2');
    });

    it('leaves documentation comments untouched while aligning nearby code', () => {
        expect(align('/// a = b\n/// aa = bb\n')({}).code).toBe('/// a = b\n/// aa = bb\n');
        expect(align('/** a = b */\n/** aa = bb */\n')({}).code).toBe('/** a = b */\n/** aa = bb */\n');

        const mixed = align('a=1\n/// a = b\nbb=2\n')({});
        expect(mixed.code).toBe('a =1\n/// a = b\nbb=2\n');
        expect(align(mixed.code)({}).changes).toBe(0);
    });

    it('hides Delphi, Erlang, Clojure and VB comment bodies', () => {
        expect(align('{ a = b }\nx = 1\nyy = 2')({ language: 'delphi' }).code).toBe('{ a = b }\nx  = 1\nyy = 2');
        expect(align('(* a = b *)\nx = 1\nyy = 2')({ language: 'delphi' }).code).toBe('(* a = b *)\nx  = 1\nyy = 2');
        expect(align('%% a = b\nx = 1\nyy = 2')({ language: 'erlang' }).code).toBe('%% a = b\nx  = 1\nyy = 2');
        expect(align('; a = b\nx = 1\nyy = 2')({ language: 'clojure' }).code).toBe('; a = b\nx  = 1\nyy = 2');
        expect(align("' a = b\nx = 1\nyy = 2")({ language: 'vb' }).code).toBe("' a = b\nx  = 1\nyy = 2");
    });

    it('hides deeply nested holes and comments', () => {
        expect(align('{- a {- b {- c -} d -} e -}\nx = 1\nyy = 2')({ language: 'haskell' }).code).toBe('{- a {- b {- c -} d -} e -}\nx  = 1\nyy = 2');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('"${"${"x=y"}"}"\nxx = 1')({ language: 'javascript' }).changes).toBe(0);
    });

    it('never treats heredoc markers inside strings as openers', () => {
        const quoted = align('x = "cat <<EOF"\nxx = 1')({ language: 'shell' });
        expect(quoted.code).toBe('x  = "cat <<EOF"\nxx = 1');

        const opener = align('cat <<EOF "a=b"\nkey = value\nEOF\nx = 1\nyy = 2')({ language: 'shell' });
        expect(opener.code).toContain('"a=b"');
        expect(opener.code).toContain('key = value');
        expect(align(opener.code)({ language: 'shell' }).changes).toBe(0);
    });

    it('treats TOML literal strings as escape-free', () => {
        const backslash = align("key = 'C:\\path = x'\nlongkey = 2")({ language: 'toml' });
        expect(backslash.code).toBe("key     = 'C:\\path = x'\nlongkey = 2");
        expect(align(backslash.code)({ language: 'toml' }).changes).toBe(0);

        const multiline = align("a = '''\nx = 1\n'''\nbb = 2")({ language: 'toml' });
        expect(multiline.code).toContain('x = 1');
        expect(align(multiline.code)({ language: 'toml' }).changes).toBe(0);
    });

    it('hides Groovy, Kotlin and Dart interpolation holes with nested quotes', () => {
        for (const language of ['groovy', 'kotlin', 'dart'] as const) {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
            const leaked = align('"a ${"b=c"}"\nxx = 1')({ language });
            // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
            expect(leaked.code).toBe('"a ${"b=c"}"\nxx = 1');
            expect(leaked.changes).toBe(0);

            // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
            const nested = align('val s = "a ${"b=c"} d"\nval longer = 1')({ language });
            expect(nested.code).toContain('"b=c"');
            expect(align(nested.code)({ language }).changes).toBe(0);
        }
    });

    it('hides Ruby and Elixir interpolation holes with nested quotes', () => {
        for (const language of ['ruby', 'elixir'] as const) {
            expect(align('"a #{"b=c"}"\nxx = 1')({ language }).code).toBe('"a #{"b=c"}"\nxx = 1');

            const nested = align('s = "a #{"b=c"} d"\nlonger = 1')({ language });
            expect(nested.code).toContain('"b=c"');
            expect(align(nested.code)({ language }).changes).toBe(0);
        }
    });

    it('hides holes and quote-likes of the remaining interpolated languages', () => {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('"a ${"b=c"}"\nxx = 1')({ language: 'powershell' }).code).toBe('"a ${"b=c"}"\nxx = 1');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('"a ${"b=c"}"\nxx = 1')({ language: 'terraform' }).code).toBe('"a ${"b=c"}"\nxx = 1');
        expect(align('"a #{"b=c"}"\nxx = 1')({ language: 'crystal' }).code).toBe('"a #{"b=c"}"\nxx = 1');
        expect(align('"a $("b=c")" d"\nxx = 1')({ language: 'julia' }).code).toBe('"a $("b=c")" d"\nxx = 1');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('"a ${"b=c"} d"\nxx = 1')({ language: 'php' }).code).toBe('"a ${"b=c"} d"\nxx = 1');
        expect(align('fmt"a {"b=c"} d"\nxx = 1')({ language: 'nim' }).code).toBe('fmt"a {"b=c"} d"\nxx = 1');
        expect(align('qq{a = b}\nxx = 1')({ language: 'perl' }).code).toBe('qq{a = b}\nxx = 1');
        expect(align('s/a=b/c/\nxx = 1')({ language: 'perl' }).code).toBe('s/a=b/c/\nxx = 1');
        expect(align('~s|a #{"b=c"} d|\nxx = 1')({ language: 'elixir' }).code).toBe('~s|a #{"b=c"} d|\nxx = 1');
        expect(align('%w[a=b c]\nxx = 1')({ language: 'ruby' }).code).toBe('%w[a=b c]\nxx = 1');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('$/a ${"b=c"} d/$\nxx = 1')({ language: 'groovy' }).code).toBe('$/a ${"b=c"} d/$\nxx = 1');

        const outer = align('s = "a #{"b=c"} d"\nlonger = 1')({ language: 'crystal' });
        expect(outer.code).toContain('"b=c"');
        expect(align(outer.code)({ language: 'crystal' }).changes).toBe(0);
    });

    it('counts columns in UTF-16 code units and preserves line endings', () => {
        expect(align('あ = 1\nbb = 2')({}).code).toBe('あ  = 1\nbb = 2');
        expect(align('😀 = 1\nb = 2')({}).code).toBe('😀 = 1\nb  = 2');
        expect(align('\ta = 1\n\t\tbb = 2')({}).code).toBe('\ta   = 1\n\t\tbb = 2');
        expect(align('a = 1\r\nbb = 22')({}).code).toBe('a  = 1\r\nbb = 22');

        expect(align('a ＝ 1\nbb = 2')({}).changes).toBe(0);
        expect(align('   \n  \n')({}).changes).toBe(0);
        expect(align('a = 1\n   \nbb = 2')({}).changes).toBe(0);
    });

    it('keeps comment and string markers from leaking into each other', () => {
        expect(align('/* // a = b */\nx = 1\nyy = 2')({}).code).toBe('/* // a = b */\nx  = 1\nyy = 2');
        expect(align('x = 1 // /* a = b\nxx = 2')({}).code).toBe('x  = 1 // /* a = b\nxx = 2');
        expect(align('x = "// a = b"\nxx = 2')({}).code).toBe('x  = "// a = b"\nxx = 2');
        expect(align('// "a = b\nx = 1\nxx = 2')({}).code).toBe('// "a = b\nx  = 1\nxx = 2');
        expect(align('x = "a = b\nxx = 2')({}).code).toBe('x  = "a = b\nxx = 2');
        expect(align('/* a = b\nx = 1\nyy = 2')({}).changes).toBe(0);
        expect(align('x = ""\nxx = 2')({}).code).toBe('x  = ""\nxx = 2');
        expect(align('x = "a" "b=c"\nxx = 2')({}).code).toBe('x  = "a" "b=c"\nxx = 2');
    });

    it('treats out-of-order, past-end and single-line ranges as no-ops', () => {
        expect(align('a = 1\nbb = 2')({ range: { start: 2, end: 1 } }).changes).toBe(0);
        expect(align('a = 1')({ range: { start: 5, end: 9 } }).changes).toBe(0);
        expect(align('a = 1\nbb = 2')({ range: { start: 0, end: 1 } }).changes).toBe(0);
    });

    it('tolerates overlapping, duplicate and empty symbols', () => {
        expect(align('a == 1\nbb = 2')({ symbols: ['=', '=='] }).code).toBe('a == 1\nbb = 2');
        expect(align('x := 1\nyy = 2')({ symbols: [':', '='], language: 'go' }).code).toBe('x := 1\nyy = 2');
        expect(align('a = 1\nbb = 2')({ symbols: ['=', '='] }).code).toBe('a  = 1\nbb = 2');
        expect(align('a = 1')({ symbols: [''] }).changes).toBe(0);
        expect(align('readonlyx = 1\nvalue = 2')({ symbols: ['readonly', '='] }).code).toBe('readonlyx = 1\nvalue     = 2');
    });

    it('never aligns the `=` inside a longer operator', () => {
        expect(align('x := 1\nlonger = 2')({ language: 'python' }).code).toBe('x := 1\nlonger = 2');
        expect(align('#{a := 1}\nxx = 1')({ language: 'erlang' }).code).toBe('#{a := 1}\nxx = 1');
        expect(align('a::before\nxx: 1')({ language: 'css', symbols: [':'] }).code).toBe('a::before\nxx: 1');
        expect(align('x ??= 1\nlonger = 2')({ language: 'csharp' }).code).toBe('x ??= 1\nlonger = 2');
        expect(align('x = a?.b\nxx = c')({ language: 'csharp', symbols: ['?'] }).code).toBe('x = a?.b\nxx = c');
    });

    it('keeps comment and string openers from leaking into each other', () => {
        expect(align('x = "//" // real\nxx = 1')({ symbols: ['//'] }).code).toBe('x = "//" // real\nxx = 1');
        expect(align('x = "/*" /* real */\nxx = 1')({}).code).toBe('x  = "/*" /* real */\nxx = 1');
        expect(align('/* " */\nx = 1\nyy = 2')({}).code).toBe('/* " */\nx  = 1\nyy = 2');
        expect(align('x = /**/ 1\nxx = 2')({}).code).toBe('x  = /**/ 1\nxx = 2');
        expect(align("x = 'it''s = y'\nxx = 1")({ language: 'sql' }).code).toBe("x  = 'it''s = y'\nxx = 1");
    });

    it('handles unclosed inputs and exotic line content without throwing', () => {
        expect(align('x = "a = b\nxx = 2')({}).code).toBe('x  = "a = b\nxx = 2');
        expect(align('/* a = b\nx = 1\nyy = 2')({}).changes).toBe(0);
        expect(align('x = `a ${b')({ language: 'javascript' }).changes).toBe(0);
        expect(align('a = 1\rbb = 2')({}).changes).toBe(0);
        expect(align('cat <<EOF // note\nkey = value\nEOF\nx = 1\nyy = 2')({ language: 'shell' }).code).toBe('cat <<EOF // note\nkey = value\nEOF\nx  = 1\nyy = 2');
    });

    it('treats raw prefixes as plain strings and holes as opaque across lines', () => {
        expect(align('r"a\\"b=c"\nxx = 1')({ language: 'python' }).code).toBe('r"a\\"b=c"\nxx = 1');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        expect(align('x = `a${`b\nc=d`}e`\nlonger = 1')({ language: 'javascript' }).changes).toBe(1);
        expect(align('x = %w[a=b\nc=d]\nlonger = 1')({ language: 'ruby' }).code).toBe('x      = %w[a=b\nc=d]\nlonger = 1');
        expect(align('x = ~s|a #{"b=c"}\nd|\nlonger = 1')({ language: 'elixir' }).code).toBe('x      = ~s|a #{"b=c"}\nd|\nlonger = 1');

        const second = align('x      = %w[a=b\nc=d]\nlonger = 1')({ language: 'ruby' });
        expect(second.changes).toBe(0);
    });

    it('keeps hostile snippets intact and stable in every language', () => {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: test data contains interpolation holes
        const snippets = ['a = "x = y"\nlonger = \'p = q\'\n// c = d\nx := 1', 's = $"a {b=c} d"\nt = `o ${p=q} r`\ncat <<EOF\nkey = value\nEOF\nlast = 1', 'café = 1\n😀 = 😀\n# tag = v\n/* blk = w */\nif (a == b) {}'];
        const withoutWhitespace = (text: string): string => text.replace(/\s/g, '');

        for (const profile of allLanguages) {
            for (const code of snippets) {
                const first = align(code)({ language: profile.id });
                const second = align(first.code)({ language: profile.id });

                expect(withoutWhitespace(first.code)).toBe(withoutWhitespace(code));
                expect(first.code.length).toBeGreaterThanOrEqual(code.length);
                expect(second.code).toBe(first.code);
                expect(second.changes).toBe(0);
            }
        }
    });
});

describe('already formatted code stays untouched', () => {
    it('is stable for a conflicting symbol order', () => {
        const first = align('const a  = 1 : x;\nconst bb : 2 = y;')({ symbols: ['=', ':'] });
        const second = align(first.code)({ symbols: ['=', ':'] });

        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('does not ratchet conflicting symbols wider', () => {
        const first = align('const a  = 1 : x;\nconst bb : 2 = y;')({ symbols: ['=', ':'] });
        const second = align(first.code)({ symbols: ['=', ':'] });
        const third = align(second.code)({ symbols: ['=', ':'] });

        expect(third.code).toBe(first.code);
    });

    it('is stable for prefix padding in reverse order', () => {
        const first = align('const bb   = 2;\nexport const a = 1;')({ symbols: ['export', '='] });
        const second = align(first.code)({ symbols: ['export', '='] });

        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it('keeps every fixture idempotent', async () => {
        const { allFixtures } = await import('./fixtures.js');

        for (const fixture of allFixtures) {
            const first = align(fixture.input)({
                symbols: fixture.symbols,
                language: fixture.language,
                scope: fixture.scope,
            });
            const second = align(first.code)({
                symbols: fixture.symbols,
                language: fixture.language,
                scope: fixture.scope,
            });

            expect(second.code).toBe(first.code);
            expect(second.changes).toBe(0);
        }
    });
});
