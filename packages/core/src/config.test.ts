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

    it('rejects an unknown language', () => {
        expect(() => parseConfig({ language: 'cobol' })).toThrow('Invalid configuration: unknown language "cobol"');
    });

    it('rejects an unknown scope', () => {
        expect(() => parseConfig({ scope: 'chunk' })).toThrow('Invalid configuration: "scope" must be "block" or "file"');
    });

    it('rejects overrides that are not an object', () => {
        expect(() => parseConfig({ overrides: '*.py' })).toThrow('Invalid configuration: "overrides" must be an object');
    });

    it('rejects an override that is not an object', () => {
        expect(() => parseConfig({ overrides: { '*.py': 'python' } })).toThrow('Invalid configuration: invalid override "*.py"');
    });

    it('rejects an override with invalid symbols', () => {
        expect(() => parseConfig({ overrides: { '*.py': { symbols: '=' } } })).toThrow('Invalid configuration: invalid override "*.py"');
    });

    it('rejects an override with an unknown language', () => {
        expect(() => parseConfig({ overrides: { '*.py': { language: 'cobol' } } })).toThrow('Invalid configuration: invalid override "*.py"');
    });

    it('rejects an override with an unknown scope', () => {
        expect(() => parseConfig({ overrides: { '*.py': { scope: 'chunk' } } })).toThrow('Invalid configuration: invalid override "*.py"');
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

    it('matches every path with a double star', () => {
        const config = parseConfig({ overrides: { '**': { language: 'python' } } });

        expect(languageOf(config, 'src/nested/main.py')).toBe('python');
    });

    it('matches exactly one character with a question mark', () => {
        const config = parseConfig({ overrides: { 'a?c.py': { language: 'python' } } });

        expect(languageOf(config, 'abc.py')).toBe('python');
    });

    it('does not match an empty string with a question mark', () => {
        const config = parseConfig({ overrides: { 'a?c.py': { language: 'python' } } });

        expect(languageOf(config, 'ac.py')).toBeUndefined();
    });

    it('lets a trailing question mark match an empty string', () => {
        const config = parseConfig({ overrides: { 'main.py?': { language: 'python' } } });

        expect(languageOf(config, 'main.py')).toBe('python');
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
});
