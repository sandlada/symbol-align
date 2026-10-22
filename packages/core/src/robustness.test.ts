import { describe, expect, it } from 'vitest';
import { align } from './aligner.js';
import { allLanguages } from './language.js';

/**
 * Edge cases that a formatter has to survive: unusual line endings, invisible
 * characters, tabs, very long lines and empty input.
 */
describe('robustness', () => {
    it('keeps a byte order mark at the start of the snippet', () => {
        const result = align('\uFEFFconst a = 1\nconst bbbb = 2')();

        expect(result.code).toBe('\uFEFFconst a   = 1\nconst bbbb = 2');
    });

    it('keeps windows line endings', () => {
        const result = align('const a = 1\r\nconst bbbb = 2')();

        expect(result.code).toBe('const a    = 1\r\nconst bbbb = 2');
    });

    it('keeps a snippet that has no trailing newline', () => {
        const result = align('const a = 1')();

        expect(result.code).toBe('const a = 1');
    });

    it('aligns a snippet that consists of whitespace only', () => {
        const result = align('   \n\t\n  ')();

        expect(result.code).toBe('   \n\t\n  ');
        expect(result.changes).toBe(0);
    });

    it('aligns a symbol that stands at the very start of a line', () => {
        const result = align('= 1\n  = 2')();

        expect(result.code).toBe('  = 1\n  = 2');
        expect(result.changes).toBe(1);
    });

    it('aligns a symbol that stands at the very end of a line', () => {
        const result = align('a =\nb =')();

        expect(result.code).toBe('a =\nb =');
        expect(result.changes).toBe(0);
    });

    it('aligns lines that are indented with tabs', () => {
        const result = align('\tx := 1\n\tyyyy := 22')({ language: 'go', symbols: [':='] });

        expect(result.code).toBe('\tx    := 1\n\tyyyy := 22');
    });

    it('aligns lines that contain non ascii characters', () => {
        const result = align('const caf\u00e9 = 1\nconst gro\u00dfer = 22')();

        expect(result.code).toBe('const caf\u00e9   = 1\nconst gro\u00dfer = 22');
    });

    it('aligns a very long line', () => {
        const long = `const name = "${'x'.repeat(5000)}";`;
        const result = align(`${long}\nconst b = 2`)();

        expect(result.code.split('\n')[0]).toBe(`const name = "${'x'.repeat(5000)}";`);
    });

    it('aligns deeply nested lines', () => {
        const nested = Array.from({ length: 40 }, (_, index) => `${' '.repeat(index * 2)}const value${index} = ${index};`).join('\n');
        const result = align(nested)();
        const lines = result.code.split('\n');

        expect(result.changes).toBeGreaterThan(0);
        expect(lines[0]).toBe(`${'const value0'.padEnd(92, ' ')}= 0;`);
        expect(lines[39]).toBe(`${' '.repeat(78)}const value39 = 39;`);
    });

    it('never throws for any language profile', () => {
        const snippets = ['', '\n', '   ', '=', '=', '=', 'a'.repeat(1000), '🎉 = 1', '﻿', 'a\r\nb\r\n'];

        allLanguages.forEach((profile) => {
            snippets.forEach((snippet) => {
                expect(() => align(snippet)({ language: profile.id })).not.toThrow();
            });
        });
    });
});

describe('performance', () => {
    it('aligns a large file within a generous budget', () => {
        const lines = Array.from({ length: 5000 }, (_, index) => `    const variableName${index} = computeValue${index}(argument${index}); // comment ${index}`);
        const code = lines.join('\n');

        const started = performance.now();
        const result = align(code)();
        const elapsed = performance.now() - started;

        expect(result.changes).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(10_000);
    });

    it('aligns a large file with several symbols within a generous budget', () => {
        const lines = Array.from({ length: 5000 }, (_, index) => `    const variableName${index}: Type${index} = computeValue${index}(argument${index});`);
        const code = lines.join('\n');

        const started = performance.now();
        const result = align(code)({ symbols: [':', '='] });
        const elapsed = performance.now() - started;

        expect(result.changes).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(10_000);
    });
});
