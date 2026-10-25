/**
 * Cross-language keyword vocabularies for declaration alignment.
 *
 * The sets are deliberately *supersets*: a word only has to look like a
 * modifier, a statement keyword, a declaration keyword or a builtin type in
 * one of the supported languages for the locator to treat it as one. None of
 * the sets depends on a specific language profile, so the locator stays a pure
 * function of the line and the declaration style.
 *
 * Every set is alphabetical, lowercase and free of duplicates.
 */

/** Words that may introduce a declaration, e.g. `public`, `static`, `readonly`. */
export const MODIFIERS: ReadonlySet<string> = new Set([
    'abstract',
    'async',
    'const',
    'constexpr',
    'contravariant',
    'covariant',
    'declare',
    'default',
    'explicit',
    'export',
    'extern',
    'file',
    'final',
    'friend',
    'implicit',
    'inline',
    'internal',
    'late',
    'let',
    'mutable',
    'native',
    'new',
    'override',
    'partial',
    'private',
    'protected',
    'public',
    'readonly',
    'register',
    'required',
    'sealed',
    'static',
    'strictfp',
    'synchronized',
    'thread_local',
    'transient',
    'unsafe',
    'val',
    'virtual',
    'volatile',
]);

/** Words that start a statement, never a declaration. */
export const STATEMENT_KEYWORDS: ReadonlySet<string> = new Set([
    'assert',
    'await',
    'break',
    'case',
    'catch',
    'checked',
    'continue',
    'default',
    'delete',
    'do',
    'else',
    'finally',
    'fixed',
    'for',
    'foreach',
    'goto',
    'if',
    'import',
    'lock',
    'nameof',
    'namespace',
    'new',
    'package',
    'raise',
    'return',
    'sizeof',
    'switch',
    'throw',
    'try',
    'typeof',
    'unchecked',
    'unsafe',
    'using',
    'while',
    'yield',
]);

/** Words that declare a type rather than a value, e.g. `class`, `enum`, `func`. */
export const DECLARATION_KEYWORDS: ReadonlySet<string> = new Set(['class', 'def', 'enum', 'extension', 'fn', 'func', 'impl', 'interface', 'module', 'namespace', 'object', 'protocol', 'record', 'struct', 'sub', 'trait', 'type', 'union']);

/** Words that can never be the name of a declaration. */
export const NON_NAMES: ReadonlySet<string> = new Set(['base', 'cls', 'operator', 'self', 'super', 'this']);

/**
 * Words that name a builtin type in at least one supported language.
 *
 * `var` and `dynamic` are types rather than modifiers: in C#, Java and Dart
 * the compiler infers the type from the initializer, so the word occupies the
 * type cell of the declaration.
 */
export const BUILTIN_TYPES: ReadonlySet<string> = new Set([
    'auto',
    'bool',
    'byte',
    'char',
    'decimal',
    'double',
    'dynamic',
    'float',
    'int',
    'long',
    'object',
    'sbyte',
    'short',
    'signed',
    'size_t',
    'string',
    'uint',
    'ulong',
    'unsigned',
    'ushort',
    'var',
    'void',
    'wchar_t',
]);
