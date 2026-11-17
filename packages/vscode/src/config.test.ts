import { describe, expect, it } from 'vitest';

import { resolveOptions, resolveProfile } from './config.js';
import { toExplicitSettings } from './settings.js';

describe('toExplicitSettings', () => {
    it('keeps the values that are set', () => {
        const explicit = toExplicitSettings({
            symbols: ['='],
            groups: [['A', 'B']],
            language: 'rust',
            scope: 'file',
            declarations: false,
            declarationAnchor: 'end',
            maxDeclarationPad: 30,
        });

        expect(explicit).toEqual({
            symbols: ['='],
            groups: [['A', 'B']],
            language: 'rust',
            scope: 'file',
            declarations: false,
            declarationAnchor: 'end',
            maxDeclarationPad: 30,
        });
    });

    it('drops the values that are not set', () => {
        expect(toExplicitSettings({})).toEqual({});
    });

    it('drops an empty symbol and group list', () => {
        expect(toExplicitSettings({ symbols: [], groups: [] })).toEqual({});
    });
});

describe('resolveOptions', () => {
    it('uses the configuration file of the repository', () => {
        const options = resolveOptions({ symbols: ['=', ':'], scope: 'indent' }, {});

        expect(options).toEqual({ symbols: ['=', ':'], scope: 'indent' });
    });

    it('lets an explicit setting win over the configuration file', () => {
        const options = resolveOptions({ symbols: ['=', ':'], scope: 'indent' }, { scope: 'file' });

        expect(options.scope).toBe('file');
        expect(options.symbols).toEqual(['=', ':']);
    });

    it('applies the override that matches the file', () => {
        const config = {
            symbols: ['='],
            overrides: {
                '**/*.test.ts': { symbols: [':'] },
            },
        };

        expect(resolveOptions(config, {}, 'src/model.test.ts').symbols).toEqual([':']);
        expect(resolveOptions(config, {}, 'src/model.ts').symbols).toEqual(['=']);
    });

    it('keeps the language out of the options', () => {
        const options = resolveOptions({ language: 'python' }, { language: 'rust' });

        expect(options.language).toBeUndefined();
    });
});

describe('resolveProfile', () => {
    it('detects the profile from the language id', () => {
        expect(resolveProfile(undefined, {}, 'typescript')).toBe('typescript');
    });

    it('uses the profile of the configuration file', () => {
        expect(resolveProfile({ language: 'python' }, {}, 'typescript')).toBe('python');
    });

    it('lets an explicit setting win over the configuration file', () => {
        expect(resolveProfile({ language: 'python' }, { language: 'rust' }, 'typescript')).toBe('rust');
    });

    it('detects the profile when the setting says auto', () => {
        expect(resolveProfile({ language: 'python' }, { language: 'auto' }, 'typescript')).toBe('typescript');
    });

    it('returns nothing for an unknown language id', () => {
        expect(resolveProfile(undefined, {}, 'klingon')).toBeUndefined();
    });
});
