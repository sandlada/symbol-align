/**
 * Public type contract for `@sandlada/symbol-align`.
 *
 * The library is a **code-snippet symbol-alignment formatter**: it pads
 * punctuation symbols (`=`, `:`, `=>`, `->`, …) so that they line up
 * vertically. It never rewrites code — it only ever inserts spaces.
 */

/** A punctuation token that can be aligned vertically, e.g. `=`, `:`, `=>`, `->`. */
export type AlignSymbol = string;

/** Identifier of a supported language profile. */
export type LanguageId =
    | 'generic'
    | 'javascript'
    | 'typescript'
    | 'python'
    | 'go'
    | 'rust'
    | 'java'
    | 'kotlin'
    | 'swift'
    | 'csharp'
    | 'cpp'
    | 'c'
    | 'ruby'
    | 'php'
    | 'dart'
    | 'shell'
    | 'sql'
    | 'yaml'
    | 'json'
    | 'css'
    | 'html'
    | 'xml'
    | 'markdown'
    | 'plaintext';

/** How escape sequences are handled inside a string literal. */
export type EscapeMode =
    /** `\` escapes the next character (JavaScript, Python, Rust, Go, …). */
    | 'backslash'
    /** A doubled quote is an escaped quote (C# verbatim strings, SQL). */
    | 'doubled'
    /** Nothing escapes the closing delimiter (Go raw strings, C# raw strings). */
    | 'none';

/** A string literal delimiter of a language. */
export interface StringDelimiter {
    /** Opening delimiter, e.g. `'`, `"`, `` ` ``, `"""`. */
    readonly open: string;
    /** Closing delimiter, e.g. `'`, `"`, `` ` ``. */
    readonly close: string;
    /** Escape handling inside the literal. */
    readonly escape: EscapeMode;
    /** Whether the literal may span multiple lines. */
    readonly multiline: boolean;
}

/** A block comment delimiter pair, e.g. slash-star and star-slash. */
export type BlockComment = readonly [open: string, close: string];

/** Everything the scanner needs to know about a language. */
export interface LanguageProfile {
    /** Stable identifier used by the CLI and the API. */
    readonly id: LanguageId;
    /** Human readable name. */
    readonly name: string;
    /** File extensions handled by the profile, without the leading dot. */
    readonly extensions: readonly string[];
    /** Line comment starters, e.g. `//` or `#`. */
    readonly lineComments: readonly string[];
    /** Block comment delimiter pairs. */
    readonly blockComments: readonly BlockComment[];
    /** String literal delimiters. */
    readonly strings: readonly StringDelimiter[];
    /**
     * Operator tokens of the language, longest first.
     *
     * A requested symbol is rejected when it is only a fragment of a longer
     * operator — aligning the `=` of `=>` or of `==` is never intended.
     */
    readonly operators: readonly string[];
    /** Symbols aligned by default for this language. */
    readonly defaultSymbols: readonly AlignSymbol[];
}

/** A contiguous region of a line that contains real code (not string or comment text). */
export interface CodeRegion {
    /** Inclusive column where the region starts. */
    readonly start: number;
    /** Exclusive column where the region ends. */
    readonly end: number;
}

/** The trailing line comment of a line. */
export interface LineComment {
    /** Column of the comment marker. */
    readonly column: number;
    /** The comment marker itself, e.g. `//` or `#`. */
    readonly marker: string;
}

/** Result of scanning a source text. */
export interface ScanResult {
    /** Code regions per line — the array index is the line number. */
    readonly codeRegions: readonly (readonly CodeRegion[])[];
    /** Trailing line comment per line — the array index is the line number. */
    readonly lineComments: readonly (LineComment | undefined)[];
}

/**
 * How lines are grouped before they are aligned.
 *
 * - `block` — only lines that belong to the same blank-line separated block
 *   are aligned with each other (default).
 * - `file` — every line of the input is aligned as a single group.
 */
export type AlignmentScope = 'block' | 'file';

/** Options accepted by {@link align}. */
export interface AlignOptions {
    /** Symbols to align. Defaults to the language profile's `defaultSymbols`. */
    readonly symbols?: readonly AlignSymbol[];
    /** Language profile that drives string and comment handling. Defaults to `plaintext`. */
    readonly language?: LanguageId;
    /** Grouping strategy used before aligning. Defaults to `block`. */
    readonly scope?: AlignmentScope;
}

/** The outcome of an alignment run. */
export interface AlignResult {
    /** The aligned code. */
    readonly code: string;
    /** Number of distinct lines that were modified. */
    readonly changes: number;
}
