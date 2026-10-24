import { describe, expect, it } from 'vitest';
import { align } from './aligner.js';
import { findDeclarationCells } from './declarations.js';
import { findSymbolPositions } from './finder.js';
import { allLanguages, languageProfile } from './language.js';
import { scanSource } from './scanner.js';
import type { LanguageId } from './types.js';

/**
 * Invariants that must hold for every snippet, no matter which language it is
 * written in. The corpus is generated with a fixed seed so the suite stays
 * deterministic.
 */

/** A tiny linear congruential generator — deterministic and dependency free. */
const createRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;

    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
};

const NAMES = ['a', 'bb', 'ccc', 'variableName', 'aMuchLongerName'];
const VALUES = ['1', '22', '"text"', "'text'", '`text`', 'fn(x)', '{ a: 1 }', 'value == other', 'x => y'];
const COMMENTS = ['', ' // trailing', ' # trailing', ' /* inline */'];
const INDENTS = ['', '  ', '    ', '\t'];

/** Builds a snippet out of the given parts. */
const buildSnippet = (random: () => number, index: number): string => {
    const lines: string[] = [];

    for (let line = 0; line < 4; line += 1) {
        if (random() < 0.15) {
            lines.push('');
            continue;
        }

        const indent = INDENTS[Math.floor(random() * INDENTS.length)];
        const name = NAMES[Math.floor(random() * NAMES.length)];
        const value = VALUES[Math.floor(random() * VALUES.length)];
        const comment = COMMENTS[Math.floor(random() * COMMENTS.length)];
        const separator = random() < 0.2 ? ':' : '=';
        const trailing = random() < 0.3 ? ';' : '';

        lines.push(`${indent}const ${name} ${separator} ${value}${trailing}${comment}`);
    }

    return `${lines.join('\n')}#${index}`;
};

/** Builds the whole corpus — a handful of snippets per language. */
const buildCorpus = (language: LanguageId): readonly string[] => {
    const random = createRandom(0x5eed + language.length * 7919);

    return Array.from({ length: 12 }, (_, index) => buildSnippet(random, index));
};

const DECLARATION_MODIFIERS = ['', 'private ', 'private const ', 'public ', 'protected static '];
const DECLARATION_TYPES = ['int', 'string', 'Product', 'List<Product>', 'my_type', 'std::string', 'uint256'];

/**
 * Builds a corpus of real declarations.
 *
 * Unlike {@link buildCorpus} — which only writes `const <name> = <value>` and
 * therefore never produces a type cell — every line here is
 * `<indent><modifiers><type> <name> = <value>`, so the declaration pass always
 * has a real type cell to align.
 */
const buildDeclarationCorpus = (language: LanguageId): readonly string[] => {
    const random = createRandom(0xdec1 + language.length * 104729);

    return Array.from({ length: 8 }, () => {
        const lines: string[] = [];

        for (let line = 0; line < 4; line += 1) {
            if (random() < 0.1) {
                lines.push('');
                continue;
            }

            const indent = INDENTS[Math.floor(random() * INDENTS.length)];
            const modifiers = DECLARATION_MODIFIERS[Math.floor(random() * DECLARATION_MODIFIERS.length)];
            const type = DECLARATION_TYPES[Math.floor(random() * DECLARATION_TYPES.length)];
            const name = NAMES[Math.floor(random() * NAMES.length)];
            const value = VALUES[Math.floor(random() * VALUES.length)];
            const trailing = random() < 0.5 ? ';' : '';

            lines.push(`${indent}${modifiers}${type} ${name} = ${value}${trailing}`);
        }

        return lines.join('\n');
    });
};

/** The characters of a text without any whitespace. */
const withoutWhitespace = (text: string): string => text.replace(/\s/g, '');

/** The indices of the lines that belong to the same blank line separated block. */
const blocksOf = (lines: readonly string[]): readonly (readonly number[])[] => {
    const blocks: number[][] = [];
    let current: number[] = [];

    lines.forEach((line, index) => {
        if (line.trim().length === 0) {
            if (current.length > 0) blocks.push(current);
            current = [];
            return;
        }
        current.push(index);
    });

    if (current.length > 0) blocks.push(current);

    return blocks;
};

/** The column of the first occurrence of `symbol` on every line. */
const columnsOf = (code: string, language: LanguageId, symbol: string): readonly (number | null)[] => {
    const profile = languageProfile(language);
    const scan = scanSource(code)(profile);

    return code.split('\n').map((line, index) => {
        const positions = findSymbolPositions(line)({
            regions: scan.codeRegions[index] ?? [],
            symbols: [symbol],
            operators: profile.operators,
            comment: scan.lineComments[index],
        });

        const columns = positions.get(symbol) ?? [];

        return columns.length > 0 ? columns[0] : null;
    });
};

describe('invariants', () => {
    const languages = allLanguages.map((profile) => profile.id);

    it.each(languages)('%s keeps the code itself untouched', (language) => {
        buildCorpus(language).forEach((code) => {
            const result = align(code)({ language });

            expect(withoutWhitespace(result.code)).toBe(withoutWhitespace(code));
        });
    });

    it.each(languages)('%s never removes characters', (language) => {
        buildCorpus(language).forEach((code) => {
            const result = align(code)({ language });

            expect(result.code.length).toBeGreaterThanOrEqual(code.length);
        });
    });

    it.each(languages)('%s is idempotent', (language) => {
        buildCorpus(language).forEach((code) => {
            const first = align(code)({ language });
            const second = align(first.code)({ language });

            expect(second.code).toBe(first.code);
            expect(second.changes).toBe(0);
        });
    });

    it.each(languages)('%s holds its invariants across scopes, ranges and symbol orders', (language) => {
        const profile = languageProfile(language);
        const defaults = profile.defaultSymbols;
        const symbolSets = [defaults, [...defaults].reverse()];
        const scopes = ['block', 'indent', 'file'] as const;
        const ranges = [undefined, { start: 0, end: 2 }, { start: 2, end: 1 }] as const;

        buildCorpus(language)
            .slice(0, 4)
            .forEach((code) => {
                for (const scope of scopes) {
                    for (const range of ranges) {
                        for (const symbols of symbolSets) {
                            const options = { language, scope, ...(range === undefined ? {} : { range }), symbols };
                            const first = align(code)(options);
                            const second = align(first.code)(options);

                            expect(withoutWhitespace(first.code)).toBe(withoutWhitespace(code));
                            expect(first.code.length).toBeGreaterThanOrEqual(code.length);
                            expect(second.code).toBe(first.code);
                            expect(second.changes).toBe(0);

                            if (range !== undefined) {
                                const before = code.split('\n');
                                const after = first.code.split('\n');

                                before.forEach((line, index) => {
                                    if (index < range.start || index >= range.end) {
                                        expect(after[index]).toBe(line);
                                    }
                                });
                            }
                        }
                    }
                }
            });
    });

    it.each(languages)('%s never changes the indentation of a line', (language) => {
        buildCorpus(language).forEach((code) => {
            const result = align(code)({ language });
            const before = code.split('\n');
            const after = result.code.split('\n');

            after.forEach((line, index) => {
                const indent = line.length - line.trimStart().length;
                const originalIndent = before[index].length - before[index].trimStart().length;

                expect(indent).toBe(originalIndent);
            });
        });
    });

    it.each(languages)('%s is idempotent with declarations enabled', (language) => {
        buildCorpus(language).forEach((code) => {
            const first = align(code)({ language, declarations: true });
            const second = align(first.code)({ language, declarations: true });

            expect(second.code).toBe(first.code);
            expect(second.changes).toBe(0);
        });
    });

    it.each(languages)('%s keeps the code characters with declarations enabled', (language) => {
        buildCorpus(language).forEach((code) => {
            const result = align(code)({ language, declarations: true });

            expect(withoutWhitespace(result.code)).toBe(withoutWhitespace(code));
        });
    });

    it('builds a declaration corpus with a type cell on every line', () => {
        const profile = languageProfile('csharp');

        buildDeclarationCorpus('csharp').forEach((code) => {
            code.split('\n').forEach((line) => {
                if (line.trim().length === 0) {
                    return;
                }

                const regions = scanSource(line)(profile).codeRegions[0] ?? [];
                const cells = findDeclarationCells(line)({ regions, style: 'prefix' });

                expect(cells).not.toBeNull();
                expect(cells?.some((cell) => cell.kind === 'type')).toBe(true);
            });
        });
    });

    it.each(languages)('%s keeps the indentation of its declaration corpus', (language) => {
        buildDeclarationCorpus(language).forEach((code) => {
            const result = align(code)({ language, declarations: true });
            const before = code.split('\n');
            const after = result.code.split('\n');

            after.forEach((line, index) => {
                const indent = line.length - line.trimStart().length;
                const originalIndent = before[index].length - before[index].trimStart().length;

                expect(indent).toBe(originalIndent);
            });
        });
    });

    it.each(languages)('%s is idempotent on its declaration corpus', (language) => {
        buildDeclarationCorpus(language).forEach((code) => {
            const first = align(code)({ language, declarations: true });
            const second = align(first.code)({ language, declarations: true });

            expect(second.code).toBe(first.code);
            expect(second.changes).toBe(0);
        });
    });

    it.each(languages)('%s keeps the code characters of its declaration corpus', (language) => {
        buildDeclarationCorpus(language).forEach((code) => {
            const result = align(code)({ language, declarations: true });

            expect(withoutWhitespace(result.code)).toBe(withoutWhitespace(code));
        });
    });

    const declarationLanguages = allLanguages.filter((profile) => profile.declarations !== 'none').map((profile) => profile.id);

    it.each(declarationLanguages)('%s is idempotent with the end anchor', (language) => {
        buildDeclarationCorpus(language).forEach((code) => {
            for (const maxDeclarationPad of [1, 4, 12]) {
                const options = { language, declarations: true, declarationAnchor: 'end', maxDeclarationPad } as const;
                const first = align(code)(options);
                const second = align(first.code)(options);

                expect(withoutWhitespace(first.code)).toBe(withoutWhitespace(code));
                expect(second.code).toBe(first.code);
                expect(second.changes).toBe(0);
            }
        });
    });

    it.each(declarationLanguages)('%s is idempotent with a declaration pad limit', (language) => {
        buildDeclarationCorpus(language).forEach((code) => {
            for (const maxDeclarationPad of [1, 4, 12]) {
                const options = { language, declarations: true, maxDeclarationPad } as const;
                const first = align(code)(options);
                const second = align(first.code)(options);

                expect(withoutWhitespace(first.code)).toBe(withoutWhitespace(code));
                expect(second.code).toBe(first.code);
                expect(second.changes).toBe(0);
            }
        });
    });

    it.each(languages)('%s aligns every symbol of a block to one column', (language) => {
        const symbol = languageProfile(language).defaultSymbols[0];

        buildCorpus(language).forEach((code) => {
            const result = align(code)({ language, symbols: [symbol] });
            const columns = columnsOf(result.code, language, symbol);

            blocksOf(result.code.split('\n')).forEach((block) => {
                const present = block.map((index) => columns[index]).filter((column): column is number => column !== null);

                if (present.length < 2) {
                    return;
                }

                expect(new Set(present).size).toBe(1);
            });
        });
    });

    it.each(languages)('%s aligns a two-word group without changing the code', (language) => {
        const code = ['const MY_STATE1 = 1;', 'const muchLonger = MY_STATE2;'].join('\n');
        const options = { language, symbols: [], groups: [['MY_STATE1', 'MY_STATE2']], declarations: false } as const;
        const first = align(code)(options);
        const second = align(first.code)(options);

        expect(first.changes).toBe(1);
        expect(withoutWhitespace(first.code)).toBe(withoutWhitespace(code));
        expect(first.code.length).toBeGreaterThanOrEqual(code.length);
        expect(second.code).toBe(first.code);
        expect(second.changes).toBe(0);
    });

    it.each(declarationLanguages)('%s is idempotent when a group member sits in a declaration prefix', (language) => {
        buildDeclarationCorpus(language).forEach((code) => {
            const options = { language, groups: [['Product']] } as const;
            const first = align(code)(options);
            const second = align(first.code)(options);

            expect(withoutWhitespace(first.code)).toBe(withoutWhitespace(code));
            expect(first.code.length).toBeGreaterThanOrEqual(code.length);
            expect(second.code).toBe(first.code);
            expect(second.changes).toBe(0);
        });
    });
});
