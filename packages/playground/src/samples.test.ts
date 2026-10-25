import { align, allLanguages } from '@sandlada/symbol-align-ts';
import { describe, expect, it } from 'vitest';
import { sampleFor, samples } from './samples.js';

describe('samples', () => {
    it('starts on C#', () => {
        expect(sampleFor('csharp')).toContain('private const string Product');
    });

    it('has a non-empty sample for every core language', () => {
        expect(Object.keys(samples)).toHaveLength(allLanguages.length);

        for (const profile of allLanguages) {
            expect(sampleFor(profile.id).trim().length, profile.id).toBeGreaterThan(0);
        }
    });

    it('aligns every sample without changing the line count', () => {
        for (const profile of allLanguages) {
            const code = sampleFor(profile.id);
            const result = align(code)({ language: profile.id });

            expect(result.code.split('\n'), profile.id).toHaveLength(code.split('\n').length);
            expect(result.changes, profile.id).toBeGreaterThanOrEqual(0);
        }
    });

    it('produces visible alignment for the default C# sample', () => {
        const result = align(sampleFor('csharp'))({ language: 'csharp' });

        expect(result.changes).toBeGreaterThan(0);
        expect(result.code).toContain('private const string Product        = "symbol-align";');
    });
});
