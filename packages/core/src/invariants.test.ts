import { describe, expect, it } from 'vitest';
import { align } from './aligner.js';
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
});
