import { align, allLanguages } from '@sandlada/symbol-align';
import { describe, expect, it } from 'vitest';
import { sampleFor, samples } from './samples.js';

describe('samples', () => {
    const realWorldLanguages = ['csharp', 'typescript', 'javascript', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'cpp'] as const;

    it('starts on C#', async () => {
        expect(await sampleFor('csharp')).toContain('public sealed partial class JsonSerializerOptions');
    });

    it('uses long real-world samples for the popular programming languages', async () => {
        for (const language of realWorldLanguages) {
            expect((await sampleFor(language)).split('\n').length, language).toBeGreaterThan(100);
        }
    });

    it('has a non-empty sample for every core language', async () => {
        expect(Object.keys(samples)).toHaveLength(allLanguages.length);

        for (const profile of allLanguages) {
            expect((await sampleFor(profile.id)).trim().length, profile.id).toBeGreaterThan(0);
        }
    });

    it('aligns every sample without changing the line count', async () => {
        for (const profile of allLanguages) {
            const code = await sampleFor(profile.id);
            const result = align(code)({ language: profile.id });

            expect(result.code.split('\n'), profile.id).toHaveLength(code.split('\n').length);
            expect(result.changes, profile.id).toBeGreaterThanOrEqual(0);
        }
    });

    it('produces visible alignment for the default C# sample', async () => {
        const result = align(await sampleFor('csharp'))({ language: 'csharp' });

        expect(result.changes).toBeGreaterThan(0);
        expect(result.code).toContain('        private IJsonTypeInfoResolver?     _typeInfoResolver;');
    });
});
