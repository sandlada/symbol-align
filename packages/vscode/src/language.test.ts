import { isLanguageId } from '@sandlada/symbol-align';
import { describe, expect, it } from 'vitest';

import { resolveLanguage } from './language.js';

/**
 * The profile a VS Code id resolves to.
 *
 * The core library only knows a profile after it ships it — the extension
 * resolves a VS Code id to `undefined` as long as the profile is missing.
 */
const supportedProfile = (profile: string): string | undefined => (isLanguageId(profile) ? profile : undefined);

describe('resolveLanguage', () => {
    it.each([
        ['javascript', 'javascript'],
        ['javascriptreact', 'javascript'],
        ['typescript', 'typescript'],
        ['typescriptreact', 'typescript'],
        ['json', 'json'],
        ['jsonc', 'json'],
        ['python', 'python'],
        ['go', 'go'],
        ['rust', 'rust'],
        ['java', 'java'],
        ['kotlin', 'kotlin'],
        ['swift', 'swift'],
        ['csharp', 'csharp'],
        ['cpp', 'cpp'],
        ['c', 'c'],
        ['objectivec', 'objectivec'],
        ['ruby', 'ruby'],
        ['php', 'php'],
        ['dart', 'dart'],
        ['delphi', 'delphi'],
        ['sql', 'sql'],
        ['yaml', 'yaml'],
        ['css', 'css'],
        ['scss', 'css'],
        ['less', 'css'],
        ['html', 'html'],
        ['xml', 'xml'],
        ['markdown', 'markdown'],
        ['plaintext', 'plaintext'],
        ['elixir', 'elixir'],
        ['haskell', 'haskell'],
        ['lua', 'lua'],
        ['scala', 'scala'],
        ['perl', 'perl'],
        ['julia', 'julia'],
        ['zig', 'zig'],
        ['powershell', 'powershell'],
        ['clojure', 'clojure'],
        ['erlang', 'erlang'],
        ['fortran', 'fortran'],
        ['r', 'r'],
        ['nim', 'nim'],
        ['crystal', 'crystal'],
        ['gleam', 'gleam'],
        ['odin', 'odin'],
        ['solidity', 'solidity'],
        ['groovy', 'groovy'],
        ['terraform', 'terraform'],
        ['toml', 'toml'],
        ['ini', 'ini'],
        ['makefile', 'makefile'],
        ['dockerfile', 'dockerfile'],
        ['graphql', 'graphql'],
        ['protobuf', 'protobuf'],
        ['vb', 'vb'],
        ['vue', 'vue'],
        ['svelte', 'svelte'],
        ['astro', 'astro'],
        ['v', 'v'],
    ])('maps the %s id to the %s profile', (languageId, profile) => {
        expect(resolveLanguage(languageId)).toBe(supportedProfile(profile));
    });

    it('maps the shellscript id to the shell profile', () => {
        expect(resolveLanguage('shellscript')).toBe('shell');
    });

    it('maps the objective-c id to the objectivec profile', () => {
        expect(resolveLanguage('objective-c')).toBe(supportedProfile('objectivec'));
    });

    it('maps the pascal id to the delphi profile', () => {
        expect(resolveLanguage('pascal')).toBe(supportedProfile('delphi'));
    });

    it('maps the fortran-free-form id to the fortran profile', () => {
        expect(resolveLanguage('fortran-free-form')).toBe(supportedProfile('fortran'));
    });

    it('maps the proto id to the protobuf profile', () => {
        expect(resolveLanguage('proto')).toBe(supportedProfile('protobuf'));
    });

    it('returns undefined for an unknown id', () => {
        expect(resolveLanguage('not-a-language')).toBeUndefined();
    });

    it('returns undefined for a language that is not mapped', () => {
        expect(resolveLanguage('git-commit')).toBeUndefined();
    });
});
