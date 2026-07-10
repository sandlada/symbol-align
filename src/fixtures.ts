/**
 * Test fixtures for multi-line code alignment scenarios.
 * Each fixture has an `input` code block and the expected `output` after alignment.
 */
export interface CodeFixture {
    name: string;
    input: string;
    output: string;
    changes: number;
    symbols?: string[];
}

// ────────────────────────────
// = 赋值对齐
// ────────────────────────────

export const eqBasic: CodeFixture = {
    name: 'eq-basic',
    input: [
        'const foo = 1',
        'const foobar = 22',
        'const foobarbaz = 333',
    ].join('\n'),
    output: [
        'const foo       = 1',
        'const foobar    = 22',
        'const foobarbaz = 333',
    ].join('\n'),
    changes: 2,
};

export const eqAlreadyAligned: CodeFixture = {
    name: 'eq-already-aligned',
    input: [
        'const foo       = 1',
        'const foobar    = 22',
        'const foobarbaz = 333',
    ].join('\n'),
    output: [
        'const foo       = 1',
        'const foobar    = 22',
        'const foobarbaz = 333',
    ].join('\n'),
    changes: 0,
};

export const eqWithSemicolons: CodeFixture = {
    name: 'eq-with-semicolons',
    input: [
        'const foo = 1;',
        'const foobar = 22;',
        'const foobarbaz = 333;',
    ].join('\n'),
    output: [
        'const foo       = 1;',
        'const foobar    = 22;',
        'const foobarbaz = 333;',
    ].join('\n'),
    changes: 2,
};

export const eqWithBlankLines: CodeFixture = {
    name: 'eq-with-blank-lines',
    input: [
        'name = "foo"',
        '',
        'value = "bar"',
        '',
        'label = "baz"',
    ].join('\n'),
    output: [
        'name  = "foo"',
        '',
        'value = "bar"',
        '',
        'label = "baz"',
    ].join('\n'),
    changes: 1,
};

export const eqMixedIndentation: CodeFixture = {
    name: 'eq-mixed-indentation',
    input: [
        '  let x = 1',
        '    let y = 2',
        'let z = 3',
    ].join('\n'),
    output: [
        '  let x   = 1',
        '    let y = 2',
        'let z     = 3',
    ].join('\n'),
    changes: 2,
};

// ────────────────────────────
// : 对齐（类型标注/对象）
// ────────────────────────────

export const colonTypeAnnotations: CodeFixture = {
    name: 'colon-type-annotations',
    input: [
        'const x: string;',
        'const yy: number;',
        'const zzz: boolean;',
    ].join('\n'),
    output: [
        'const x  : string;',
        'const yy : number;',
        'const zzz: boolean;',
    ].join('\n'),
    changes: 2,
    symbols: [':'],
};

export const colonObjectLiteral: CodeFixture = {
    name: 'colon-object-literal',
    input: [
        'const config = {',
        '  host: "localhost",',
        '  portValue: 8080,',
        '  sslEnabled: true,',
        '};',
    ].join('\n'),
    output: [
        'const config = {',
        '  host      : "localhost",',
        '  portValue : 8080,',
        '  sslEnabled: true,',
        '};',
    ].join('\n'),
    changes: 2,
    symbols: [':'],
};

// ────────────────────────────
// => 对齐
// ────────────────────────────

export const arrowSimple: CodeFixture = {
    name: 'arrow-simple',
    input: [
        'const f = (x) => x;',
        'const g = (xyz) => xyz;',
    ].join('\n'),
    output: [
        'const f = (x)   => x;',
        'const g = (xyz) => xyz;',
    ].join('\n'),
    changes: 1,
    symbols: ['=>'],
};

export const arrowObjectReturn: CodeFixture = {
    name: 'arrow-object-return',
    input: [
        'const fn1 = (a: number) => ({ a });',
        'const fnLong = (a: number) => ({ a });',
    ].join('\n'),
    output: [
        'const fn1 = (a: number)    => ({ a });',
        'const fnLong = (a: number) => ({ a });',
    ].join('\n'),
    changes: 1,
    symbols: ['=>'],
};

// ────────────────────────────
// // 和 # 注释对齐
// ────────────────────────────

export const commentSlashSlash: CodeFixture = {
    name: 'comment-slash-slash',
    input: [
        'const a = 1;  // short',
        'const bb = 22; // longer',
        'const ccc = 333; // even longer',
    ].join('\n'),
    output: [
        'const a   = 1;   // short',
        'const bb  = 22;  // longer',
        'const ccc = 333; // even longer',
    ].join('\n'),
    changes: 4,
    symbols: ['=', '//'],
};

export const commentHashPython: CodeFixture = {
    name: 'comment-hash-python',
    input: [
        'x = 1   # short',
        'yy = 22 # longer',
        'zzz = 333 # even longer',
    ].join('\n'),
    output: [
        'x   = 1   # short',
        'yy  = 22  # longer',
        'zzz = 333 # even longer',
    ].join('\n'),
    changes: 3,
    symbols: ['=', '#'],
};

// ────────────────────────────
// 混合多符号对齐
// ────────────────────────────

export const mixedColonAndEq: CodeFixture = {
    name: 'mixed-colon-and-eq',
    input: [
        'const x: Type = 1;',
        'const yy: AnotherType = 22;',
    ].join('\n'),
    output: [
        'const x : Type        = 1;',
        'const yy: AnotherType = 22;',
    ].join('\n'),
    changes: 2,
    symbols: [':', '='],
};

export const mixedEqColonAndArrow: CodeFixture = {
    name: 'mixed-eq-colon-arrow',
    input: [
        'export const add = (x: number, y: number): number => x + y;',
        'export const greetLong = (name: string): string => `Hi ${name}`;',
    ].join('\n'),
    output: [
        'export const add       = (x   : number, y: number): number => x + y;',
        'export const greetLong = (name: string): string            => `Hi ${name}`;',
    ].join('\n'),
    changes: 3,
    symbols: ['=', ':', '=>'],
};

export const mixedInterfaceEqAndReadonly: CodeFixture = {
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
    changes: 10,
    symbols: ['readonly', ':'],
};

// ────────────────────────────
// 真实世界场景
// ────────────────────────────

export const realWorldCSS: CodeFixture = {
    name: 'real-world-css',
    input: [
        '.card {',
        '  color: red;',
        '  backgroundColorValue: blue;',
        '  borderColor: green;',
        '}',
    ].join('\n'),
    output: [
        '.card {',
        '  color               : red;',
        '  backgroundColorValue: blue;',
        '  borderColor         : green;',
        '}',
    ].join('\n'),
    changes: 2,
    symbols: [':'],
};

export const realWorldEnum: CodeFixture = {
    name: 'real-world-enum',
    input: [
        'enum Status {',
        '  Active = 1,',
        '  InactiveLong = 2,',
        '  Pending = 3,',
        '}',
    ].join('\n'),
    output: [
        'enum Status {',
        '  Active       = 1,',
        '  InactiveLong = 2,',
        '  Pending      = 3,',
        '}',
    ].join('\n'),
    changes: 2,
    symbols: ['='],
};

export const realWorldDestructure: CodeFixture = {
    name: 'real-world-destructure',
    input: [
        'const {',
        '  name: userName,',
        '  age: userAgeLong,',
        '  email: userEmail,',
        '} = props;',
    ].join('\n'),
    output: [
        'const {',
        '  name : userName,',
        '  age  : userAgeLong,',
        '  email: userEmail,',
        '} = props;',
    ].join('\n'),
    changes: 2,
    symbols: [':'],
};

export const realWorldImport: CodeFixture = {
    name: 'real-world-import',
    input: [
        'import { readFile } from "fs";',
        'import { writeFile } from "fs/promises";',
        'import { readdirSync } from "fs";',
    ].join('\n'),
    output: [
        'import { readFile    } from "fs";',
        'import { writeFile   } from "fs/promises";',
        'import { readdirSync } from "fs";',
    ].join('\n'),
    changes: 2,
    symbols: ['}'],
};

// ────────────────────────────
// 跳过字符串/注释内部的符号
// ────────────────────────────

export const skipInsideStrings: CodeFixture = {
    name: 'skip-inside-strings',
    input: [
        "const msg = 'hello = world = foo';",
        'const greeting = "hi = there";',
        'const code = `a = b = c`;',
    ].join('\n'),
    output: [
        "const msg      = 'hello = world = foo';",
        'const greeting = "hi = there";',
        'const code     = `a = b = c`;',
    ].join('\n'),
    changes: 2,
};

export const skipInsideComments: CodeFixture = {
    name: 'skip-inside-comments',
    input: [
        'const a = 1; /* = */',
        'const bb = 2; // = comment',
    ].join('\n'),
    output: [
        'const a  = 1; /* = */',
        'const bb = 2; // = comment',
    ].join('\n'),
    changes: 1,
};

// ────────────────────────────
// 边界情况
// ────────────────────────────

export const singleLine: CodeFixture = {
    name: 'single-line',
    input: 'const x = 1;',
    output: 'const x = 1;',
    changes: 0,
};

export const emptyLines: CodeFixture = {
    name: 'empty-lines',
    input: '\n\n\n',
    output: '\n\n\n',
    changes: 0,
};

export const noSymbol: CodeFixture = {
    name: 'no-symbol',
    input: [
        'function foo() {',
        '  return bar;',
        '}',
    ].join('\n'),
    output: [
        'function foo() {',
        '  return bar;',
        '}',
    ].join('\n'),
    changes: 0,
};

export const multipleSymbolsPerLine: CodeFixture = {
    name: 'multiple-symbols-per-line',
    input: [
        'const x: Type = 1;',
        'const yy: Another = 22;',
    ].join('\n'),
    output: [
        'const x : Type    = 1;',
        'const yy: Another = 22;',
    ].join('\n'),
    changes: 2,
    symbols: [':', '='],
};

// ────────────────────────────
// 语言特定场景
// ────────────────────────────

export const tsReadonlyInterface: CodeFixture = {
    name: 'ts-readonly-interface',
    input: [
        'interface Config {',
        '  readonly name: string;',
        '  readonly longNameValue: number;',
        '  readonly x: boolean;',
        '}',
    ].join('\n'),
    output: [
        'interface Config {',
        '  readonly name         : string;',
        '  readonly longNameValue: number;',
        '  readonly x            : boolean;',
        '}',
    ].join('\n'),
    changes: 2,
    symbols: [':'],
};

export const dartKeywordMix: CodeFixture = {
    name: 'dart-keyword-mix',
    input: [
        'final String name = \'hello\';',
        'final int longValue = 42;',
        'var x = true;',
        'dynamic dynamicVar = null;',
    ].join('\n'),
    output: [
        'final String name   = \'hello\';',
        'final int longValue = 42;',
        'var x               = true;',
        'dynamic dynamicVar  = null;',
    ].join('\n'),
    changes: 3,
    symbols: ['='],
};

export const csharpMultiKeyword: CodeFixture = {
    name: 'csharp-multi-keyword',
    input: [
        'public required string name = "value";',
        'internal readonly int longValue = 42;',
        'protected string x = "default";',
    ].join('\n'),
    output: [
        'public required string name     = "value";',
        'internal readonly int longValue = 42;',
        'protected string x              = "default";',
    ].join('\n'),
    changes: 2,
    symbols: ['='],
};

// ────────────────────────────
// | 对齐（联合类型）
// ────────────────────────────

export const pipeUnion: CodeFixture = {
    name: 'pipe-union',
    input: [
        'type Result = string | number;',
        'type Complex = FooBar | Baz | Qux;',
    ].join('\n'),
    output: [
        'type Result = string  | number;',
        'type Complex = FooBar | Baz | Qux;',
    ].join('\n'),
    changes: 1,
    symbols: ['|'],
};

// ────────────────────────────
// . 对齐（方法链）
// ────────────────────────────

export const dotChainMethod: CodeFixture = {
    name: 'dot-chain-method',
    input: [
        'const x = foo',
        '  .bar()',
        '    .longMethod()',
        '  .baz();',
    ].join('\n'),
    output: [
        'const x = foo',
        '    .bar()',
        '    .longMethod()',
        '    .baz();',
    ].join('\n'),
    changes: 2,
    symbols: ['.'],
};

// ────────────────────────────
// export 关键字填充 + = 对齐
// ────────────────────────────

export const exportKeywordPad: CodeFixture = {
    name: 'export-keyword-pad',
    input: [
        'export const foo = 1;',
        'const bar = 22;',
        'export const baz = 333;',
    ].join('\n'),
    output: [
        'export const foo = 1;',
        '       const bar = 22;',
        'export const baz = 333;',
    ].join('\n'),
    changes: 1,
    symbols: ['export', '='],
};

// ────────────────────────────
// 收集所有 fixture 方便批量测试
// ────────────────────────────

export const allFixtures: CodeFixture[] = [
    eqBasic,
    eqAlreadyAligned,
    eqWithSemicolons,
    eqWithBlankLines,
    eqMixedIndentation,
    colonTypeAnnotations,
    colonObjectLiteral,
    arrowSimple,
    arrowObjectReturn,
    commentSlashSlash,
    commentHashPython,
    mixedColonAndEq,
    mixedEqColonAndArrow,
    mixedInterfaceEqAndReadonly,
    realWorldCSS,
    realWorldEnum,
    realWorldDestructure,
    realWorldImport,
    skipInsideStrings,
    skipInsideComments,
    singleLine,
    emptyLines,
    noSymbol,
    multipleSymbolsPerLine,
    tsReadonlyInterface,
    dartKeywordMix,
    csharpMultiKeyword,
    pipeUnion,
    dotChainMethod,
    exportKeywordPad,
];
