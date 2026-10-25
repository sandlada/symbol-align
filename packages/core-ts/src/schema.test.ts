import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allLanguages } from './language.js';

/** The schema that describes the `symbol-align.config.json` file. */
interface ConfigSchema {
    readonly properties: {
        readonly language: { readonly enum: readonly string[] };
        readonly scope: { readonly enum: readonly string[] };
    };
    readonly $defs: {
        readonly override: {
            readonly properties: {
                readonly language: { readonly enum: readonly string[] };
                readonly scope: { readonly enum: readonly string[] };
            };
        };
    };
}

const schemaPath = fileURLToPath(new URL('../schemas/symbol-align.config.schema.json', import.meta.url));

const readSchema = (): ConfigSchema => JSON.parse(readFileSync(schemaPath, 'utf-8')) as ConfigSchema;

describe('the configuration schema', () => {
    it('lists every language profile', () => {
        expect(readSchema().properties.language.enum).toEqual(allLanguages.map((profile) => profile.id));
    });

    it('lists the language profiles of the overrides as well', () => {
        expect(readSchema().$defs.override.properties.language.enum).toEqual(allLanguages.map((profile) => profile.id));
    });

    it('lists every alignment scope', () => {
        const scopes = ['block', 'indent', 'file'];

        expect(readSchema().properties.scope.enum).toEqual(scopes);
        expect(readSchema().$defs.override.properties.scope.enum).toEqual(scopes);
    });
});
