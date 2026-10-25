import { describe, it, expect } from 'vitest';
import { findSymbolPositions } from './finder.js';
import type { CodeRegion } from './types.js';

const wholeLine = (line: string): readonly CodeRegion[] => [{ start: 0, end: line.length }];

describe('findSymbolPositions', () => {
    it('finds a simple symbol at the right column', () => {
        const line = 'const x = 1';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='] });
        expect(result.get('=')).toEqual([8]);
    });

    it('reports every requested symbol even when it is absent', () => {
        const line = 'const x = 1';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['=', ':'] });
        expect(result.has('=')).toBe(true);
        expect(result.has(':')).toBe(true);
        expect(result.get(':')).toEqual([]);
    });

    it('does not find symbols outside of the given regions', () => {
        const line = 'x = "a = b"';
        const result = findSymbolPositions(line)({ regions: [{ start: 0, end: 4 }], symbols: ['='] });
        expect(result.get('=')).toEqual([2]);
    });

    it('does not find a symbol that only partially overlaps a region', () => {
        const line = 'x = "a = b"';
        const result = findSymbolPositions(line)({ regions: [{ start: 0, end: 3 }], symbols: ['='] });
        expect(result.get('=')).toEqual([2]);
    });

    it('prefers the longest symbol at a position', () => {
        const line = 'const f = (x) => x';
        const result = findSymbolPositions(line)({
            regions: wholeLine(line),
            symbols: ['=', '=>'],
            operators: ['=>', '==', '==='],
        });
        expect(result.get('=')).toEqual([8]);
        expect(result.get('=>')).toEqual([14]);
    });

    it('rejects the equals sign of an arrow when only the equals sign is requested', () => {
        const line = 'const f = (x) => x';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='], operators: ['=>'] });
        expect(result.get('=')).toEqual([8]);
    });

    it('rejects the equals sign of an equality operator', () => {
        const line = 'if (a == b) {}';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='], operators: ['=='] });
        expect(result.get('=')).toEqual([]);
    });

    it('rejects the equals sign of a short variable declaration', () => {
        const line = 'x := 1';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='], operators: [':='] });
        expect(result.get('=')).toEqual([]);
    });

    it('rejects the equals sign of a comparison operator', () => {
        const line = 'if (a >= b) {}';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='], operators: ['>='] });
        expect(result.get('=')).toEqual([]);
    });

    it('rejects the equals sign of a compound assignment', () => {
        const line = 'total += amount';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='], operators: ['+='] });
        expect(result.get('=')).toEqual([]);
    });

    it('accepts a short variable declaration when the declaration operator is requested', () => {
        const line = 'x := 1';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: [':='], operators: [':='] });
        expect(result.get(':=')).toEqual([2]);
    });

    it('does not let an operator inside a string invalidate a code match', () => {
        const line = 'x = "=="';
        const result = findSymbolPositions(line)({
            regions: [{ start: 0, end: 4 }],
            symbols: ['='],
            operators: ['=='],
        });
        expect(result.get('=')).toEqual([2]);
    });

    it('rejects the equals sign of the longest matching operator token', () => {
        const line = 'if (a === b) {}';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='], operators: ['===', '=='] });
        expect(result.get('=')).toEqual([]);
    });

    it('accepts an operator symbol that is not a fragment of a longer token', () => {
        const line = 'x = 1';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='], operators: ['=='] });
        expect(result.get('=')).toEqual([2]);
    });

    it('respects word boundaries of word symbols', () => {
        const line = 'const readonlyThing = 1;';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['readonly'] });
        expect(result.get('readonly')).toEqual([]);
    });

    it('finds a word symbol that stands on its own', () => {
        const line = 'const readonly = 1;';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['readonly'] });
        expect(result.get('readonly')).toEqual([6]);
    });

    it('reports the column of the comment marker when the marker is requested', () => {
        const line = 'const x = 1 // note';
        const result = findSymbolPositions(line)({
            regions: [{ start: 0, end: 11 }],
            symbols: ['=', '//'],
            comment: { column: 12, marker: '//' },
        });
        expect(result.get('//')).toEqual([12]);
        expect(result.get('=')).toEqual([8]);
    });

    it('does not report the comment marker when it is not requested', () => {
        const line = 'const x = 1 // note';
        const result = findSymbolPositions(line)({
            regions: [{ start: 0, end: 11 }],
            symbols: ['='],
            comment: { column: 12, marker: '//' },
        });
        expect(result.get('=')).toEqual([8]);
        expect(result.get('//')).toBeUndefined();
    });

    it('reports every occurrence of a symbol on the line', () => {
        const line = 'a = b; c = d;';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: ['='] });
        expect(result.get('=')).toEqual([2, 9]);
    });

    it('reports every occurrence of a symbol across several regions', () => {
        const line = 'a = b; /* x */ c = d;';
        const result = findSymbolPositions(line)({
            regions: [
                { start: 0, end: 5 },
                { start: 15, end: 20 },
            ],
            symbols: ['='],
        });
        expect(result.get('=')).toEqual([2, 17]);
    });

    it('returns an empty map when no symbol is requested', () => {
        const line = 'const x = 1';
        const result = findSymbolPositions(line)({ regions: wholeLine(line), symbols: [] });
        expect(result.size).toBe(0);
    });

    it('reports nothing for an empty line', () => {
        const result = findSymbolPositions('')({ regions: [{ start: 0, end: 0 }], symbols: ['='] });
        expect(result.get('=')).toEqual([]);
    });
});
