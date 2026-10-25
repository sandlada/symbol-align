import { describe, expect, it } from 'vitest';
import { findDeclarationCells } from './declarations.js';
import { allLanguages, languageProfile } from './language.js';
import { scanSource } from './scanner.js';
import type { DeclarationCell, DeclarationStyle, LanguageId } from './types.js';
import { BUILTIN_TYPES, DECLARATION_KEYWORDS, MODIFIERS, NON_NAMES, STATEMENT_KEYWORDS } from './vocabulary.js';

/** The first code region the scanner reports for `line`. */
const regionsOf = (line: string, language: LanguageId = 'csharp') => scanSource(line)(languageProfile(language)).codeRegions[0] ?? [];

/** Locates the cells of `line` with the real scanner in front of the locator. */
const locate = (line: string, style: DeclarationStyle = 'prefix') => findDeclarationCells(line)({ regions: regionsOf(line), style });

/** Shorthand for an expected cell. */
const cell = (kind: DeclarationCell['kind'], start: number, end: number): DeclarationCell => ({ kind, start, end });

describe('prefix declarations', () => {
    it('splits modifiers, type and name', () => {
        expect(locate('private const string Product = "symbol-align";')).toEqual([cell('modifiers', 0, 13), cell('type', 14, 20), cell('name', 21, 28)]);
    });

    it('treats a simple type as a two cell declaration', () => {
        expect(locate('int x;')).toEqual([cell('type', 0, 3), cell('name', 4, 5)]);
    });

    it('aligns a custom type with its name', () => {
        expect(locate('Product item;')).toEqual([cell('type', 0, 7), cell('name', 8, 12)]);
    });

    it('keeps a generic type in one cell', () => {
        expect(locate('List<Product> items;')).toEqual([cell('type', 0, 13), cell('name', 14, 19)]);
    });

    it('ignores a comma inside generic arguments', () => {
        expect(locate('Dictionary<string, int> map;')).toEqual([cell('type', 0, 23), cell('name', 24, 27)]);
    });

    it('keeps an array suffix in the type cell', () => {
        expect(locate('Product[] items;')).toEqual([cell('type', 0, 9), cell('name', 10, 15)]);
    });

    it('keeps a nullable marker in the type cell', () => {
        expect(locate('int? maybe;')).toEqual([cell('type', 0, 4), cell('name', 5, 10)]);
    });

    it('attaches a pointer to the name cell', () => {
        expect(locate('char *name;')).toEqual([cell('type', 0, 4), cell('name', 5, 10)]);
    });

    it('handles a three modifier prefix', () => {
        expect(locate('public static readonly int X;')).toEqual([cell('modifiers', 0, 22), cell('type', 23, 26), cell('name', 27, 28)]);
    });

    it('handles modifiers followed by a method', () => {
        expect(locate('protected internal override void Foo()')).toEqual([cell('modifiers', 0, 27), cell('type', 28, 32), cell('name', 33, 36)]);
    });

    it('stops at the parameter list', () => {
        expect(locate('private void Foo(int a = 1)')).toEqual([cell('modifiers', 0, 7), cell('type', 8, 12), cell('name', 13, 16)]);
    });

    it('uses an opening brace as the tail of a property', () => {
        expect(locate('public int Foo { get; set; }')).toEqual([cell('modifiers', 0, 6), cell('type', 7, 10), cell('name', 11, 14)]);
    });

    it('skips generic method parameters', () => {
        expect(locate('public T Foo<T>(T x)')).toEqual([cell('modifiers', 0, 6), cell('type', 7, 8), cell('name', 9, 12)]);
    });

    it('handles nested generic return types', () => {
        expect(locate('public Task<Result<T>> GetAsync()')).toEqual([cell('modifiers', 0, 6), cell('type', 7, 22), cell('name', 23, 31)]);
    });

    it('uses a comma as the tail of a multiple declarator', () => {
        expect(locate('private int a, b;')).toEqual([cell('modifiers', 0, 7), cell('type', 8, 11), cell('name', 12, 13)]);
    });

    it('handles a getter property without modifiers', () => {
        expect(locate('string Name { get; }')).toEqual([cell('type', 0, 6), cell('name', 7, 11)]);
    });
});

describe('tuple and qualified declarations', () => {
    it('accepts a balanced tuple type in front of the name', () => {
        expect(locate('(int, string) pair;')).toEqual([cell('type', 0, 13), cell('name', 14, 18)]);
    });

    it('accepts a qualified type', () => {
        expect(locate('std::string name;')).toEqual([cell('type', 0, 11), cell('name', 12, 16)]);
    });

    it('accepts a qualified generic type', () => {
        expect(locate('std::tuple<int, int> t;')).toEqual([cell('type', 0, 20), cell('name', 21, 22)]);
    });

    it('accepts a nested qualified generic type', () => {
        expect(locate('std::vector<std::pair<int, int>> values;')).toEqual([cell('type', 0, 32), cell('name', 33, 39)]);
    });

    it('rejects a tuple type that never closes', () => {
        expect(locate('(int, string pair;')).toBeNull();
    });

    it('rejects a leading group that is followed by an operator', () => {
        expect(locate('(a) + b;')).toBeNull();
    });
});

describe('var and dynamic declarations', () => {
    it('treats var as a type', () => {
        expect(locate('var x = 1;')).toEqual([cell('type', 0, 3), cell('name', 4, 5)]);
    });

    it('treats dynamic as a type', () => {
        expect(locate('dynamic y = 1;')).toEqual([cell('type', 0, 7), cell('name', 8, 9)]);
    });
});

describe('non declarations', () => {
    const rejected = ['if (x) {', 'return foo;', 'new Foo();', 'using System;', 'x = 1;', 'foo.bar = 1;', 'a::b = 1;', '$this->x = 1;', '[Required] public int X;', 'public class Foo', '@Override public void run()'];

    it.each(rejected)('returns null for %s', (line) => {
        expect(locate(line)).toBeNull();
    });

    it('rejects a type declaration keyword in the type cell', () => {
        expect(locate('public class Foo {')).toBeNull();
    });

    it('rejects an unknown declaration style', () => {
        expect(locate('int x;', 'none')).toBeNull();
    });

    it('rejects an operator expression as a name', () => {
        expect(locate('bool operator<(const Foo& other) {')).toBeNull();
    });
});

describe('statements that look like declarations', () => {
    const rejected = ['x < y;', 'a && b;', 'a + b;', 'a * b;', 'a ? b : c;', 'a<b;', 'foo(bar);'];

    it.each(rejected)('returns null for %s', (line) => {
        expect(locate(line)).toBeNull();
    });

    const accepted = ['int x;', 'char *name;', 'Product item;', 'my_type x;', 'private my_type *p;', 'std::string name;', '(int, string) pair;', 'std::tuple<int, int> t;', 'List<Product> items;', 'Product[] items;'];

    it.each(accepted)('still accepts %s', (line) => {
        const cells = locate(line);

        expect(cells).not.toBeNull();
        expect(cells?.some((shape) => shape.kind === 'type')).toBe(true);
        expect(cells?.at(-1)?.kind).toBe('name');
    });

    it('keeps a spaced pointer inside the type and out of the name', () => {
        expect(locate('char * name;')).toEqual([cell('type', 0, 6), cell('name', 7, 11)]);
    });

    it('rejects a spaced multiplication even with a pointer-like marker', () => {
        expect(locate('value * factor;')).toBeNull();
    });

    it('rejects a spaced reference between two lowercase words', () => {
        expect(locate('value & factor;')).toBeNull();
    });

    it('accepts a reference marker that touches its name', () => {
        expect(locate('Foo &value;')).toEqual([cell('type', 0, 3), cell('name', 4, 10)]);
    });
});

describe('code regions', () => {
    it('never reads a keyword out of a string', () => {
        expect(locate('string s = "private const int X = 1;";')).toEqual([cell('type', 0, 6), cell('name', 7, 8)]);
    });

    it('returns null for a comment line', () => {
        expect(locate('// private const string Product = "x";')).toBeNull();
    });

    it('returns null when a string precedes the declaration', () => {
        expect(locate('"private" + x = 1;')).toBeNull();
    });

    it('returns null without a code region', () => {
        expect(findDeclarationCells('int x;')({ regions: [], style: 'prefix' })).toBeNull();
    });

    it('clamps a region that reaches past the line', () => {
        expect(findDeclarationCells('int x;')({ regions: [{ start: 0, end: 999 }], style: 'prefix' })).toEqual([cell('type', 0, 3), cell('name', 4, 5)]);
    });

    it('handles a unicode identifier', () => {
        expect(locate('string 名前 = "x";')).toEqual([cell('type', 0, 6), cell('name', 7, 9)]);
    });

    it('trims pre-existing spacing out of the cells', () => {
        expect(locate('private   const   string   Product   = "x";')).toEqual([cell('modifiers', 0, 15), cell('type', 18, 24), cell('name', 27, 34)]);
    });

    it('handles a tab-indented declaration', () => {
        expect(locate('\tint x;')).toEqual([cell('type', 1, 4), cell('name', 5, 6)]);
    });
});

describe('type-first declarations', () => {
    it('puts the modifiers behind the type', () => {
        expect(locate('uint256 public totalSupply = 1000;', 'type-first')).toEqual([cell('type', 0, 7), cell('modifiers', 8, 14), cell('name', 15, 26)]);
    });

    it('keeps the short type before its modifiers', () => {
        expect(locate('uint8 private decimals = 18;', 'type-first')).toEqual([cell('type', 0, 5), cell('modifiers', 6, 13), cell('name', 14, 22)]);
    });

    it('falls back to two cells when no modifier follows the type', () => {
        expect(locate('uint256 totalSupply = 1000;', 'type-first')).toEqual([cell('type', 0, 7), cell('name', 8, 19)]);
    });
});

describe('vocabulary', () => {
    const sets: readonly (readonly [string, ReadonlySet<string>])[] = [
        ['BUILTIN_TYPES', BUILTIN_TYPES],
        ['DECLARATION_KEYWORDS', DECLARATION_KEYWORDS],
        ['MODIFIERS', MODIFIERS],
        ['NON_NAMES', NON_NAMES],
        ['STATEMENT_KEYWORDS', STATEMENT_KEYWORDS],
    ];

    it.each(sets)('%s is alphabetical and duplicate free', (_name, words) => {
        const list = [...words];

        expect(list).toEqual([...list].sort());
        expect(new Set(list).size).toBe(list.length);
    });

    it('treats var and dynamic as types instead of modifiers', () => {
        expect(MODIFIERS.has('var')).toBe(false);
        expect(MODIFIERS.has('dynamic')).toBe(false);
        expect(BUILTIN_TYPES.has('var')).toBe(true);
        expect(BUILTIN_TYPES.has('dynamic')).toBe(true);
    });

    it('never accepts operator as a name', () => {
        expect(NON_NAMES.has('operator')).toBe(true);
    });
});

describe('language classification', () => {
    it('classifies every prefix language', () => {
        const prefix = allLanguages
            .filter((profile) => profile.declarations === 'prefix')
            .map((profile) => profile.id)
            .sort();

        expect(prefix).toEqual(['c', 'cpp', 'csharp', 'dart', 'groovy', 'java', 'objectivec', 'php']);
    });

    it('classifies solidity as type-first', () => {
        const typeFirst = allLanguages.filter((profile) => profile.declarations === 'type-first').map((profile) => profile.id);

        expect(typeFirst).toEqual(['solidity']);
    });
});
