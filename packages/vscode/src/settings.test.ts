import { describe, expect, it } from 'vitest';

import { readDeclarationAnchor, readGroups, readMaxDeclarationPad, readScope, readSettings, readSymbols, resolveTargetLanguage } from './settings.js';

describe('readScope', () => {
    it('keeps a known scope', () => {
        expect(readScope('indent')).toBe('indent');
        expect(readScope('file')).toBe('file');
        expect(readScope('block')).toBe('block');
    });

    it('falls back to block for an unknown scope', () => {
        expect(readScope('everything')).toBe('block');
        expect(readScope(undefined)).toBe('block');
        expect(readScope(42)).toBe('block');
    });
});

describe('readDeclarationAnchor', () => {
    it('keeps a known anchor', () => {
        expect(readDeclarationAnchor('end')).toBe('end');
        expect(readDeclarationAnchor('start')).toBe('start');
    });

    it('falls back to start for an unknown anchor', () => {
        expect(readDeclarationAnchor('middle')).toBe('start');
        expect(readDeclarationAnchor(undefined)).toBe('start');
    });
});

describe('readMaxDeclarationPad', () => {
    it('keeps a positive integer', () => {
        expect(readMaxDeclarationPad(24)).toBe(24);
    });

    it('reads zero as unlimited', () => {
        expect(readMaxDeclarationPad(0)).toBe(0);
    });

    it('reads a negative value as unlimited', () => {
        expect(readMaxDeclarationPad(-5)).toBe(0);
    });

    it('falls back to the default for a value that is not an integer', () => {
        expect(readMaxDeclarationPad(1.5)).toBe(12);
        expect(readMaxDeclarationPad(Number.NaN)).toBe(12);
        expect(readMaxDeclarationPad(Number.POSITIVE_INFINITY)).toBe(12);
        expect(readMaxDeclarationPad('8')).toBe(12);
        expect(readMaxDeclarationPad(undefined)).toBe(12);
    });
});

describe('readSymbols', () => {
    it('keeps the symbols of the list', () => {
        expect(readSymbols(['=', ':'])).toEqual(['=', ':']);
    });

    it('drops the entries that are not a non empty string', () => {
        expect(readSymbols(['=', '', 3, null, ':'])).toEqual(['=', ':']);
    });

    it('returns an empty list for a value that is not a list', () => {
        expect(readSymbols('=')).toEqual([]);
        expect(readSymbols(undefined)).toEqual([]);
    });
});

describe('readGroups', () => {
    it('keeps the groups of the list', () => {
        expect(
            readGroups([
                ['MY_STATE1', 'MY_STATE2'],
                ['A', 'B'],
            ]),
        ).toEqual([
            ['MY_STATE1', 'MY_STATE2'],
            ['A', 'B'],
        ]);
    });

    it('drops a group without a usable member', () => {
        expect(readGroups([['MY_STATE1'], ['', 3], 'nope'])).toEqual([['MY_STATE1']]);
    });

    it('returns an empty list for a value that is not a list', () => {
        expect(readGroups('nope')).toEqual([]);
        expect(readGroups(undefined)).toEqual([]);
    });
});

describe('resolveTargetLanguage', () => {
    it('detects the profile from the language id when the setting is auto', () => {
        expect(resolveTargetLanguage('auto', 'typescript')).toBe('typescript');
        expect(resolveTargetLanguage('auto', 'csharp')).toBe('csharp');
    });

    it('uses the configured profile', () => {
        expect(resolveTargetLanguage('python', 'typescript')).toBe('python');
    });

    it('returns nothing for an unknown configured profile', () => {
        expect(resolveTargetLanguage('klingon', 'typescript')).toBeUndefined();
    });

    it('returns nothing for an unknown language id', () => {
        expect(resolveTargetLanguage('auto', 'klingon')).toBeUndefined();
    });
});

describe('readSettings', () => {
    it('reads the values of the configuration', () => {
        const settings = readSettings({
            enabled: false,
            symbols: ['='],
            groups: [['A', 'B']],
            language: 'rust',
            scope: 'file',
            declarations: false,
            declarationAnchor: 'end',
            maxDeclarationPad: 30,
        });

        expect(settings).toEqual({
            enabled: false,
            symbols: ['='],
            groups: [['A', 'B']],
            language: 'rust',
            scope: 'file',
            declarations: false,
            declarationAnchor: 'end',
            maxDeclarationPad: 30,
        });
    });

    it('falls back to the defaults of the core library', () => {
        expect(readSettings({})).toEqual({
            enabled: true,
            symbols: [],
            groups: [],
            language: 'auto',
            scope: 'block',
            declarations: true,
            declarationAnchor: 'start',
            maxDeclarationPad: 12,
        });
    });

    it('falls back to the defaults for values of the wrong type', () => {
        const settings = readSettings({
            enabled: 'yes',
            scope: 3,
            declarations: 'no',
            declarationAnchor: null,
            maxDeclarationPad: {},
        });

        expect(settings.enabled).toBe(true);
        expect(settings.scope).toBe('block');
        expect(settings.declarations).toBe(true);
        expect(settings.declarationAnchor).toBe('start');
        expect(settings.maxDeclarationPad).toBe(12);
    });
});
