import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SymbolAlignConfig } from './config.js';
import { parseConfig, resolveConfig } from './config.js';
import type { LanguageId } from './types.js';

/** The language that is resolved for a file path. */
const languageOf = (config: SymbolAlignConfig, filePath: string): LanguageId | undefined => resolveConfig(config)(filePath).language;

describe('parseConfig', () => {
    it('accepts an empty configuration', () => {
        expect(parseConfig({})).toEqual({});
    });

    it('keeps the symbols, the language and the scope', () => {
        expect(parseConfig({ symbols: ['=', ':'], language: 'python', scope: 'file' })).toEqual({
            symbols: ['=', ':'],
            language: 'python',
            scope: 'file',
        });
    });

    it('keeps the overrides', () => {
        expect(parseConfig({ overrides: { '*.py': { symbols: ['='] } } })).toEqual({ overrides: { '*.py': { symbols: ['='] } } });
    });

    it('rejects an array', () => {
        expect(() => parseConfig([])).toThrow('Invalid configuration: expected an object');
    });

    it('rejects a string', () => {
        expect(() => parseConfig('symbols')).toThrow('Invalid configuration: expected an object');
    });

    it('rejects a number', () => {
        expect(() => parseConfig(42)).toThrow('Invalid configuration: expected an object');
    });

    it('rejects null', () => {
        expect(() => parseConfig(null)).toThrow('Invalid configuration: expected an object');
    });

    it('rejects symbols that are not an array', () => {
        expect(() => parseConfig({ symbols: '=' })).toThrow('Invalid configuration: "symbols" must be an array of strings');
    });

    it('rejects symbols that are not strings', () => {
        expect(() => parseConfig({ symbols: ['=', 42] })).toThrow('Invalid configuration: "symbols" must be an array of strings');
    });

    it('rejects empty symbols', () => {
        expect(() => parseConfig({ symbols: [''] })).toThrow('Invalid configuration: "symbols" must be an array of strings');
    });

    it('keeps the groups', () => {
        expect(parseConfig({ groups: [['MY_STATE1', 'MY_STATE2']] })).toEqual({ groups: [['MY_STATE1', 'MY_STATE2']] });
    });

    it('rejects groups that are not an array', () => {
        expect(() => parseConfig({ groups: 'MY_STATE1,MY_STATE2' })).toThrow('Invalid configuration: "groups" must be an array of arrays of strings');
    });

    it('rejects a group that is not an array', () => {
        expect(() => parseConfig({ groups: ['MY_STATE1'] })).toThrow('Invalid configuration: "groups" must be an array of arrays of strings');
    });

    it('rejects a group member that is not a string', () => {
        expect(() => parseConfig({ groups: [['MY_STATE1', 42]] })).toThrow('Invalid configuration: "groups" must be an array of arrays of strings');
    });

    it('rejects an empty group member', () => {
        expect(() => parseConfig({ groups: [['MY_STATE1', '']] })).toThrow('Invalid configuration: "groups" must be an array of arrays of strings');
    });

    it('rejects an unknown language', () => {
        expect(() => parseConfig({ language: 'cobol' })).toThrow('Invalid configuration: unknown language "cobol"');
    });

    it('rejects an unknown scope', () => {
        expect(() => parseConfig({ scope: 'chunk' })).toThrow('Invalid configuration: "scope" must be "block", "indent" or "file"');
    });

    it('keeps the declaration options', () => {
        expect(parseConfig({ declarations: false, declarationAnchor: 'end', maxDeclarationPad: 24 })).toEqual({ declarations: false, declarationAnchor: 'end', maxDeclarationPad: 24 });
    });

    it('rejects declarations that are not a boolean', () => {
        expect(() => parseConfig({ declarations: 'yes' })).toThrow('Invalid configuration: "declarations" must be a boolean');
    });

    it('rejects an unknown declaration anchor', () => {
        expect(() => parseConfig({ declarationAnchor: 'middle' })).toThrow('Invalid configuration: "declarationAnchor" must be "start" or "end"');
    });

    it('rejects a max declaration pad below one', () => {
        expect(() => parseConfig({ maxDeclarationPad: 0 })).toThrow('Invalid configuration: "maxDeclarationPad" must be a positive integer');
    });

    it('rejects a fractional max declaration pad', () => {
        expect(() => parseConfig({ maxDeclarationPad: 1.5 })).toThrow('Invalid configuration: "maxDeclarationPad" must be a positive integer');
    });

    it('rejects a max declaration pad that is not a number', () => {
        expect(() => parseConfig({ maxDeclarationPad: '12' })).toThrow('Invalid configuration: "maxDeclarationPad" must be a positive integer');
    });

    it('rejects overrides that are not an object', () => {
        expect(() => parseConfig({ overrides: '*.py' })).toThrow('Invalid configuration: "overrides" must be an object');
    });

    it('rejects an override that is not an object', () => {
        expect(() => parseConfig({ overrides: { '*.py': 'python' } })).toThrow('Invalid configuration: invalid override "*.py"');
    });

    it('rejects an override with invalid symbols', () => {
        expect(() => parseConfig({ overrides: { '*.py': { symbols: '=' } } })).toThrow('Invalid configuration: invalid override "*.py": "symbols" must be an array of strings');
    });

    it('rejects an override with invalid groups', () => {
        expect(() => parseConfig({ overrides: { '*.py': { groups: 'MY_STATE1' } } })).toThrow('Invalid configuration: invalid override "*.py": "groups" must be an array of arrays of strings');
    });

    it('rejects an override with an unknown language', () => {
        expect(() => parseConfig({ overrides: { '*.py': { language: 'cobol' } } })).toThrow('Invalid configuration: invalid override "*.py": unknown language "cobol"');
    });

    it('rejects an override with an unknown scope', () => {
        expect(() => parseConfig({ overrides: { '*.py': { scope: 'chunk' } } })).toThrow('Invalid configuration: invalid override "*.py": "scope" must be "block", "indent" or "file"');
    });

    it('keeps the declaration options of an override', () => {
        expect(parseConfig({ overrides: { '*.cs': { declarations: true, declarationAnchor: 'end', maxDeclarationPad: 12 } } })).toEqual({
            overrides: { '*.cs': { declarations: true, declarationAnchor: 'end', maxDeclarationPad: 12 } },
        });
    });

    it('rejects an override with invalid declarations', () => {
        expect(() => parseConfig({ overrides: { '*.cs': { declarations: 'yes' } } })).toThrow('Invalid configuration: invalid override "*.cs": "declarations" must be a boolean');
    });

    it('rejects an override with an unknown declaration anchor', () => {
        expect(() => parseConfig({ overrides: { '*.cs': { declarationAnchor: 'middle' } } })).toThrow('Invalid configuration: invalid override "*.cs": "declarationAnchor" must be "start" or "end"');
    });

    it('rejects an override with an invalid max declaration pad', () => {
        expect(() => parseConfig({ overrides: { '*.cs': { maxDeclarationPad: 0 } } })).toThrow('Invalid configuration: invalid override "*.cs": "maxDeclarationPad" must be a positive integer');
    });

    it('ignores unknown keys', () => {
        expect(parseConfig({ symbols: ['='], unknown: true })).toEqual({ symbols: ['='] });
    });

    it('ignores unknown keys of an override', () => {
        expect(parseConfig({ overrides: { '*.py': { symbols: ['='], unknown: true } } })).toEqual({ overrides: { '*.py': { symbols: ['='] } } });
    });
});

describe('resolveConfig', () => {
    it('returns the top level options when no file path is given', () => {
        const config = parseConfig({ symbols: ['='], language: 'python', scope: 'file' });

        expect(resolveConfig(config)()).toEqual({ symbols: ['='], language: 'python', scope: 'file' });
    });

    it('omits the keys that the configuration does not define', () => {
        expect(resolveConfig(parseConfig({ language: 'python' }))()).toEqual({ language: 'python' });
    });

    it('applies an override that matches the file name', () => {
        const config = parseConfig({ symbols: ['='], overrides: { '*.py': { symbols: [':'] } } });

        expect(resolveConfig(config)('main.py')).toEqual({ symbols: [':'] });
    });

    it('applies an override that matches the full path', () => {
        const config = parseConfig({ symbols: ['='], overrides: { 'src/*.py': { symbols: [':'] } } });

        expect(resolveConfig(config)('src/main.py')).toEqual({ symbols: [':'] });
    });

    it('lets a later matching override win', () => {
        const config = parseConfig({
            symbols: ['='],
            overrides: {
                '*.py': { symbols: [':'], language: 'python' },
                'main.py': { symbols: ['=>'] },
            },
        });

        expect(resolveConfig(config)('main.py')).toEqual({ symbols: ['=>'], language: 'python' });
    });

    it('leaves the keys that no override defines untouched', () => {
        const config = parseConfig({ symbols: ['='], scope: 'file', overrides: { '*.py': { language: 'python' } } });

        expect(resolveConfig(config)('main.py')).toEqual({ symbols: ['='], scope: 'file', language: 'python' });
    });

    it('does not apply an override whose pattern does not match', () => {
        const config = parseConfig({ symbols: ['='], overrides: { '*.ts': { symbols: [':'] } } });

        expect(resolveConfig(config)('main.py')).toEqual({ symbols: ['='] });
    });

    it('does not apply an override when no file path is given', () => {
        const config = parseConfig({ symbols: ['='], overrides: { '*.py': { symbols: [':'] } } });

        expect(resolveConfig(config)()).toEqual({ symbols: ['='] });
    });

    it('keeps an explicit empty symbol list as align nothing', () => {
        expect(resolveConfig(parseConfig({ symbols: [] }))()).toEqual({ symbols: [] });
    });

    it('lets an override disable alignment with an empty symbol list', () => {
        const config = parseConfig({ symbols: ['='], overrides: { '*.py': { symbols: [] } } });

        expect(resolveConfig(config)('main.py')).toEqual({ symbols: [] });
    });

    it('applies the groups of an override', () => {
        const config = parseConfig({ groups: [['A', 'B']], overrides: { '*.py': { groups: [['C', 'D']] } } });

        expect(resolveConfig(config)('main.py')).toEqual({ groups: [['C', 'D']] });
    });

    it('lets a later matching override win for groups', () => {
        const config = parseConfig({
            groups: [['A', 'B']],
            overrides: {
                '*.py': { groups: [['C', 'D']] },
                'main.py': { groups: [['E', 'F']] },
            },
        });

        expect(resolveConfig(config)('main.py')).toEqual({ groups: [['E', 'F']] });
    });

    it('keeps the base groups when no override defines them', () => {
        const config = parseConfig({ groups: [['A', 'B']], overrides: { '*.py': { language: 'python' } } });

        expect(resolveConfig(config)('main.py')).toEqual({ groups: [['A', 'B']], language: 'python' });
    });

    it('resolves groups and the declaration options of a configuration', () => {
        const config = parseConfig({ groups: [['A', 'B']], declarations: true, declarationAnchor: 'end', maxDeclarationPad: 24 });

        expect(resolveConfig(config)('input.cs')).toEqual({ groups: [['A', 'B']], declarations: true, declarationAnchor: 'end', maxDeclarationPad: 24 });
    });

    it('returns the declaration options when no file path is given', () => {
        const config = parseConfig({ declarations: false, declarationAnchor: 'end', maxDeclarationPad: 12 });

        expect(resolveConfig(config)()).toEqual({ declarations: false, declarationAnchor: 'end', maxDeclarationPad: 12 });
    });

    it('applies the declaration options of an override', () => {
        const config = parseConfig({ declarations: true, overrides: { '*.cs': { declarations: false, declarationAnchor: 'end', maxDeclarationPad: 4 } } });

        expect(resolveConfig(config)('Program.cs')).toEqual({ declarations: false, declarationAnchor: 'end', maxDeclarationPad: 4 });
    });

    it('lets a later matching override win for the declaration options', () => {
        const config = parseConfig({
            declarations: true,
            declarationAnchor: 'start',
            maxDeclarationPad: 4,
            overrides: {
                '*.cs': { declarations: false, declarationAnchor: 'end', maxDeclarationPad: 8 },
                'Program.cs': { declarations: true, declarationAnchor: 'start', maxDeclarationPad: 24 },
            },
        });

        expect(resolveConfig(config)('Program.cs')).toEqual({ declarations: true, declarationAnchor: 'start', maxDeclarationPad: 24 });
    });

    it('keeps the base declaration options when no override defines them', () => {
        const config = parseConfig({ declarations: false, declarationAnchor: 'end', maxDeclarationPad: 24, overrides: { '*.cs': { language: 'csharp' } } });

        expect(resolveConfig(config)('Program.cs')).toEqual({ declarations: false, declarationAnchor: 'end', maxDeclarationPad: 24, language: 'csharp' });
    });
});

describe('glob patterns', () => {
    it('matches a file name with a single star', () => {
        const config = parseConfig({ overrides: { '*.py': { language: 'python' } } });

        expect(languageOf(config, 'main.py')).toBe('python');
    });

    it('does not let a single star cross a directory separator', () => {
        const config = parseConfig({ overrides: { 'src/*': { language: 'python' } } });

        expect(languageOf(config, 'src/nested/main.py')).toBeUndefined();
    });

    it('matches a nested file with a single star', () => {
        const config = parseConfig({ overrides: { 'src/*': { language: 'python' } } });

        expect(languageOf(config, 'src/main.py')).toBe('python');
    });

    it('lets a double star cross a directory separator', () => {
        const config = parseConfig({ overrides: { '**/main.py': { language: 'python' } } });

        expect(languageOf(config, 'src/main.py')).toBe('python');
    });

    it('lets a leading double star match zero directories', () => {
        const config = parseConfig({ overrides: { '**/main.py': { language: 'python' } } });

        expect(languageOf(config, 'main.py')).toBe('python');
    });

    it('treats three or more stars like a double star', () => {
        const config = parseConfig({ overrides: { '***/main.py': { language: 'python' } } });

        expect(languageOf(config, 'main.py')).toBe('python');
        expect(languageOf(config, 'src/main.py')).toBe('python');
    });

    it('lets a mid pattern triple star match zero directories', () => {
        const config = parseConfig({ overrides: { 'src/***/main.py': { language: 'python' } } });

        expect(languageOf(config, 'src/main.py')).toBe('python');
        expect(languageOf(config, 'src/nested/main.py')).toBe('python');
    });

    it('matches every path with a double star', () => {
        const config = parseConfig({ overrides: { '**': { language: 'python' } } });

        expect(languageOf(config, 'src/nested/main.py')).toBe('python');
    });

    it('combines a question mark with a double star', () => {
        const config = parseConfig({ overrides: { '**/?.ts': { language: 'typescript' } } });

        expect(languageOf(config, 'a.ts')).toBe('typescript');
        expect(languageOf(config, 'ab.ts')).toBeUndefined();
        expect(languageOf(config, 'src/a.ts')).toBe('typescript');
    });

    it('does not let a question mark cross a directory separator next to a double star', () => {
        const config = parseConfig({ overrides: { 'a?**b': { language: 'python' } } });

        expect(languageOf(config, 'axb')).toBe('python');
        expect(languageOf(config, 'a/xb')).toBeUndefined();
    });

    it('matches exactly one character with a question mark', () => {
        const config = parseConfig({ overrides: { 'a?c.py': { language: 'python' } } });

        expect(languageOf(config, 'abc.py')).toBe('python');
    });

    it('does not match an empty string with a question mark', () => {
        const config = parseConfig({ overrides: { 'a?c.py': { language: 'python' } } });

        expect(languageOf(config, 'ac.py')).toBeUndefined();
    });

    it('does not match an empty string with a trailing question mark', () => {
        const config = parseConfig({ overrides: { 'main.py?': { language: 'python' } } });

        expect(languageOf(config, 'main.py')).toBeUndefined();
    });

    it('matches a single character with a trailing question mark', () => {
        const config = parseConfig({ overrides: { 'main.py?': { language: 'python' } } });

        expect(languageOf(config, 'main.pyx')).toBe('python');
    });

    it('matches every other character literally', () => {
        const config = parseConfig({ overrides: { 'a.b.py': { language: 'python' } } });

        expect(languageOf(config, 'a.b.py')).toBe('python');
    });

    it('does not treat a dot as a wildcard', () => {
        const config = parseConfig({ overrides: { 'a.b.py': { language: 'python' } } });

        expect(languageOf(config, 'axb.py')).toBeUndefined();
    });

    it('escapes regular expression metacharacters', () => {
        const config = parseConfig({ overrides: { 'a+b.py': { language: 'python' } } });

        expect(languageOf(config, 'a+b.py')).toBe('python');
    });

    it('does not treat a plus as a quantifier', () => {
        const config = parseConfig({ overrides: { 'a+b.py': { language: 'python' } } });

        expect(languageOf(config, 'aab.py')).toBeUndefined();
    });

    it('matches case sensitively', () => {
        const config = parseConfig({ overrides: { '*.PY': { language: 'python' } } });

        expect(languageOf(config, 'main.py')).toBeUndefined();
    });

    it('matches a pattern without a wildcard only exactly', () => {
        const config = parseConfig({ overrides: { 'main.py': { language: 'python' } } });

        expect(languageOf(config, 'main.py')).toBe('python');
    });

    it('does not match a pattern without a wildcard as a prefix', () => {
        const config = parseConfig({ overrides: { 'main.py': { language: 'python' } } });

        expect(languageOf(config, 'main.py.bak')).toBeUndefined();
    });

    it('matches the last path segment of a windows path', () => {
        const config = parseConfig({ overrides: { '*.py': { language: 'python' } } });

        expect(languageOf(config, 'src\\nested\\main.py')).toBe('python');
    });

    it('matches the full path of a windows path', () => {
        const config = parseConfig({ overrides: { 'src/*.py': { language: 'python' } } });

        expect(languageOf(config, 'src\\main.py')).toBe('python');
    });

    it('matches a windows separator in the pattern', () => {
        const config = parseConfig({ overrides: { 'src\\*.py': { language: 'python' } } });

        expect(languageOf(config, 'src/main.py')).toBe('python');
        expect(languageOf(config, 'src\\main.py')).toBe('python');
    });

    it('matches nested windows separators in the pattern', () => {
        const config = parseConfig({ overrides: { 'src\\**\\*.py': { language: 'python' } } });

        expect(languageOf(config, 'src/a/main.py')).toBe('python');
        expect(languageOf(config, 'src\\a\\main.py')).toBe('python');
    });
});

/** The parts of the configuration schema that mirror the configuration keys. */
interface ConfigSchema {
    readonly properties: Readonly<Record<string, unknown>>;
    readonly $defs: {
        readonly override: {
            readonly properties: Readonly<Record<string, unknown>>;
        };
    };
}

const schemaPath = fileURLToPath(new URL('../schemas/symbol-align.config.schema.json', import.meta.url));

const readSchema = (): ConfigSchema => JSON.parse(readFileSync(schemaPath, 'utf-8')) as ConfigSchema;

/*
 * `schema.test.ts` owns the language and scope enums; the declaration keys and
 * the groups are asserted here because they are parsed by this module.
 */
describe('the configuration schema', () => {
    it('describes the groups in the root and in the overrides', () => {
        const schema = readSchema();
        const shape = { type: 'array', items: { type: 'array', items: { type: 'string', minLength: 1 } } };

        expect(schema.properties.groups).toMatchObject({ ...shape, description: expect.any(String) });
        expect(schema.$defs.override.properties.groups).toMatchObject(shape);
    });

    it('describes the declarations in the root and in the overrides', () => {
        const schema = readSchema();

        expect(schema.properties.declarations).toMatchObject({ type: 'boolean' });
        expect(schema.$defs.override.properties.declarations).toMatchObject({ type: 'boolean' });
    });

    it('describes the declaration anchor in the root and in the overrides', () => {
        const schema = readSchema();
        const shape = { type: 'string', enum: ['start', 'end'] };

        expect(schema.properties.declarationAnchor).toMatchObject(shape);
        expect(schema.$defs.override.properties.declarationAnchor).toMatchObject(shape);
    });

    it('describes the max declaration pad in the root and in the overrides', () => {
        const schema = readSchema();
        const shape = { type: 'integer', minimum: 1 };

        expect(schema.properties.maxDeclarationPad).toMatchObject(shape);
        expect(schema.$defs.override.properties.maxDeclarationPad).toMatchObject(shape);
    });
});
