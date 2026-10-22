import { describe, expect, it } from 'vitest';
import { align } from './aligner.js';
import { allFixtures, type CodeFixture } from './fixtures.js';

/** Builds the alignment options a fixture asks for. */
const optionsOf = ({ symbols, language, scope }: CodeFixture) => ({
    ...(symbols ? { symbols } : {}),
    ...(language ? { language } : {}),
    ...(scope ? { scope } : {}),
});

describe('align with fixtures', () => {
    it.each(allFixtures)('$name', (fixture) => {
        const result = align(fixture.input)(optionsOf(fixture));

        expect(result.code).toBe(fixture.output);
        expect(result.changes).toBe(fixture.changes);
    });
});

describe('fixture idempotency', () => {
    it.each(allFixtures)('$name is stable on the second pass', (fixture) => {
        const first = align(fixture.input)(optionsOf(fixture));
        const second = align(first.code)(optionsOf(fixture));

        expect(second.changes).toBe(0);
        expect(second.code).toBe(first.code);
    });
});
