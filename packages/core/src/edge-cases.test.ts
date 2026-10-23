import { describe, expect, it } from 'vitest';
import { align } from './aligner.js';
import { scanSource } from './scanner.js';
import { languageProfile } from './language.js';

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
