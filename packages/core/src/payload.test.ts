import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SymbolAlignError } from './errors.js';

const { scanCode, findSymbols, findDeclarations } = vi.hoisted(() => ({
    scanCode: vi.fn<() => string>(),
    findSymbols: vi.fn<() => string>(),
    findDeclarations: vi.fn<() => string>(),
}));

vi.mock('./abi.js', () => ({ scanCode, findSymbols, findDeclarations }));

const { findDeclarationCells } = await import('./declarations.js');
const { findSymbolPositions } = await import('./finder.js');
const { scanSource } = await import('./scanner.js');
const { languageProfile } = await import('./language.js');

beforeEach(() => {
    scanCode.mockReset();
    findSymbols.mockReset();
    findDeclarations.mockReset();
});

describe('scanSource', () => {
    it('rehydrates a valid payload', () => {
        scanCode.mockReturnValue('{"codeRegions":[{"start":0,"end":5}],"lineComments":[null]}');

        const result = scanSource('const')(languageProfile('generic'));

        expect(result.codeRegions).toEqual([{ start: 0, end: 5 }]);
        expect(result.lineComments).toEqual([undefined]);
    });

    it('throws a core error for a payload without the expected shape', () => {
        scanCode.mockReturnValue('{"codeRegions":"nope","lineComments":[]}');

        expect(() => scanSource('const')(languageProfile('generic'))).toThrow(SymbolAlignError);
    });
});

describe('findSymbolPositions', () => {
    it('rehydrates a valid payload', () => {
        findSymbols.mockReturnValue('[["=", [2, 8]]]');

        const positions = findSymbolPositions('a = 1')({ regions: [], symbols: ['='] });

        expect(positions.get('=')).toEqual([2, 8]);
    });

    it('throws a core error for a payload without the expected shape', () => {
        findSymbols.mockReturnValue('[["=", "nope"]]');

        expect(() => findSymbolPositions('a = 1')({ regions: [], symbols: ['='] })).toThrow(SymbolAlignError);
    });
});

describe('findDeclarationCells', () => {
    it('returns the cells of a valid payload', () => {
        findDeclarations.mockReturnValue('[{"kind":"name","start":6,"end":9}]');

        const cells = findDeclarationCells('int x;')({ regions: [{ start: 0, end: 5 }], style: 'prefix' });

        expect(cells).toEqual([{ kind: 'name', start: 6, end: 9 }]);
    });

    it('returns null when the line is not a declaration', () => {
        findDeclarations.mockReturnValue('null');

        expect(findDeclarationCells('x = 1;')({ regions: [{ start: 0, end: 5 }], style: 'prefix' })).toBeNull();
    });

    it('throws a core error for a payload without the expected shape', () => {
        findDeclarations.mockReturnValue('42');

        expect(() => findDeclarationCells('int x;')({ regions: [{ start: 0, end: 5 }], style: 'prefix' })).toThrow(SymbolAlignError);
    });
});
