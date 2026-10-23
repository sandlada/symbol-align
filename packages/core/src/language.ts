/**
 * Language profiles for `@sandlada/symbol-align`.
 *
 * A profile describes everything the scanner needs to know about a language:
 * comment markers, string delimiters and the operator tokens that must never
 * be split apart. All data is static — no profile is mutated at runtime.
 */

import type { LanguageId, LanguageProfile, StringDelimiter } from './types.js';

/* -------------------------------------------------------------------------- */
/* Shared string delimiters                                                   */
/* -------------------------------------------------------------------------- */

const singleQuote: StringDelimiter = { open: "'", close: "'", escape: 'backslash', multiline: false };
const doubleQuote: StringDelimiter = { open: '"', close: '"', escape: 'backslash', multiline: false };
const templateLiteral: StringDelimiter = { open: '`', close: '`', escape: 'backslash', multiline: true };
const tripleSingleQuote: StringDelimiter = { open: "'''", close: "'''", escape: 'backslash', multiline: true };
const tripleDoubleQuote: StringDelimiter = { open: '"""', close: '"""', escape: 'backslash', multiline: true };
const goRawString: StringDelimiter = { open: '`', close: '`', escape: 'none', multiline: true };
const csharpVerbatimString: StringDelimiter = { open: '@"', close: '"', escape: 'doubled', multiline: true };
const csharpInterpolatedString: StringDelimiter = { open: '$"', close: '"', escape: 'backslash', multiline: false };
const csharpInterpolatedVerbatimString: StringDelimiter = { open: '$@"', close: '"', escape: 'doubled', multiline: true };
const csharpVerbatimInterpolatedString: StringDelimiter = { open: '@$"', close: '"', escape: 'doubled', multiline: true };
const csharpInterpolatedRawString: StringDelimiter = { open: '$"""', close: '"""', escape: 'none', multiline: true };
const csharpDoubleInterpolatedRawString: StringDelimiter = { open: '$$"""', close: '"""', escape: 'none', multiline: true };
const csharpRawString: StringDelimiter = { open: '"""', close: '"""', escape: 'none', multiline: true };
const sqlSingleQuote: StringDelimiter = { open: "'", close: "'", escape: 'doubled', multiline: true };
const sqlDoubleQuote: StringDelimiter = { open: '"', close: '"', escape: 'doubled', multiline: true };
const luaLongStringLevel1: StringDelimiter = { open: '[=[', close: ']=]', escape: 'none', multiline: true };
const luaLongStringLevel2: StringDelimiter = { open: '[==[', close: ']==]', escape: 'none', multiline: true };
const rustRawString: StringDelimiter = { open: 'r#"', close: '"#', escape: 'none', multiline: true };
const rustRawStringLevel2: StringDelimiter = { open: 'r##"', close: '"##', escape: 'none', multiline: true };
const tomlLiteralString: StringDelimiter = { open: "'", close: "'", escape: 'none', multiline: false };
const tomlMultilineLiteralString: StringDelimiter = { open: "'''", close: "'''", escape: 'none', multiline: true };
const powershellHereString: StringDelimiter = { open: '@"', close: '"@', escape: 'none', multiline: true };
const powershellHereLiteral: StringDelimiter = { open: "@'", close: "'@", escape: 'none', multiline: true };
const multilineDoubleQuote: StringDelimiter = { open: '"', close: '"', escape: 'backslash', multiline: true };
const doubledDoubleQuote: StringDelimiter = { open: '"', close: '"', escape: 'doubled', multiline: false };
const backtickSingleLine: StringDelimiter = { open: '`', close: '`', escape: 'backslash', multiline: false };
const luaLongString: StringDelimiter = { open: '[[', close: ']]', escape: 'backslash', multiline: true };
const groovyDollarSlashyString: StringDelimiter = { open: '$/', close: '/$', escape: 'backslash', multiline: true };

/* -------------------------------------------------------------------------- */
/* Shared operator tables (always sorted longest-first)                        */
/* -------------------------------------------------------------------------- */

const javascriptOperators = [
    '>>>=',
    '===',
    '!==',
    '**=',
    '>>>',
    '&&=',
    '||=',
    '??=',
    '<<=',
    '>>=',
    '=>',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '**',
    '&&',
    '||',
    '??',
    '?.',
    '++',
    '--',
    '<<',
    '>>',
    '&=',
    '|=',
    '^=',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '~',
    '?',
    ':',
] as const;

const pythonOperators = ['**=', '//=', '>>=', '<<=', ':=', '@=', '->', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '//', '**', '<<', '>>', '=', '+', '-', '*', '/', '%', '<', '>', '!', '&', '|', '^', '~', '?', ':'] as const;

const goOperators = [
    '...',
    '&^=',
    '<<=',
    '>>=',
    ':=',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '&^',
    '<<',
    '>>',
    '<-',
    '->',
    '&=',
    '|=',
    '^=',
    '++',
    '--',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '~',
    '?',
    ':',
] as const;

const rustOperators = [
    '..=',
    '<<=',
    '>>=',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '<<',
    '>>',
    '->',
    '=>',
    '::',
    '..',
    '&=',
    '|=',
    '^=',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

const cFamilyOperators = [
    '>>>=',
    '>>>',
    '<<=',
    '>>=',
    '??=',
    '...',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '++',
    '--',
    '->',
    '=>',
    '::',
    '<<',
    '>>',
    '&=',
    '|=',
    '^=',
    '?.',
    '??',
    '?:',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

const rubyOperators = [
    '===',
    '<=>',
    '...',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '=>',
    '**',
    '::',
    '->',
    '=~',
    '!~',
    '..',
    '<<',
    '>>',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

const phpOperators = [
    '===',
    '!==',
    '<=>',
    '??=',
    '?->',
    '**=',
    '...',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '.=',
    '%=',
    '&&',
    '||',
    '??',
    '->',
    '=>',
    '::',
    '**',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

const shellOperators = ['==', '!=', '<=', '>=', '=~', '&&', '||', '>>', '<<', ':=', ':-', ':?', ':+', '=', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':'] as const;

const sqlOperators = ['||', '<>', '<=', '>=', '!=', '::', ':=', '=', '+', '-', '*', '/', '%', '<', '>'] as const;

const yamlOperators = ['=', ':'] as const;

const jsonOperators = [':'] as const;

const cssOperators = ['::', '=', '+', '-', '*', '/'] as const;

const markupOperators = ['='] as const;

/* -------------------------------------------------------------------------- */
/* Operator tables of the extended language profiles                           */
/* -------------------------------------------------------------------------- */

const elixirOperators = [
    '===',
    '!==',
    '&&&',
    '|||',
    '<<<',
    '>>>',
    '==',
    '!=',
    '<=',
    '>=',
    '=~',
    '=>',
    '<-',
    '->',
    '|>',
    '||',
    '&&',
    '++',
    '--',
    '**',
    '//',
    '<>',
    '<<',
    '>>',
    '::',
    '..',
    '|',
    '&',
    '+',
    '-',
    '*',
    '/',
    '!',
    '^',
    '~',
    '?',
    '=',
] as const;

const haskellOperators = ['>>=', '=<<', '<$>', '<*>', '->', '=>', '<-', '::', '>>', '==', '/=', '<=', '>=', '&&', '||', '++', '<>', '..', '!!', '+', '-', '*', '/', '=', ':', '.', '!', '$'] as const;

const luaOperators = ['...', '==', '~=', '<=', '>=', '..', '//', '<<', '>>', '::', '=', '+', '-', '*', '/', '%', '^', '#', '<', '>', '~', '&', '|'] as const;

const scalaOperators = ['===', '!==', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&&', '||', '=>', '->', '<-', '::', '=', '+', '-', '*', '/', '%', '<', '>', '!', '&', '|', '^', '?', ':'] as const;

const perlOperators = ['<=>', '**=', '||=', '&&=', '//=', '...', '==', '!=', '<=', '>=', '=~', '!~', '~~', '+=', '-=', '*=', '/=', '.=', 'x=', '||', '&&', '//', '**', '->', '=>', '=', '+', '-', '*', '/', '.', '!', '?', ':'] as const;

const juliaOperators = [
    '===',
    '!==',
    '<<=',
    '>>=',
    '//=',
    '...',
    '.==',
    '==',
    '!=',
    '<=',
    '>=',
    '->',
    '=>',
    '<-',
    '&&',
    '||',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '//',
    '<<',
    '>>',
    '**',
    '::',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '~',
    '?',
    ':',
] as const;

const powershellOperators = [
    '-notcontains',
    '-notmatch',
    '-contains',
    '-replace',
    '-notlike',
    '-isnot',
    '-match',
    '-split',
    '-notin',
    '-bnot',
    '-like',
    '-join',
    '-band',
    '-bxor',
    '-not',
    '-and',
    '-xor',
    '-bor',
    '-shl',
    '-shr',
    '-is',
    '-as',
    '-or',
    '-in',
    '-eq',
    '-ne',
    '-ge',
    '-gt',
    '-le',
    '-lt',
    '-f',
    '::',
    '++',
    '--',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '!',
    '?',
] as const;

const clojureOperators = ['->>', '==', '!=', '<=', '>=', '->', '::', '=', '+', '-', '*', '/', '<', '>'] as const;

const erlangOperators = ['=:=', '=/=', '==', '/=', '=<', '>=', '++', '--', '=>', '<<', '>>', '||', '&&', ':=', '->', '=', '+', '-', '*', '/', '<', '>', '!', '?'] as const;

const rOperators = ['%/%', '<<-', '->>', ':::', '%>%', '<-', '->', '==', '!=', '<=', '>=', '%%', '::', ':=', '|>', '=', '+', '-', '*', '/', '^', '<', '>', '!', '&', '|'] as const;

const fortranOperators = ['**', '==', '/=', '<=', '>=', '=>', '::', '//', '=', '+', '-', '*', '/', '<', '>', ':', '.'] as const;

const nimOperators = ['notin', '**=', '//=', '<<=', '>>=', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', 'in', 'of', '->', '..', '=', '+', '-', '*', '/', '%', '<', '>', '!', '&', '|', '^', '?', ':'] as const;

const crystalOperators = [
    '===',
    '!==',
    '**=',
    '//=',
    '<<=',
    '>>=',
    '&&=',
    '||=',
    '...',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '=>',
    '->',
    '::',
    '=~',
    '!~',
    '**',
    '//',
    '<<',
    '>>',
    '..',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

const groovyOperators = [
    '===',
    '!==',
    '**=',
    '<<=',
    '>>=',
    '<=>',
    '==~',
    '...',
    '?=',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '**',
    '=~',
    '=>',
    '->',
    '::',
    '?.',
    '?:',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

const terraformOperators = ['...', '==', '!=', '<=', '>=', '&&', '||', '=>', '=', '+', '-', '*', '/', '%', '!', '?', ':'] as const;

const keyValueOperators = ['=', '+', '-'] as const;

const makefileOperators = ['::=', ':=', '+=', '?=', '!=', '==', '::', '=', '+', '-', '*', '/', '%', '?', '!'] as const;

/** The GraphQL operators — the spread, the intersection and the union. */
const graphqlOperators = ['...', ':', '=', '!', '@', '&', '|'] as const;

/**
 * The Visual Basic operators.
 *
 * VB.NET assigns with `=` and compares inequality with `<>` — it has neither
 * `!=` nor `:=`.
 */
const visualBasicOperators = ['<>', '<=', '>=', '<<', '>>', '&=', '^=', '=', '+', '-', '*', '/', '\\', '^', '&', '<', '>', '?'] as const;

/**
 * The C family operators with `::` replaced by `:=`.
 *
 * V assigns with `:=` — without it the aligner would split an assignment
 * into `: =`.
 */
const colonAssignmentOperators = [
    '<<=',
    '>>=',
    '??=',
    '...',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '++',
    '--',
    '->',
    '=>',
    ':=',
    '<<',
    '>>',
    '&=',
    '|=',
    '^=',
    '?.',
    '??',
    '?:',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

/**
 * The C family operators plus `:=`.
 *
 * Delphi and Odin declare and assign with `:=` — without it the aligner
 * would split an assignment into `: =`.
 */
const declarationOperators = [
    '<<=',
    '>>=',
    '??=',
    '...',
    '==',
    '!=',
    '<=',
    '>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&&',
    '||',
    '++',
    '--',
    '->',
    '=>',
    '::',
    ':=',
    '<<',
    '>>',
    '&=',
    '|=',
    '^=',
    '?.',
    '??',
    '?:',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '&',
    '|',
    '^',
    '?',
    ':',
] as const;

/** The C family operators without `=>` and `::` — Zig has neither. */
const zigOperators = ['<<=', '>>=', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '&&', '||', '++', '--', '->', '=', '+', '-', '*', '/', '%', '<', '>', '!', '&', '|', '^', '?', ':'] as const;

/* -------------------------------------------------------------------------- */
/* Profiles                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The profile table.
 *
 * The keys are the `LanguageId` values in the order they are declared in
 * `types.ts` — the `Record` type makes a missing or unknown language a
 * compile-time error.
 */
const profileTable = {
    generic: {
        id: 'generic',
        name: 'Generic',
        extensions: [],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, templateLiteral],
        operators: javascriptOperators,
        defaultSymbols: ['='],
    },
    javascript: {
        id: 'javascript',
        name: 'JavaScript',
        extensions: ['js', 'mjs', 'cjs', 'jsx'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, templateLiteral],
        operators: javascriptOperators,
        defaultSymbols: ['='],
    },
    typescript: {
        id: 'typescript',
        name: 'TypeScript',
        extensions: ['ts', 'mts', 'cts', 'tsx'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, templateLiteral],
        operators: javascriptOperators,
        defaultSymbols: ['='],
    },
    python: {
        id: 'python',
        name: 'Python',
        extensions: ['py', 'pyi', 'pyw'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote, tripleSingleQuote, tripleDoubleQuote],
        operators: pythonOperators,
        defaultSymbols: ['='],
    },
    go: {
        id: 'go',
        name: 'Go',
        extensions: ['go'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, goRawString],
        operators: goOperators,
        defaultSymbols: ['=', ':='],
    },
    rust: {
        id: 'rust',
        name: 'Rust',
        extensions: ['rs'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [rustRawStringLevel2, rustRawString, singleQuote, doubleQuote],
        operators: rustOperators,
        defaultSymbols: ['='],
    },
    java: {
        id: 'java',
        name: 'Java',
        extensions: ['java'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, tripleDoubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    kotlin: {
        id: 'kotlin',
        name: 'Kotlin',
        extensions: ['kt', 'kts'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, tripleDoubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    swift: {
        id: 'swift',
        name: 'Swift',
        extensions: ['swift'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, tripleDoubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    csharp: {
        id: 'csharp',
        name: 'C#',
        extensions: ['cs', 'csx'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [
            singleQuote,
            doubleQuote,
            csharpInterpolatedVerbatimString,
            csharpVerbatimInterpolatedString,
            csharpDoubleInterpolatedRawString,
            csharpInterpolatedRawString,
            csharpInterpolatedString,
            csharpVerbatimString,
            csharpRawString,
        ],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    cpp: {
        id: 'cpp',
        name: 'C++',
        extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    c: {
        id: 'c',
        name: 'C',
        extensions: ['c', 'h'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    ruby: {
        id: 'ruby',
        name: 'Ruby',
        extensions: ['rb', 'rake', 'gemspec'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: rubyOperators,
        defaultSymbols: ['='],
    },
    php: {
        id: 'php',
        name: 'PHP',
        extensions: ['php', 'phtml'],
        lineComments: ['//', '#'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: phpOperators,
        defaultSymbols: ['='],
    },
    dart: {
        id: 'dart',
        name: 'Dart',
        extensions: ['dart'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    shell: {
        id: 'shell',
        name: 'Shell',
        extensions: ['sh', 'bash', 'zsh', 'fish'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: shellOperators,
        defaultSymbols: ['='],
    },
    sql: {
        id: 'sql',
        name: 'SQL',
        extensions: ['sql'],
        lineComments: ['--'],
        blockComments: [['/*', '*/']],
        strings: [sqlSingleQuote, sqlDoubleQuote],
        operators: sqlOperators,
        defaultSymbols: ['='],
    },
    yaml: {
        id: 'yaml',
        name: 'YAML',
        extensions: ['yaml', 'yml'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: yamlOperators,
        defaultSymbols: ['='],
    },
    json: {
        id: 'json',
        name: 'JSON',
        extensions: ['json'],
        lineComments: [],
        blockComments: [],
        strings: [doubleQuote],
        operators: jsonOperators,
        defaultSymbols: [':'],
    },
    css: {
        id: 'css',
        name: 'CSS',
        extensions: ['css'],
        lineComments: [],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: cssOperators,
        defaultSymbols: [':'],
    },
    html: {
        id: 'html',
        name: 'HTML',
        extensions: ['html', 'htm'],
        lineComments: [],
        blockComments: [['<!--', '-->']],
        strings: [singleQuote, doubleQuote],
        operators: markupOperators,
        defaultSymbols: ['='],
    },
    xml: {
        id: 'xml',
        name: 'XML',
        extensions: ['xml'],
        lineComments: [],
        blockComments: [['<!--', '-->']],
        strings: [singleQuote, doubleQuote],
        operators: markupOperators,
        defaultSymbols: ['='],
    },
    markdown: {
        id: 'markdown',
        name: 'Markdown',
        extensions: ['md', 'markdown'],
        lineComments: [],
        blockComments: [],
        strings: [],
        operators: markupOperators,
        defaultSymbols: ['='],
    },
    plaintext: {
        id: 'plaintext',
        name: 'Plain Text',
        extensions: ['txt', 'text'],
        lineComments: [],
        blockComments: [],
        strings: [],
        operators: markupOperators,
        defaultSymbols: ['='],
    },
    elixir: {
        id: 'elixir',
        name: 'Elixir',
        extensions: ['ex', 'exs', 'eex', 'heex'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote, tripleSingleQuote, tripleDoubleQuote],
        operators: elixirOperators,
        defaultSymbols: ['='],
    },
    haskell: {
        id: 'haskell',
        name: 'Haskell',
        extensions: ['hs', 'lhs'],
        lineComments: ['--'],
        blockComments: [['{-', '-}']],
        strings: [singleQuote, doubleQuote],
        operators: haskellOperators,
        defaultSymbols: ['='],
    },
    lua: {
        id: 'lua',
        name: 'Lua',
        extensions: ['lua'],
        lineComments: ['--'],
        blockComments: [
            ['--[==[', ']==]'],
            ['--[=[', ']=]'],
            ['--[[', ']]'],
        ],
        strings: [singleQuote, doubleQuote, luaLongStringLevel2, luaLongStringLevel1, luaLongString],
        operators: luaOperators,
        defaultSymbols: ['='],
    },
    scala: {
        id: 'scala',
        name: 'Scala',
        extensions: ['scala', 'sc', 'sbt'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, tripleDoubleQuote],
        operators: scalaOperators,
        defaultSymbols: ['='],
    },
    objectivec: {
        id: 'objectivec',
        name: 'Objective-C',
        extensions: ['m', 'mm'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    perl: {
        id: 'perl',
        name: 'Perl',
        extensions: ['pl', 'pm'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: perlOperators,
        defaultSymbols: ['='],
    },
    julia: {
        id: 'julia',
        name: 'Julia',
        extensions: ['jl'],
        lineComments: ['#'],
        blockComments: [['#=', '=#']],
        strings: [singleQuote, doubleQuote, tripleDoubleQuote],
        operators: juliaOperators,
        defaultSymbols: ['='],
    },
    zig: {
        id: 'zig',
        name: 'Zig',
        extensions: ['zig'],
        lineComments: ['//'],
        blockComments: [],
        strings: [singleQuote, multilineDoubleQuote],
        operators: zigOperators,
        defaultSymbols: ['='],
    },
    powershell: {
        id: 'powershell',
        name: 'PowerShell',
        extensions: ['ps1', 'psm1', 'psd1'],
        lineComments: ['#'],
        blockComments: [['<#', '#>']],
        strings: [powershellHereString, powershellHereLiteral, singleQuote, doubledDoubleQuote],
        operators: powershellOperators,
        defaultSymbols: ['='],
    },
    clojure: {
        id: 'clojure',
        name: 'Clojure',
        extensions: ['clj', 'cljs', 'cljc', 'edn'],
        lineComments: [';'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: clojureOperators,
        defaultSymbols: ['='],
    },
    erlang: {
        id: 'erlang',
        name: 'Erlang',
        extensions: ['erl', 'hrl'],
        lineComments: ['%%'],
        blockComments: [],
        strings: [singleQuote, multilineDoubleQuote],
        operators: erlangOperators,
        defaultSymbols: ['='],
    },
    r: {
        id: 'r',
        name: 'R',
        extensions: ['r', 'rmd'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote, backtickSingleLine],
        operators: rOperators,
        defaultSymbols: ['<-', '='],
    },
    fortran: {
        id: 'fortran',
        name: 'Fortran',
        extensions: ['f90', 'f95', 'f03', 'f08'],
        lineComments: ['!'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: fortranOperators,
        defaultSymbols: ['='],
    },
    nim: {
        id: 'nim',
        name: 'Nim',
        extensions: ['nim', 'nims'],
        lineComments: ['#'],
        blockComments: [['#[', ']#']],
        strings: [singleQuote, multilineDoubleQuote],
        operators: nimOperators,
        defaultSymbols: ['='],
    },
    crystal: {
        id: 'crystal',
        name: 'Crystal',
        extensions: ['cr'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote, tripleDoubleQuote],
        operators: crystalOperators,
        defaultSymbols: ['='],
    },
    gleam: {
        id: 'gleam',
        name: 'Gleam',
        extensions: ['gleam'],
        lineComments: ['//'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    odin: {
        id: 'odin',
        name: 'Odin',
        extensions: ['odin'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: declarationOperators,
        defaultSymbols: ['='],
    },
    solidity: {
        id: 'solidity',
        name: 'Solidity',
        extensions: ['sol'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    groovy: {
        id: 'groovy',
        name: 'Groovy',
        extensions: ['groovy', 'gvy', 'gradle'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote, tripleSingleQuote, tripleDoubleQuote, groovyDollarSlashyString],
        operators: groovyOperators,
        defaultSymbols: ['='],
    },
    terraform: {
        id: 'terraform',
        name: 'Terraform',
        extensions: ['tf', 'tfvars', 'hcl'],
        lineComments: ['#', '//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: terraformOperators,
        defaultSymbols: ['='],
    },
    toml: {
        id: 'toml',
        name: 'TOML',
        extensions: ['toml'],
        lineComments: ['#'],
        blockComments: [],
        strings: [tomlLiteralString, doubleQuote, tomlMultilineLiteralString, tripleDoubleQuote],
        operators: keyValueOperators,
        defaultSymbols: ['='],
    },
    ini: {
        id: 'ini',
        name: 'INI',
        extensions: ['ini', 'cfg', 'conf', 'properties'],
        lineComments: [';', '#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: keyValueOperators,
        defaultSymbols: ['='],
    },
    makefile: {
        id: 'makefile',
        name: 'Makefile',
        extensions: ['mk', 'makefile', 'mak'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: makefileOperators,
        defaultSymbols: ['='],
    },
    dockerfile: {
        id: 'dockerfile',
        name: 'Dockerfile',
        extensions: ['dockerfile'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote],
        operators: keyValueOperators,
        defaultSymbols: ['='],
    },
    graphql: {
        id: 'graphql',
        name: 'GraphQL',
        extensions: ['graphql', 'gql'],
        lineComments: ['#'],
        blockComments: [],
        strings: [singleQuote, doubleQuote, tripleDoubleQuote],
        operators: graphqlOperators,
        defaultSymbols: [':'],
    },
    vb: {
        id: 'vb',
        name: 'Visual Basic',
        extensions: ['vb'],
        lineComments: ["'"],
        blockComments: [],
        strings: [doubledDoubleQuote],
        operators: visualBasicOperators,
        defaultSymbols: ['='],
    },
    delphi: {
        id: 'delphi',
        name: 'Delphi',
        extensions: ['pas', 'dpr', 'pp'],
        lineComments: ['//'],
        blockComments: [
            ['{', '}'],
            ['(*', '*)'],
        ],
        strings: [singleQuote],
        operators: declarationOperators,
        defaultSymbols: ['='],
    },
    vue: {
        id: 'vue',
        name: 'Vue',
        extensions: ['vue'],
        lineComments: ['//'],
        blockComments: [
            ['/*', '*/'],
            ['<!--', '-->'],
        ],
        strings: [singleQuote, doubleQuote, templateLiteral],
        operators: javascriptOperators,
        defaultSymbols: ['='],
    },
    svelte: {
        id: 'svelte',
        name: 'Svelte',
        extensions: ['svelte'],
        lineComments: ['//'],
        blockComments: [
            ['/*', '*/'],
            ['<!--', '-->'],
        ],
        strings: [singleQuote, doubleQuote, templateLiteral],
        operators: javascriptOperators,
        defaultSymbols: ['='],
    },
    astro: {
        id: 'astro',
        name: 'Astro',
        extensions: ['astro'],
        lineComments: ['//'],
        blockComments: [
            ['/*', '*/'],
            ['<!--', '-->'],
        ],
        strings: [singleQuote, doubleQuote, templateLiteral],
        operators: javascriptOperators,
        defaultSymbols: ['='],
    },
    protobuf: {
        id: 'protobuf',
        name: 'Protocol Buffers',
        extensions: ['proto'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: cFamilyOperators,
        defaultSymbols: ['='],
    },
    v: {
        id: 'v',
        name: 'V',
        extensions: ['v'],
        lineComments: ['//'],
        blockComments: [['/*', '*/']],
        strings: [singleQuote, doubleQuote],
        operators: colonAssignmentOperators,
        defaultSymbols: ['='],
    },
} as const satisfies Record<LanguageId, LanguageProfile>;

/* -------------------------------------------------------------------------- */
/* Lookup tables                                                               */
/* -------------------------------------------------------------------------- */

/** Lookup by language id — every key of the profile table. */
const profileIndex: Readonly<Record<string, LanguageProfile | undefined>> = Object.freeze(Object.fromEntries(Object.entries(profileTable)));

/** Lookup by file extension (without the leading dot). */
const extensionIndex: Readonly<Record<string, LanguageId | undefined>> = Object.freeze(Object.fromEntries(Object.values(profileTable).flatMap((profile) => profile.extensions.map((extension) => [extension, profile.id] as const))));

/** Matches the last path segment of a POSIX or Windows style path. */
const fileNamePattern = /[^/\\]+$/;

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/** One profile per supported language, in the order the ids are declared in `types.ts`. */
export const allLanguages: readonly LanguageProfile[] = Object.freeze(Object.values(profileTable));

/**
 * Returns the profile of `id`.
 *
 * The lookup is total — an unknown id never throws, it falls back to the
 * `generic` profile.
 */
export const languageProfile = (id: LanguageId): LanguageProfile => profileIndex[id] ?? profileTable.generic;

/** Type guard for {@link LanguageId}. */
export const isLanguageId = (value: string): value is LanguageId => Object.hasOwn(profileTable, value);

/**
 * Detects the language of `filePath` by its file extension.
 *
 * The extension is the last `.` segment of the file name, compared
 * case-insensitively. Unknown extensions and files without an extension are
 * detected as `generic`.
 */
export const detectLanguage = (filePath: string): LanguageId => {
    const fileName = fileNamePattern.exec(filePath)?.[0] ?? '';
    const dotIndex = fileName.lastIndexOf('.');

    if (dotIndex <= 0) {
        return 'generic';
    }

    const extension = fileName.slice(dotIndex + 1).toLowerCase();
    return extensionIndex[extension] ?? 'generic';
};
