import { describe, it, expect } from 'vitest';
import { align } from './aligner.js';
import { allFixtures } from './fixtures.js';

describe('align with fixtures', () => {
  it.each(allFixtures)('$name', ({ input, output, changes, symbols }) => {
    const result = align(input, symbols ? { symbols } : undefined);
    expect(result.code).toBe(output);
    expect(result.changes).toBe(changes);
  });
});
