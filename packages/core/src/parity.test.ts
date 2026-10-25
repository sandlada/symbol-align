import { describe, expect, it } from 'vitest';

import { readProfiles } from './abi.js';
import { allLanguages } from './language.js';

/**
 * Guards the data contract between the generated TypeScript table and the
 * Rust profile table. Both are generated from `languages.json`; a drift here
 * would make `align` and `scanSource` disagree about a language.
 */
describe('the Rust core', () => {
    it('publishes the same language profiles as the TypeScript table', () => {
        expect(JSON.parse(readProfiles())).toEqual(allLanguages);
    });
});
