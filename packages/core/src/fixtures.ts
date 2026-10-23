/**
 * Test fixtures for multi-line code alignment scenarios.
 *
 * Every fixture carries the input snippet, the expected output after alignment
 * and the number of lines that are expected to change. The optional
 * `symbols`, `language`, `scope` and `range` fields map directly onto
 * `AlignOptions`.
 */
import type { AlignSymbol, AlignmentScope, LanguageId, LineRange } from './types.js';

export interface CodeFixture {
    /** Stable identifier of the fixture. */
    readonly name: string;
    /** The snippet before alignment. */
    readonly input: string;
    /** The snippet after alignment. */
    readonly output: string;
    /** Number of distinct lines that are expected to change. */
    readonly changes: number;
    /** Symbols to align. */
    readonly symbols?: readonly AlignSymbol[];
    /** Language profile used for the alignment. */
    readonly language?: LanguageId;
    /** Grouping strategy used for the alignment. */
    readonly scope?: AlignmentScope;
    /** The lines that are aligned. */
    readonly range?: LineRange;
}

// ────────────────────────────
// = assignment alignment
// ────────────────────────────

export const eqBasic: CodeFixture = {
    name: 'eq-basic',
    input: ['const foo = 1', 'const foobar = 22', 'const foobarbaz = 333'].join('\n'),
    output: ['const foo       = 1', 'const foobar    = 22', 'const foobarbaz = 333'].join('\n'),
    changes: 2,
};

export const eqAlreadyAligned: CodeFixture = {
    name: 'eq-already-aligned',
    input: ['const foo       = 1', 'const foobar    = 22', 'const foobarbaz = 333'].join('\n'),
    output: ['const foo       = 1', 'const foobar    = 22', 'const foobarbaz = 333'].join('\n'),
    changes: 0,
};

export const eqWithSemicolons: CodeFixture = {
    name: 'eq-with-semicolons',
    input: ['const foo = 1;', 'const foobar = 22;', 'const foobarbaz = 333;'].join('\n'),
    output: ['const foo       = 1;', 'const foobar    = 22;', 'const foobarbaz = 333;'].join('\n'),
    changes: 2,
};

export const eqMixedIndentation: CodeFixture = {
    name: 'eq-mixed-indentation',
    input: ['  let x = 1', '    let y = 2', 'let z = 3'].join('\n'),
    output: ['  let x   = 1', '    let y = 2', 'let z     = 3'].join('\n'),
    changes: 2,
};

// ────────────────────────────
// scope — which lines are aligned with each other
// ────────────────────────────

export const scopeBlockSplitsAtBlankLines: CodeFixture = {
    name: 'scope-block-splits-at-blank-lines',
    input: ['name = "foo"', '', 'value = "bar"', '', 'label = "baz"'].join('\n'),
    output: ['name = "foo"', '', 'value = "bar"', '', 'label = "baz"'].join('\n'),
    changes: 0,
};

export const scopeFileAlignsEverything: CodeFixture = {
    name: 'scope-file-aligns-everything',
    input: ['name = "foo"', '', 'value = "bar"', '', 'label = "baz"'].join('\n'),
    output: ['name  = "foo"', '', 'value = "bar"', '', 'label = "baz"'].join('\n'),
    changes: 1,
    scope: 'file',
};

// ────────────────────────────
// : alignment (type annotations / object literals)
// ────────────────────────────

export const colonTypeAnnotations: CodeFixture = {
    name: 'colon-type-annotations',
    input: ['const x: string;', 'const yy: number;', 'const zzz: boolean;'].join('\n'),
    output: ['const x  : string;', 'const yy : number;', 'const zzz: boolean;'].join('\n'),
    changes: 2,
    symbols: [':'],
};

export const colonObjectLiteral: CodeFixture = {
    name: 'colon-object-literal',
    input: ['const config = {', '  host: "localhost",', '  portValue: 8080,', '  sslEnabled: true,', '};'].join('\n'),
    output: ['const config = {', '  host      : "localhost",', '  portValue : 8080,', '  sslEnabled: true,', '};'].join('\n'),
    changes: 2,
    symbols: [':'],
};

// ────────────────────────────
// => alignment
// ────────────────────────────

export const arrowSimple: CodeFixture = {
    name: 'arrow-simple',
    input: ['const f = (x) => x;', 'const g = (xyz) => xyz;'].join('\n'),
    output: ['const f = (x)   => x;', 'const g = (xyz) => xyz;'].join('\n'),
    changes: 1,
    symbols: ['=>'],
};

export const arrowObjectReturn: CodeFixture = {
    name: 'arrow-object-return',
    input: ['const fn1 = (a: number) => ({ a });', 'const fnLong = (a: number) => ({ a });'].join('\n'),
    output: ['const fn1 = (a: number)    => ({ a });', 'const fnLong = (a: number) => ({ a });'].join('\n'),
    changes: 1,
    symbols: ['=>'],
};

// ────────────────────────────
// comment alignment
// ────────────────────────────

export const commentSlashSlash: CodeFixture = {
    name: 'comment-slash-slash',
    input: ['const a = 1;  // short', 'const bb = 22; // longer', 'const ccc = 333; // even longer'].join('\n'),
    output: ['const a   = 1;   // short', 'const bb  = 22;  // longer', 'const ccc = 333; // even longer'].join('\n'),
    changes: 2,
    symbols: ['=', '//'],
};

export const commentHashPython: CodeFixture = {
    name: 'comment-hash-python',
    input: ['x = 1   # short', 'yy = 22 # longer', 'zzz = 333 # even longer'].join('\n'),
    output: ['x   = 1   # short', 'yy  = 22  # longer', 'zzz = 333 # even longer'].join('\n'),
    changes: 2,
    symbols: ['=', '#'],
    language: 'python',
};

export const commentDashSql: CodeFixture = {
    name: 'comment-dash-sql',
    input: ['SELECT id, name  -- the identifier', 'FROM users       -- the table', 'WHERE age > 18;'].join('\n'),
    output: ['SELECT id, name  -- the identifier', 'FROM users       -- the table', 'WHERE age > 18;'].join('\n'),
    changes: 0,
    symbols: ['--'],
    language: 'sql',
};

// ────────────────────────────
// multiple symbols
// ────────────────────────────

export const mixedColonAndEq: CodeFixture = {
    name: 'mixed-colon-and-eq',
    input: ['const x: Type = 1;', 'const yy: AnotherType = 22;'].join('\n'),
    output: ['const x : Type        = 1;', 'const yy: AnotherType = 22;'].join('\n'),
    changes: 1,
    symbols: [':', '='],
};

export const mixedEqColonArrow: CodeFixture = {
    name: 'mixed-eq-colon-arrow',
    input: ['export const add = (x: number, y: number): number => x + y;', 'export const greetLong = (name: string): string => `Hi ${name}`;'].join('\n'),
    output: ['export const add       = (x   : number, y: number): number => x + y;', 'export const greetLong = (name: string): string            => `Hi ${name}`;'].join('\n'),
    changes: 2,
    symbols: ['=', ':', '=>'],
};

export const mixedReadonlyColon: CodeFixture = {
    name: 'mixed-readonly-colon',
    input: [
        'export interface IAlbumRepository {',
        '    readonly $changes: Observable<readonly Album[]>',
        '    findOneById(id: string)  : Promise<Result<Album,   AlbumError>>',
        '    insertOne(album: Album)  : Promise<Result<void,    AlbumError>>',
        '    existsById(id: string)   : Promise<Result<boolean, AlbumError>>',
        '    removeOneById(id: string): Promise<Result<void,    AlbumError>>',
        '    saveChanges()            : void',
        '}',
    ].join('\n'),
    output: [
        'export interface IAlbumRepository {',
        '    readonly $changes                 : Observable<readonly Album[]>',
        '             findOneById(id           : string)  : Promise<Result<Album,   AlbumError>>',
        '             insertOne(album          : Album)  : Promise<Result<void,    AlbumError>>',
        '             existsById(id            : string)   : Promise<Result<boolean, AlbumError>>',
        '             removeOneById(id         : string): Promise<Result<void,    AlbumError>>',
        '             saveChanges()            : void',
        '}',
    ].join('\n'),
    changes: 6,
    symbols: ['readonly', ':'],
};

// ────────────────────────────
// real world snippets
// ────────────────────────────

export const realWorldCss: CodeFixture = {
    name: 'real-world-css',
    input: ['.card {', '  color: red;', '  backgroundColorValue: blue;', '  borderColor: green;', '}'].join('\n'),
    output: ['.card {', '  color               : red;', '  backgroundColorValue: blue;', '  borderColor         : green;', '}'].join('\n'),
    changes: 2,
    symbols: [':'],
    language: 'css',
};

export const realWorldEnum: CodeFixture = {
    name: 'real-world-enum',
    input: ['enum Status {', '  Active = 1,', '  InactiveLong = 2,', '  Pending = 3,', '}'].join('\n'),
    output: ['enum Status {', '  Active       = 1,', '  InactiveLong = 2,', '  Pending      = 3,', '}'].join('\n'),
    changes: 2,
};

export const realWorldDestructure: CodeFixture = {
    name: 'real-world-destructure',
    input: ['const {', '  name: userName,', '  age: userAgeLong,', '  email: userEmail,', '} = props;'].join('\n'),
    output: ['const {', '  name : userName,', '  age  : userAgeLong,', '  email: userEmail,', '} = props;'].join('\n'),
    changes: 2,
    symbols: [':'],
};

export const realWorldImport: CodeFixture = {
    name: 'real-world-import',
    input: ['import { readFile } from "fs";', 'import { writeFile } from "fs/promises";', 'import { readdirSync } from "fs";'].join('\n'),
    output: ['import { readFile    } from "fs";', 'import { writeFile   } from "fs/promises";', 'import { readdirSync } from "fs";'].join('\n'),
    changes: 2,
    symbols: ['}'],
};

// ────────────────────────────
// strings and comments are never touched
// ────────────────────────────

export const skipInsideStrings: CodeFixture = {
    name: 'skip-inside-strings',
    input: ["const msg = 'hello = world = foo';", 'const greeting = "hi = there";', 'const code = `a = b = c`;'].join('\n'),
    output: ["const msg      = 'hello = world = foo';", 'const greeting = "hi = there";', 'const code     = `a = b = c`;'].join('\n'),
    changes: 2,
};

export const skipInsideComments: CodeFixture = {
    name: 'skip-inside-comments',
    input: ['const a = 1; /* = */', 'const bb = 2; // = comment'].join('\n'),
    output: ['const a  = 1; /* = */', 'const bb = 2; // = comment'].join('\n'),
    changes: 1,
};

export const skipInsideMultilineBlockComment: CodeFixture = {
    name: 'skip-inside-multiline-block-comment',
    input: ['const a = 1;', '/*', 'const ignored = 2;', '*/', 'const bbbb = 3;'].join('\n'),
    output: ['const a    = 1;', '/*', 'const ignored = 2;', '*/', 'const bbbb = 3;'].join('\n'),
    changes: 1,
};

export const skipInsidePythonDocstring: CodeFixture = {
    name: 'skip-inside-python-docstring',
    input: ['def f():', '    """', '    a = b', '    """', '    x = 1'].join('\n'),
    output: ['def f():', '    """', '    a = b', '    """', '    x = 1'].join('\n'),
    changes: 0,
    language: 'python',
};

export const skipInsideGoRawString: CodeFixture = {
    name: 'skip-inside-go-raw-string',
    input: ['const query = `', 'SELECT id', 'FROM users', '`', 'var total = 1'].join('\n'),
    output: ['const query = `', 'SELECT id', 'FROM users', '`', 'var total   = 1'].join('\n'),
    changes: 1,
    language: 'go',
};

// ────────────────────────────
// operator fragments are never aligned
// ────────────────────────────

export const arrowIsNotAnAssignment: CodeFixture = {
    name: 'arrow-is-not-an-assignment',
    input: ['const f = (x) => x', 'const g = (xyz) => xyz'].join('\n'),
    output: ['const f = (x) => x', 'const g = (xyz) => xyz'].join('\n'),
    changes: 0,
};

export const equalityIsNotAnAssignment: CodeFixture = {
    name: 'equality-is-not-an-assignment',
    input: ['if (a == b) {}', 'if (cccc == d) {}'].join('\n'),
    output: ['if (a == b) {}', 'if (cccc == d) {}'].join('\n'),
    changes: 0,
};

export const shortDeclarationIsNotAnAssignment: CodeFixture = {
    name: 'short-declaration-is-not-an-assignment',
    input: ['x := 1', 'yyyy := 22'].join('\n'),
    output: ['x    := 1', 'yyyy := 22'].join('\n'),
    changes: 1,
    language: 'go',
};

// ────────────────────────────
// edge cases
// ────────────────────────────

export const singleLine: CodeFixture = {
    name: 'single-line',
    input: ['const x = 1;'].join('\n'),
    output: ['const x = 1;'].join('\n'),
    changes: 0,
};

export const emptyLines: CodeFixture = {
    name: 'empty-lines',
    input: ['', '', ''].join('\n'),
    output: ['', '', ''].join('\n'),
    changes: 0,
};

export const noSymbol: CodeFixture = {
    name: 'no-symbol',
    input: ['function foo() {', '  return bar;', '}'].join('\n'),
    output: ['function foo() {', '  return bar;', '}'].join('\n'),
    changes: 0,
};

export const multipleSymbolsPerLine: CodeFixture = {
    name: 'multiple-symbols-per-line',
    input: ['const x: Type = 1;', 'const yy: Another = 22;'].join('\n'),
    output: ['const x : Type    = 1;', 'const yy: Another = 22;'].join('\n'),
    changes: 1,
    symbols: [':', '='],
};

export const pipeUnion: CodeFixture = {
    name: 'pipe-union',
    input: ['type Result = string | number;', 'type Complex = FooBar | Baz | Qux;'].join('\n'),
    output: ['type Result = string  | number;', 'type Complex = FooBar | Baz | Qux;'].join('\n'),
    changes: 1,
    symbols: ['|'],
};

export const dotChainMethod: CodeFixture = {
    name: 'dot-chain-method',
    input: ['const x = foo', '  .bar()', '    .longMethod()', '  .baz();'].join('\n'),
    output: ['const x = foo', '    .bar()', '    .longMethod()', '    .baz();'].join('\n'),
    changes: 2,
    symbols: ['.'],
};

export const exportKeywordPad: CodeFixture = {
    name: 'export-keyword-pad',
    input: ['export const foo = 1;', 'const bar = 22;', 'export const baz = 333;'].join('\n'),
    output: ['export const foo = 1;', '       const bar = 22;', 'export const baz = 333;'].join('\n'),
    changes: 1,
    symbols: ['export', '='],
};

export const tsReadonlyInterface: CodeFixture = {
    name: 'ts-readonly-interface',
    input: ['interface Config {', '  readonly name: string;', '  readonly longNameValue: number;', '  readonly x: boolean;', '}'].join('\n'),
    output: ['interface Config {', '  readonly name         : string;', '  readonly longNameValue: number;', '  readonly x            : boolean;', '}'].join('\n'),
    changes: 2,
    symbols: [':'],
};

export const dartKeywordMix: CodeFixture = {
    name: 'dart-keyword-mix',
    input: ["final String name = 'hello';", 'final int longValue = 42;', 'var x = true;', 'dynamic dynamicVar = null;'].join('\n'),
    output: ["final String name   = 'hello';", 'final int longValue = 42;', 'var x               = true;', 'dynamic dynamicVar  = null;'].join('\n'),
    changes: 3,
};

export const csharpMultiKeyword: CodeFixture = {
    name: 'csharp-multi-keyword',
    input: ['public required string name = "value";', 'internal readonly int longValue = 42;', 'protected string x = "default";'].join('\n'),
    output: ['public required string name     = "value";', 'internal readonly int longValue = 42;', 'protected string x              = "default";'].join('\n'),
    changes: 2,
    language: 'csharp',
};

// ────────────────────────────
// language specific snippets
// ────────────────────────────

export const pythonAssignments: CodeFixture = {
    name: 'python-assignments',
    input: ['name = "ada"', 'greeting = "hello"', 'city = "London"'].join('\n'),
    output: ['name     = "ada"', 'greeting = "hello"', 'city     = "London"'].join('\n'),
    changes: 2,
    language: 'python',
};

export const pythonDict: CodeFixture = {
    name: 'python-dict',
    input: ['config = {', '    "host": "localhost",', '    "portValue": 8080,', '    "sslEnabled": True,', '}'].join('\n'),
    output: ['config = {', '    "host"      : "localhost",', '    "portValue" : 8080,', '    "sslEnabled": True,', '}'].join('\n'),
    changes: 2,
    symbols: [':'],
    language: 'python',
};

export const goShortDeclaration: CodeFixture = {
    name: 'go-short-declaration',
    input: ['x := 1', 'yyyy := 22', 'zz := 333'].join('\n'),
    output: ['x    := 1', 'yyyy := 22', 'zz   := 333'].join('\n'),
    changes: 2,
    symbols: [':='],
    language: 'go',
};

export const rustStruct: CodeFixture = {
    name: 'rust-struct',
    input: ['struct Point {', '    x: f64,', '    yCoordinate: f64,', '}'].join('\n'),
    output: ['struct Point {', '    x          : f64,', '    yCoordinate: f64,', '}'].join('\n'),
    changes: 1,
    symbols: [':'],
    language: 'rust',
};

export const rustLifetimeIsNotAString: CodeFixture = {
    name: 'rust-lifetime-is-not-a-string',
    input: ["fn longest<'a>(first: &'a str, second: &'a str) -> &'a str {", '    if first.len() > second.len() { first } else { second }', '}'].join('\n'),
    output: ["fn longest<'a>(first: &'a str, second: &'a str) -> &'a str {", '    if first.len() > second.len() { first } else { second }', '}'].join('\n'),
    changes: 0,
    language: 'rust',
};

export const javaConstants: CodeFixture = {
    name: 'java-constants',
    input: ['private static final int MAX_SIZE = 100;', 'private static final int MIN = 1;'].join('\n'),
    output: ['private static final int MAX_SIZE = 100;', 'private static final int MIN      = 1;'].join('\n'),
    changes: 1,
    language: 'java',
};

export const csharpProperties: CodeFixture = {
    name: 'csharp-properties',
    input: ['public string Name { get; set; } = "x";', 'public string LongName { get; set; } = "y";'].join('\n'),
    output: ['public string Name { get; set; }     = "x";', 'public string LongName { get; set; } = "y";'].join('\n'),
    changes: 1,
    language: 'csharp',
};

export const rubyHash: CodeFixture = {
    name: 'ruby-hash',
    input: ['{ a: 1,', '  bcd: 22,', '}'].join('\n'),
    output: ['{ a  : 1,', '  bcd: 22,', '}'].join('\n'),
    changes: 1,
    symbols: [':'],
    language: 'ruby',
};

export const phpArray: CodeFixture = {
    name: 'php-array',
    input: ['$array = [', "    'a' => 1,", "    'bcd' => 22,", '];'].join('\n'),
    output: ['$array = [', "    'a'   => 1,", "    'bcd' => 22,", '];'].join('\n'),
    changes: 1,
    symbols: ['=>'],
    language: 'php',
};

export const yamlMapping: CodeFixture = {
    name: 'yaml-mapping',
    input: ['name: ada', 'greeting: hello', 'city: London'].join('\n'),
    output: ['name    : ada', 'greeting: hello', 'city    : London'].join('\n'),
    changes: 2,
    symbols: [':'],
    language: 'yaml',
};

export const jsonObject: CodeFixture = {
    name: 'json-object',
    input: ['{', '  "a": 1,', '  "bcd": 22', '}'].join('\n'),
    output: ['{', '  "a"  : 1,', '  "bcd": 22', '}'].join('\n'),
    changes: 1,
    symbols: [':'],
    language: 'json',
};

export const shellVariables: CodeFixture = {
    name: 'shell-variables',
    input: ['export PATH="/usr/local/bin:$PATH"', 'export LANG="en_US.UTF-8"', 'export EDITOR="vim"'].join('\n'),
    output: ['export PATH  ="/usr/local/bin:$PATH"', 'export LANG  ="en_US.UTF-8"', 'export EDITOR="vim"'].join('\n'),
    changes: 2,
    language: 'shell',
};

// ────────────────────────────
// every language profile aligns its default symbol
// ────────────────────────────

export const languageGeneric: CodeFixture = {
    name: 'language-generic',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'generic',
};

export const languageJavascript: CodeFixture = {
    name: 'language-javascript',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'javascript',
};

export const languageTypescript: CodeFixture = {
    name: 'language-typescript',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'typescript',
};

export const languagePython: CodeFixture = {
    name: 'language-python',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'python',
};

export const languageGo: CodeFixture = {
    name: 'language-go',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'go',
};

export const languageRust: CodeFixture = {
    name: 'language-rust',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'rust',
};

export const languageJava: CodeFixture = {
    name: 'language-java',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'java',
};

export const languageKotlin: CodeFixture = {
    name: 'language-kotlin',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'kotlin',
};

export const languageSwift: CodeFixture = {
    name: 'language-swift',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'swift',
};

export const languageCsharp: CodeFixture = {
    name: 'language-csharp',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'csharp',
};

export const languageCpp: CodeFixture = {
    name: 'language-cpp',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'cpp',
};

export const languageC: CodeFixture = {
    name: 'language-c',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'c',
};

export const languageRuby: CodeFixture = {
    name: 'language-ruby',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'ruby',
};

export const languagePhp: CodeFixture = {
    name: 'language-php',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'php',
};

export const languageDart: CodeFixture = {
    name: 'language-dart',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'dart',
};

export const languageShell: CodeFixture = {
    name: 'language-shell',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'shell',
};

export const languageSql: CodeFixture = {
    name: 'language-sql',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'sql',
};

export const languageYaml: CodeFixture = {
    name: 'language-yaml',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'yaml',
};

export const languageJson: CodeFixture = {
    name: 'language-json',
    input: ['key: value', 'longerKey: value', 'k: value'].join('\n'),
    output: ['key      : value', 'longerKey: value', 'k        : value'].join('\n'),
    changes: 2,
    language: 'json',
};

export const languageCss: CodeFixture = {
    name: 'language-css',
    input: ['key: value', 'longerKey: value', 'k: value'].join('\n'),
    output: ['key      : value', 'longerKey: value', 'k        : value'].join('\n'),
    changes: 2,
    language: 'css',
};

export const languageHtml: CodeFixture = {
    name: 'language-html',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'html',
};

export const languageXml: CodeFixture = {
    name: 'language-xml',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'xml',
};

export const languageMarkdown: CodeFixture = {
    name: 'language-markdown',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'markdown',
};

export const languagePlaintext: CodeFixture = {
    name: 'language-plaintext',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'plaintext',
};

export const languageElixir: CodeFixture = {
    name: 'language-elixir',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'elixir',
};

export const languageHaskell: CodeFixture = {
    name: 'language-haskell',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'haskell',
};

export const languageLua: CodeFixture = {
    name: 'language-lua',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'lua',
};

export const languageScala: CodeFixture = {
    name: 'language-scala',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'scala',
};

export const languageObjectivec: CodeFixture = {
    name: 'language-objectivec',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'objectivec',
};

export const languagePerl: CodeFixture = {
    name: 'language-perl',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'perl',
};

export const languageJulia: CodeFixture = {
    name: 'language-julia',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'julia',
};

export const languageZig: CodeFixture = {
    name: 'language-zig',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'zig',
};

export const languagePowershell: CodeFixture = {
    name: 'language-powershell',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'powershell',
};

export const languageClojure: CodeFixture = {
    name: 'language-clojure',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'clojure',
};

export const languageErlang: CodeFixture = {
    name: 'language-erlang',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'erlang',
};

export const languageR: CodeFixture = {
    name: 'language-r',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'r',
};

export const languageFortran: CodeFixture = {
    name: 'language-fortran',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'fortran',
};

export const languageNim: CodeFixture = {
    name: 'language-nim',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'nim',
};

export const languageCrystal: CodeFixture = {
    name: 'language-crystal',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'crystal',
};

export const languageGleam: CodeFixture = {
    name: 'language-gleam',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'gleam',
};

export const languageOdin: CodeFixture = {
    name: 'language-odin',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'odin',
};

export const languageSolidity: CodeFixture = {
    name: 'language-solidity',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'solidity',
};

export const languageGroovy: CodeFixture = {
    name: 'language-groovy',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'groovy',
};

export const languageTerraform: CodeFixture = {
    name: 'language-terraform',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'terraform',
};

export const languageToml: CodeFixture = {
    name: 'language-toml',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'toml',
};

export const languageIni: CodeFixture = {
    name: 'language-ini',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'ini',
};

export const languageMakefile: CodeFixture = {
    name: 'language-makefile',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'makefile',
};

export const languageDockerfile: CodeFixture = {
    name: 'language-dockerfile',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'dockerfile',
};

export const languageGraphql: CodeFixture = {
    name: 'language-graphql',
    input: ['key: value', 'longerKey: value', 'k: value'].join('\n'),
    output: ['key      : value', 'longerKey: value', 'k        : value'].join('\n'),
    changes: 2,
    language: 'graphql',
};

export const languageVb: CodeFixture = {
    name: 'language-vb',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'vb',
};

export const languageDelphi: CodeFixture = {
    name: 'language-delphi',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'delphi',
};

export const languageVue: CodeFixture = {
    name: 'language-vue',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'vue',
};

export const languageSvelte: CodeFixture = {
    name: 'language-svelte',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'svelte',
};

export const languageAstro: CodeFixture = {
    name: 'language-astro',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'astro',
};

export const languageProtobuf: CodeFixture = {
    name: 'language-protobuf',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'protobuf',
};

export const languageV: CodeFixture = {
    name: 'language-v',
    input: ['value = 1', 'longerValue = 22', 'v = 333'].join('\n'),
    output: ['value       = 1', 'longerValue = 22', 'v           = 333'].join('\n'),
    changes: 2,
    language: 'v',
};

// ────────────────────────────
// range — which lines take part in the alignment
// ────────────────────────────

export const rangeMiddleLines: CodeFixture = {
    name: 'range-middle-lines',
    input: ['const a = 1;', 'const bb = 22;', 'const ccc = 333;', 'const dddd = 4444;'].join('\n'),
    output: ['const a = 1;', 'const bb  = 22;', 'const ccc = 333;', 'const dddd = 4444;'].join('\n'),
    changes: 1,
    range: { start: 1, end: 3 },
};

export const rangeIgnoresOutsideLines: CodeFixture = {
    name: 'range-ignores-outside-lines',
    input: ['x = 1', 'AVeryLongVariableName = 2', 'y = 3'].join('\n'),
    output: ['x = 1', 'AVeryLongVariableName = 2', 'y = 3'].join('\n'),
    changes: 0,
    range: { start: 0, end: 1 },
};

export const rangeInsideMultilineString: CodeFixture = {
    name: 'range-inside-multiline-string',
    input: ['x = """a', '= b"""', 'longerName = 1'].join('\n'),
    output: ['x = """a', '= b"""', 'longerName = 1'].join('\n'),
    changes: 0,
    language: 'python',
    range: { start: 1, end: 2 },
};

// ────────────────────────────
// collect all fixtures for the batch test
// ────────────────────────────

export const allFixtures: readonly CodeFixture[] = [
    eqBasic,
    eqAlreadyAligned,
    eqWithSemicolons,
    eqMixedIndentation,
    scopeBlockSplitsAtBlankLines,
    scopeFileAlignsEverything,
    rangeMiddleLines,
    rangeIgnoresOutsideLines,
    rangeInsideMultilineString,
    colonTypeAnnotations,
    colonObjectLiteral,
    arrowSimple,
    arrowObjectReturn,
    commentSlashSlash,
    commentHashPython,
    commentDashSql,
    mixedColonAndEq,
    mixedEqColonArrow,
    mixedReadonlyColon,
    realWorldCss,
    realWorldEnum,
    realWorldDestructure,
    realWorldImport,
    skipInsideStrings,
    skipInsideComments,
    skipInsideMultilineBlockComment,
    skipInsidePythonDocstring,
    skipInsideGoRawString,
    arrowIsNotAnAssignment,
    equalityIsNotAnAssignment,
    shortDeclarationIsNotAnAssignment,
    singleLine,
    emptyLines,
    noSymbol,
    multipleSymbolsPerLine,
    pipeUnion,
    dotChainMethod,
    exportKeywordPad,
    tsReadonlyInterface,
    dartKeywordMix,
    csharpMultiKeyword,
    pythonAssignments,
    pythonDict,
    goShortDeclaration,
    rustStruct,
    rustLifetimeIsNotAString,
    javaConstants,
    csharpProperties,
    rubyHash,
    phpArray,
    yamlMapping,
    jsonObject,
    shellVariables,
    languageGeneric,
    languageJavascript,
    languageTypescript,
    languagePython,
    languageGo,
    languageRust,
    languageJava,
    languageKotlin,
    languageSwift,
    languageCsharp,
    languageCpp,
    languageC,
    languageRuby,
    languagePhp,
    languageDart,
    languageShell,
    languageSql,
    languageYaml,
    languageJson,
    languageCss,
    languageHtml,
    languageXml,
    languageMarkdown,
    languagePlaintext,
    languageElixir,
    languageHaskell,
    languageLua,
    languageScala,
    languageObjectivec,
    languagePerl,
    languageJulia,
    languageZig,
    languagePowershell,
    languageClojure,
    languageErlang,
    languageR,
    languageFortran,
    languageNim,
    languageCrystal,
    languageGleam,
    languageOdin,
    languageSolidity,
    languageGroovy,
    languageTerraform,
    languageToml,
    languageIni,
    languageMakefile,
    languageDockerfile,
    languageGraphql,
    languageVb,
    languageDelphi,
    languageVue,
    languageSvelte,
    languageAstro,
    languageProtobuf,
    languageV,
];
