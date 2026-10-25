/**
 * Mapping between the language ids of VS Code and the language profiles of
 * `@sandlada/symbol-align`.
 *
 * The table is a plain string map on purpose. Every value is validated
 * against the core library at runtime, so a profile that the core does not
 * know (yet) simply makes the extension skip the document instead of
 * failing.
 */

import type { LanguageId } from '@sandlada/symbol-align';
import { isLanguageId } from '@sandlada/symbol-align';

/** VS Code language id → language profile of the core library. */
const languageTable: Readonly<Record<string, string>> = Object.freeze({
    // JavaScript and TypeScript
    javascript: 'javascript',
    javascriptreact: 'javascript',
    typescript: 'typescript',
    typescriptreact: 'typescript',

    // Data and markup
    json: 'json',
    jsonc: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'css',
    less: 'css',
    markdown: 'markdown',
    plaintext: 'plaintext',

    // Scripting languages
    python: 'python',
    ruby: 'ruby',
    php: 'php',
    perl: 'perl',
    lua: 'lua',
    r: 'r',
    julia: 'julia',
    crystal: 'crystal',

    // Systems languages
    c: 'c',
    cpp: 'cpp',
    objectivec: 'objectivec',
    'objective-c': 'objectivec',
    rust: 'rust',
    go: 'go',
    zig: 'zig',
    nim: 'nim',
    odin: 'odin',
    dart: 'dart',
    swift: 'swift',
    solidity: 'solidity',

    // Managed languages
    java: 'java',
    kotlin: 'kotlin',
    scala: 'scala',
    csharp: 'csharp',
    fsharp: 'fsharp',
    'f#': 'fsharp',
    groovy: 'groovy',
    elixir: 'elixir',
    erlang: 'erlang',
    haskell: 'haskell',
    clojure: 'clojure',

    // Shell and PowerShell
    shellscript: 'shell',
    powershell: 'powershell',

    // Data and infrastructure
    sql: 'sql',
    yaml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    makefile: 'makefile',
    dockerfile: 'dockerfile',
    terraform: 'terraform',
    graphql: 'graphql',
    protobuf: 'protobuf',
    proto: 'protobuf',

    // Legacy and miscellaneous
    vb: 'vb',
    pascal: 'delphi',
    delphi: 'delphi',
    fortran: 'fortran',
    'fortran-free-form': 'fortran',
    v: 'v',
    gleam: 'gleam',
    vue: 'vue',
    svelte: 'svelte',
    astro: 'astro',
});

/**
 * Resolves the language profile of a VS Code language id.
 *
 * Returns `undefined` when the id is unknown to the extension or when the
 * core library does not know the mapped profile.
 */
export const resolveLanguage = (languageId: string): LanguageId | undefined => {
    if (!Object.hasOwn(languageTable, languageId)) {
        return undefined;
    }

    const candidate = languageTable[languageId];

    return isLanguageId(candidate) ? candidate : undefined;
};
