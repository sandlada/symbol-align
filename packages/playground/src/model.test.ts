import { allLanguages } from '@sandlada/symbol-align';
import { describe, expect, it } from 'vitest';
import type { AlignmentSettings } from './model.js';
import {
    DEFAULT_DECLARATION_ANCHOR,
    DEFAULT_DECLARATIONS,
    DEFAULT_LANGUAGE,
    DEFAULT_MAX_DECLARATION_PAD,
    DEFAULT_SCOPE,
    DEFAULT_SETTINGS,
    MAX_GROUP_MEMBER_LENGTH,
    defaultSymbols,
    formatDuration,
    formatNumber,
    languageGroups,
    normalizeSymbol,
    parseGroups,
    parseMaxPad,
    runAlignment,
    scopeLabel,
    symbolChoices,
    toggleSymbol,
} from './model.js';

/** Settings for a run: generic defaults with per-test overrides. */
const settings = (overrides: Partial<AlignmentSettings> = {}): AlignmentSettings => ({
    language: 'generic',
    symbols: ['='],
    scope: 'block',
    declarations: DEFAULT_SETTINGS.declarations,
    declarationAnchor: DEFAULT_SETTINGS.declarationAnchor,
    maxDeclarationPad: DEFAULT_SETTINGS.maxDeclarationPad,
    groups: DEFAULT_SETTINGS.groups,
    ...overrides,
});

describe('defaults', () => {
    it('starts on C# with the block scope', () => {
        expect(DEFAULT_LANGUAGE).toBe('csharp');
        expect(DEFAULT_SCOPE).toBe('block');
        expect(defaultSymbols(DEFAULT_LANGUAGE)).toEqual(['=']);
    });

    it('starts with declaration columns enabled at the start edge', () => {
        expect(DEFAULT_DECLARATIONS).toBe(true);
        expect(DEFAULT_DECLARATION_ANCHOR).toBe('start');
        expect(DEFAULT_MAX_DECLARATION_PAD).toBe(12);
        expect(DEFAULT_SETTINGS).toEqual({ declarations: true, declarationAnchor: 'start', maxDeclarationPad: 12, groups: [] });
    });

    it('returns a fresh default symbol list', () => {
        expect(defaultSymbols('go')).not.toBe(defaultSymbols('go'));
        expect(defaultSymbols('go')).toEqual(['=', ':=']);
    });
});

describe('symbolChoices', () => {
    it('puts the language defaults first and includes the common symbols', () => {
        const choices = symbolChoices('json');

        expect(choices[0]).toBe(':');
        expect(choices).toContain('=');
        expect(choices).toContain('//');
        expect(new Set(choices).size).toBe(choices.length);
    });

    it('appends custom symbols without duplicating an existing one', () => {
        const choices = symbolChoices('csharp', ['<=>', '=']);

        expect(choices[0]).toBe('=');
        expect(choices).toContain('<=>');
        expect(choices.filter((symbol) => symbol === '=')).toHaveLength(1);
    });
});

describe('normalizeSymbol', () => {
    it('accepts punctuation and word symbols', () => {
        expect(normalizeSymbol('=>')).toBe('=>');
        expect(normalizeSymbol('//')).toBe('//');
        expect(normalizeSymbol('readonly')).toBe('readonly');
    });

    it('trims surrounding whitespace', () => {
        expect(normalizeSymbol('  :  ')).toBe(':');
    });

    it('rejects empty values and values with inner whitespace', () => {
        expect(normalizeSymbol('   ')).toBeNull();
        expect(normalizeSymbol('a b')).toBeNull();
        expect(normalizeSymbol('a\tb')).toBeNull();
    });

    it('rejects symbols longer than eight characters', () => {
        expect(normalizeSymbol('12345678')).toBe('12345678');
        expect(normalizeSymbol('123456789')).toBeNull();
    });
});

describe('parseGroups', () => {
    it('treats an empty input as no groups', () => {
        expect(parseGroups('')).toEqual([]);
        expect(parseGroups('   ')).toEqual([]);
    });

    it('parses one comma separated group', () => {
        expect(parseGroups('STATE1,STATE2')).toEqual([['STATE1', 'STATE2']]);
    });

    it('accepts the documented example members that are longer than a symbol', () => {
        expect(parseGroups('MY_STATE1,MY_STATE2')).toEqual([['MY_STATE1', 'MY_STATE2']]);
    });

    it('parses multiple semicolon separated groups', () => {
        expect(parseGroups('A,B;C;D,E')).toEqual([['A', 'B'], ['C'], ['D', 'E']]);
    });

    it('trims every member', () => {
        expect(parseGroups('  A , B  ;  C  ')).toEqual([['A', 'B'], ['C']]);
    });

    it('drops empty members and empty groups', () => {
        expect(parseGroups(',A,,B,; , ;C,')).toEqual([['A', 'B'], ['C']]);
        expect(parseGroups(';;,')).toEqual([]);
    });

    it('rejects members that contain whitespace', () => {
        expect(parseGroups('A B')).toBeNull();
        expect(parseGroups('A,B\tC')).toBeNull();
    });

    it('accepts members up to the group member limit and rejects longer ones', () => {
        expect(MAX_GROUP_MEMBER_LENGTH).toBe(64);
        expect(parseGroups('a'.repeat(64))).toEqual([['a'.repeat(64)]]);
        expect(parseGroups('a'.repeat(65))).toBeNull();
        expect(parseGroups(`A;${'a'.repeat(65)}`)).toBeNull();
    });
});

describe('parseMaxPad', () => {
    it('accepts the inclusive bounds and surrounding whitespace', () => {
        expect(parseMaxPad('1')).toBe(1);
        expect(parseMaxPad('999')).toBe(999);
        expect(parseMaxPad(' 12 ')).toBe(12);
    });

    it('rejects values outside the supported range', () => {
        expect(parseMaxPad('0')).toBeNull();
        expect(parseMaxPad('1000')).toBeNull();
        expect(parseMaxPad('-1')).toBeNull();
    });

    it('rejects empty and non-numeric values', () => {
        expect(parseMaxPad('')).toBeNull();
        expect(parseMaxPad('abc')).toBeNull();
        expect(parseMaxPad('1e2')).toBeNull();
    });

    it('rejects non-integer values', () => {
        expect(parseMaxPad('12.5')).toBeNull();
        expect(parseMaxPad('1.0')).toBeNull();
    });
});

describe('toggleSymbol', () => {
    it('adds a missing symbol without mutating the input', () => {
        const before = ['='];

        expect(toggleSymbol(before, ':')).toEqual(['=', ':']);
        expect(before).toEqual(['=']);
    });

    it('removes an existing symbol', () => {
        expect(toggleSymbol(['=', ':'], '=')).toEqual([':']);
    });
});

describe('languageGroups', () => {
    it('lists every core profile exactly once', () => {
        const ids = languageGroups().flatMap((group) => group.options.map((option) => option.id));

        expect(new Set(ids).size).toBe(allLanguages.length);
        expect(ids).toHaveLength(allLanguages.length);
        expect(ids).toContain('csharp');
    });

    it('pins C# in the popular group and sorts the remaining profiles', () => {
        const [popular, more] = languageGroups();

        expect(popular?.label).toBe('Popular');
        expect(popular?.options[0]?.id).toBe('csharp');
        expect(more?.options.length).toBeGreaterThan(0);

        const names = more?.options.map((option) => option.name) ?? [];
        const sorted = [...names].sort((left, right) => left.localeCompare(right, 'en'));

        expect(names).toEqual(sorted);
    });
});

describe('runAlignment', () => {
    it('aligns the selected symbol and reports the input size', () => {
        const snapshot = runAlignment('a = 1\nlongName = 2', settings());

        expect(snapshot.code).toBe('a        = 1\nlongName = 2');
        expect(snapshot.changes).toBe(1);
        expect(snapshot.lineCount).toBe(2);
        expect(snapshot.characterCount).toBe(18);
        expect(snapshot.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('returns the input unchanged when no symbols are selected', () => {
        const code = 'a = 1\nlongerName = 2';
        const snapshot = runAlignment(code, settings({ symbols: [] }));

        expect(snapshot.code).toBe(code);
        expect(snapshot.changes).toBe(0);
    });

    it('honours the grouping scope', () => {
        const code = 'name = "foo"\n\nlongerName = "bar"';
        const blocked = runAlignment(code, settings());
        const file = runAlignment(code, settings({ scope: 'file' }));

        expect(blocked.changes).toBe(0);
        expect(file.code).toBe('name       = "foo"\n\nlongerName = "bar"');
    });

    it('reproduces the legacy output when declarations are disabled', () => {
        const code = ['public required string name = "value";', 'internal readonly int longValue = 42;', 'protected string x = "default";'].join('\n');
        const snapshot = runAlignment(code, settings({ language: 'csharp', declarations: false }));

        expect(snapshot.code).toBe(['public required string name     = "value";', 'internal readonly int longValue = 42;', 'protected string x              = "default";'].join('\n'));
        expect(snapshot.changes).toBe(2);
    });

    it('aligns the declaration columns when declarations are enabled', () => {
        const code = ['public required string name = "value";', 'internal readonly int longValue = 42;', 'protected string x = "default";'].join('\n');
        const snapshot = runAlignment(code, settings({ language: 'csharp', declarations: true }));

        expect(snapshot.code).toBe(['public required   string name      = "value";', 'internal readonly int    longValue = 42;', 'protected         string x         = "default";'].join('\n'));
    });

    it('passes custom groups through to the aligner', () => {
        const code = ['let status = MY_STATE1;', 'let longName = MY_STATE2;'].join('\n');
        const snapshot = runAlignment(code, settings({ symbols: [], groups: [['MY_STATE1', 'MY_STATE2']] }));

        expect(snapshot.code).toBe(['let status =   MY_STATE1;', 'let longName = MY_STATE2;'].join('\n'));
        expect(snapshot.changes).toBe(1);
    });

    it('pads the type in front with the end anchor', () => {
        const code = ['private const string Product = "symbol-align";', 'private const int DefaultPort = 5173;'].join('\n');
        const snapshot = runAlignment(code, settings({ language: 'csharp', declarationAnchor: 'end' }));

        expect(snapshot.code).toBe(['private const string Product     = "symbol-align";', 'private const    int DefaultPort = 5173;'].join('\n'));
    });

    it('passes the max declaration pad through to the aligner', () => {
        const code = ['public int a { get; set; }', 'public VeryLongType b { get; set; }'].join('\n');
        const snapshot = runAlignment(code, settings({ language: 'csharp', maxDeclarationPad: 1 }));

        expect(snapshot.code).toBe(code);
        expect(snapshot.changes).toBe(0);
    });
});

describe('status formatting', () => {
    it('formats durations at the right precision', () => {
        expect(formatDuration(0.4)).toBe('<1 ms');
        expect(formatDuration(2.34)).toBe('2.3 ms');
        expect(formatDuration(12.6)).toBe('13 ms');
    });

    it('formats counts with thousands separators', () => {
        expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('names every scope', () => {
        expect(scopeLabel('block')).toBe('Block scope');
        expect(scopeLabel('indent')).toBe('Indent scope');
        expect(scopeLabel('file')).toBe('File scope');
    });
});
