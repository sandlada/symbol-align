/**
 * Public type contract for `@sandlada/symbol-align`.
 *
 * The library is a **code-snippet symbol-alignment formatter**: it pads
 * punctuation symbols (`=`, `:`, `=>`, `->`, …) so that they line up
 * vertically. It never rewrites code — it only ever inserts spaces.
 */

/** A punctuation token that can be aligned vertically, e.g. `=`, `:`, `=>`, `->`. */
export type AlignSymbol = string;

/** A group of alternative tokens that share one alignment column. */
export type AlignGroup = readonly AlignSymbol[];

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
    | 'plaintext'
    | 'elixir'
    | 'haskell'
    | 'lua'
    | 'scala'
    | 'objectivec'
    | 'perl'
    | 'julia'
    | 'zig'
    | 'powershell'
    | 'clojure'
    | 'erlang'
    | 'r'
    | 'fortran'
    | 'nim'
    | 'crystal'
    | 'gleam'
    | 'odin'
    | 'solidity'
    | 'groovy'
    | 'terraform'
    | 'toml'
    | 'ini'
    | 'makefile'
    | 'dockerfile'
    | 'graphql'
    | 'vb'
    | 'delphi'
    | 'vue'
    | 'svelte'
    | 'astro'
    | 'protobuf'
    | 'v';

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

/**
 * How declarations of a language are laid out.
 *
 * - `prefix` — the modifiers come first (`public static readonly int value`).
 * - `type-first` — the type comes first (`uint256 public value`, Solidity).
 * - `none` — the language has no declaration column worth aligning.
 */
export type DeclarationStyle = 'prefix' | 'type-first' | 'none';

/**
 * Which edge of a declaration cell is aligned.
 *
 * - `start` — the content of a cell starts at the same column (default).
 * - `end` — the cell is padded on its left, so its content ends at the same
 *   column.
 */
export type DeclarationAnchor = 'start' | 'end';

/** One visual segment of a declaration. */
export interface DeclarationCell {
    /** The segment of the declaration this cell covers. */
    readonly kind: 'modifiers' | 'type' | 'name';
    /** Inclusive column of the first non-blank character. */
    readonly start: number;
    /** Exclusive column behind the last non-blank character. */
    readonly end: number;
}

/** Options accepted by {@link findDeclarationCells}. */
export interface DeclarationOptions {
    /** Code regions of the line (real code only). */
    readonly regions: readonly CodeRegion[];
    /** Declaration style that decides how the line is split into cells. */
    readonly style: DeclarationStyle;
}

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
    /** How declarations are split into alignment cells. */
    readonly declarations: DeclarationStyle;
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
 *   are aligned with each other, whatever their indentation is (default).
 * - `indent` — only consecutive lines with the same indentation are aligned
 *   with each other, so every nesting level keeps its own column.
 * - `file` — every line of the input is aligned as a single group.
 */
export type AlignmentScope = 'block' | 'indent' | 'file';

/** A range of lines of the input. */
export interface LineRange {
    /** Zero-based index of the first line of the range (inclusive). */
    readonly start: number;
    /** Zero-based index of the line behind the range (exclusive). */
    readonly end: number;
}

/** Options accepted by {@link align}. */
export interface AlignOptions {
    /**
     * Symbols to align. Defaults to the language profile's `defaultSymbols`.
     *
     * An explicit empty list aligns no symbols — configured groups are still
     * aligned.
     */
    readonly symbols?: readonly AlignSymbol[];
    /**
     * Groups of alternative tokens. Each group is aligned to one column:
     * the first occurrence of any member on a line is padded so that all
     * first occurrences of the group start at the same column.
     *
     * Groups are aligned before the symbols and run in the order they are
     * given. A token that appears in a group is removed from the symbol list.
     * Duplicate and empty members are ignored.
     *
     * A line whose declaration prefix (`modifiers`, `type` or `name`) contains
     * a group member is left out of the declaration alignment, so the
     * declaration pass and the group pass never move each other's target.
     *
     * A group whose members alternate their order across lines can conflict
     * with another group the same way a conflicting symbol order does:
     * conflicting groups may under-align; the input is returned unchanged
     * rather than diverging.
     */
    readonly groups?: readonly AlignGroup[];
    /** Language profile that drives string and comment handling. Defaults to `generic`. */
    readonly language?: LanguageId;
    /** Grouping strategy used before aligning. Defaults to `block`. */
    readonly scope?: AlignmentScope;
    /**
     * The lines that are aligned. Defaults to the whole input.
     *
     * The rest of the input is still scanned, so a string or a comment that
     * reaches into the range is recognised.
     */
    readonly range?: LineRange;
    /**
     * Whether the declaration columns of the language profile are aligned.
     *
     * Defaults to `true` unless the profile declares no declaration style.
     * The declaration pass only ever inserts spaces as well.
     */
    readonly declarations?: boolean;
    /**
     * Which edge of a declaration cell is aligned. Defaults to `start`.
     *
     * `end` pads the type on its left, so the type ends line up.
     */
    readonly declarationAnchor?: DeclarationAnchor;
    /**
     * Largest start-column difference that still joins a declaration column.
     *
     * Defaults to `12`. A value below `1` (or a non-finite value) means
     * unlimited.
     */
    readonly maxDeclarationPad?: number;
}

/** The outcome of an alignment run. */
export interface AlignResult {
    /** The aligned code. */
    readonly code: string;
    /** Number of distinct lines that were modified. */
    readonly changes: number;
}
