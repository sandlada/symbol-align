/**
 * Lexical scanner for `@sandlada/symbol-align`.
 *
 * The scanner walks the source text exactly once and keeps its lexical state
 * across line boundaries, so multi-line strings and block comments are handled
 * correctly. For every line it reports:
 *
 * - the contiguous regions that hold real code — everything that is neither
 *   string nor comment text — and
 * - the trailing line comment of that line, if there is one.
 *
 * The scanner is the only place that knows about strings and comments; the
 * finder and the aligner only ever look at the regions it reports.
 */

import type { BlockComment, CodeRegion, LanguageProfile, LineComment, ScanResult, StringDelimiter } from './types.js';

/** Result of searching a line for the closing delimiter of a string literal. */
interface ClosingSearch {
    /** Index of the closing delimiter, or `-1` when the literal is not closed on this line. */
    readonly index: number;
    /** Whether the first character of the next line is escaped. */
    readonly escaped: boolean;
}

/** Longest candidate of `candidates` that matches at `index`, or `null`. */
const matchLongest = (line: string, index: number, candidates: readonly string[]): string | null => {
    let best: string | null = null;

    for (const candidate of candidates) {
        if (candidate.length === 0 || !line.startsWith(candidate, index)) continue;
        if (best === null || candidate.length > best.length) best = candidate;
    }

    return best;
};

/** Longest block comment that opens at `index`, or `null`. */
const matchBlockComment = (line: string, index: number, blockComments: readonly BlockComment[]): BlockComment | null => {
    let best: BlockComment | null = null;

    for (const block of blockComments) {
        if (!line.startsWith(block[0], index)) continue;
        if (best === null || block[0].length > best[0].length) best = block;
    }

    return best;
};

/**
 * Whether a quote at `index` opens a Rust character literal.
 *
 * Rust lifetimes (`'a`) look exactly like character literals, so a quote only
 * starts a literal when it is closed within the next three characters — a
 * single character (`'x'`) or an escaped character (`'\n'`). A quote that
 * follows `<` or `&` is a lifetime in practice and never a literal.
 */
const isRustCharLiteral = (line: string, index: number): boolean => {
    const previous = index > 0 ? line[index - 1] : '';
    if (previous === '<' || previous === '&') return false;
    if (line[index + 1] === '\\') return line[index + 3] === "'";
    return line[index + 2] === "'";
};

/** Whether `delimiter` is a JavaScript-style template literal with `${}` holes. */
const isJsTemplate = (delimiter: StringDelimiter): boolean => delimiter.open === '`' && delimiter.close === '`' && delimiter.escape === 'backslash' && delimiter.multiline;

/** Whether `delimiter` is a C# interpolated string with `{}` holes. */
const isCSharpInterpolated = (delimiter: StringDelimiter): boolean => delimiter.open.startsWith('$') || delimiter.open === '@$"';

/** Result of scanning an interpolated string across a single line. */
interface InterpolatedSearch {
    /** Index of the closing delimiter, or `-1` when the literal stays open. */
    readonly index: number;
    /** Brace depth at the end of the line (carried into the next line). */
    readonly depth: number;
    /** Whether the first character of the next line is escaped. */
    readonly escaped: boolean;
}

/**
 * Scans a JavaScript template literal, keeping `${}` holes opaque.
 *
 * The whole template — holes included — stays a string, so symbols inside
 * never reach the aligner. Nested backticks inside holes are ignored on
 * purpose: they must not close the outer template and leak string content.
 */
const findTemplateClose = (line: string, from: number, depth: number, escapedFirst: boolean): InterpolatedSearch => {
    let index = from;
    let currentDepth = depth;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, depth: currentDepth, escaped: true };
            index += 2;
            continue;
        }

        if (line[index] === '$' && line[index + 1] === '{') {
            currentDepth += 1;
            index += 2;
            continue;
        }

        if (line[index] === '}' && currentDepth > 0) {
            currentDepth -= 1;
            index += 1;
            continue;
        }

        if (line[index] === '`' && currentDepth === 0) {
            return { index, depth: currentDepth, escaped: false };
        }

        index += 1;
    }

    return { index: -1, depth: currentDepth, escaped: false };
};

/**
 * Scans a C# interpolated string, keeping `{}` holes opaque.
 *
 * `{{` and `}}` in the literal part are escapes and never change the depth.
 * A quote only closes the literal when no hole is open, so nested quotes
 * inside holes cannot end the string early and leak string content.
 */
const findCSharpInterpolatedClose = (line: string, from: number, delimiter: StringDelimiter, depth: number, escapedFirst: boolean): InterpolatedSearch => {
    const close = delimiter.close;
    let index = from;
    let currentDepth = depth;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (delimiter.escape === 'backslash' && line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, depth: currentDepth, escaped: true };
            index += 2;
            continue;
        }

        if (delimiter.escape === 'doubled' && currentDepth === 0 && line.startsWith(close, index)) {
            if (line.startsWith(close, index + close.length)) {
                index += close.length * 2;
                continue;
            }
        }

        if (currentDepth === 0 && line[index] === '{' && line[index + 1] === '{') {
            index += 2;
            continue;
        }

        if (currentDepth === 0 && line[index] === '}' && line[index + 1] === '}') {
            index += 2;
            continue;
        }

        if (line[index] === '{') {
            currentDepth += 1;
            index += 1;
            continue;
        }

        if (line[index] === '}' && currentDepth > 0) {
            currentDepth -= 1;
            index += 1;
            continue;
        }

        if (currentDepth === 0 && line.startsWith(close, index)) {
            return { index, depth: currentDepth, escaped: false };
        }

        index += 1;
    }

    return { index: -1, depth: currentDepth, escaped: false };
};

/** Whether `delimiter` is a Python f-string with `{}` holes. */
const isPythonFString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => {
    if (profile.id !== 'python') return false;
    const open = delimiter.open.toLowerCase();

    return open.startsWith('f"') || open.startsWith("f'") || open.startsWith('fr"') || open.startsWith("fr'") || open.startsWith('rf"') || open.startsWith("rf'");
};

/** Whether `delimiter` carries `{}` holes that must stay opaque (C# or Python). */
const isBraceInterpolated = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => isCSharpInterpolated(delimiter) || isPythonFString(delimiter, profile);

/** Whether `delimiter` is a Groovy/Kotlin/Dart/PowerShell/Terraform quoted string with `${}` holes. */
const isDollarBraceString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean =>
    (profile.id === 'groovy' || profile.id === 'kotlin' || profile.id === 'dart' || profile.id === 'powershell' || profile.id === 'terraform') && (delimiter.open === '"' || delimiter.open === "'" || delimiter.open === '$/');

/**
 * Scans a quoted string with `${}` holes, keeping the holes opaque.
 *
 * Plain content without `${` behaves exactly like {@link findClosing}; holes
 * may nest quotes, which never close the outer literal while a hole is open.
 */
const findDollarBraceClose = (line: string, from: number, delimiter: StringDelimiter, depth: number, escapedFirst: boolean): InterpolatedSearch => {
    const close = delimiter.close;
    let index = from;
    let currentDepth = depth;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (delimiter.escape === 'backslash' && line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, depth: currentDepth, escaped: true };
            index += 2;
            continue;
        }

        if (line[index] === '$' && line[index + 1] === '{') {
            currentDepth += 1;
            index += 2;
            continue;
        }

        if (line[index] === '}' && currentDepth > 0) {
            currentDepth -= 1;
            index += 1;
            continue;
        }

        if (currentDepth === 0 && line.startsWith(close, index)) {
            if (delimiter.escape === 'doubled' && line.startsWith(close, index + close.length)) {
                index += close.length * 2;
                continue;
            }
            return { index, depth: currentDepth, escaped: false };
        }

        index += 1;
    }

    return { index: -1, depth: currentDepth, escaped: false };
};

/** Whether `delimiter` is a Scala interpolated string with `${}` holes. */
const isScalaInterpolated = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => profile.id === 'scala' && /^(s|f|raw)"$/.test(delimiter.open);

/** Whether `delimiter` is a Ruby/Elixir/Crystal double-quoted string with `#{}` holes. */
const isHashBraceString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => (profile.id === 'ruby' || profile.id === 'elixir' || profile.id === 'crystal') && delimiter.open === '"';

/**
 * Scans a quoted string with `#{}` holes, keeping the holes opaque.
 *
 * Plain content without `#{` behaves like {@link findClosing}; holes may
 * nest quotes, which never close the outer literal while a hole is open.
 */
const findHashBraceClose = (line: string, from: number, delimiter: StringDelimiter, depth: number, escapedFirst: boolean): InterpolatedSearch => {
    const close = delimiter.close;
    let index = from;
    let currentDepth = depth;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (delimiter.escape === 'backslash' && line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, depth: currentDepth, escaped: true };
            index += 2;
            continue;
        }

        if (line[index] === '#' && line[index + 1] === '{') {
            currentDepth += 1;
            index += 2;
            continue;
        }

        if (line[index] === '}' && currentDepth > 0) {
            currentDepth -= 1;
            index += 1;
            continue;
        }

        if (currentDepth === 0 && line.startsWith(close, index)) {
            if (delimiter.escape === 'doubled' && line.startsWith(close, index + close.length)) {
                index += close.length * 2;
                continue;
            }
            return { index, depth: currentDepth, escaped: false };
        }

        index += 1;
    }

    return { index: -1, depth: currentDepth, escaped: false };
};

/** Whether `delimiter` is a Swift quoted string with `\()` holes. */
const isSwiftString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => profile.id === 'swift' && delimiter.open === '"';

/**
 * Scans a Swift quoted string with `\()` holes, keeping the holes opaque.
 *
 * A `\(` sequence opens a hole even though a lone backslash escapes the next
 * character, so the hole check runs before the generic backslash escape. A
 * quote never closes the literal while a hole is open.
 */
const findSwiftClose = (line: string, from: number, delimiter: StringDelimiter, depth: number, escapedFirst: boolean): InterpolatedSearch => {
    const close = delimiter.close;
    let index = from;
    let currentDepth = depth;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (line[index] === '\\' && line[index + 1] === '(') {
            currentDepth += 1;
            index += 2;
            continue;
        }

        if (delimiter.escape === 'backslash' && line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, depth: currentDepth, escaped: true };
            index += 2;
            continue;
        }

        if (line[index] === ')' && currentDepth > 0) {
            currentDepth -= 1;
            index += 1;
            continue;
        }

        if (currentDepth === 0 && line.startsWith(close, index)) {
            return { index, depth: currentDepth, escaped: false };
        }

        index += 1;
    }

    return { index: -1, depth: currentDepth, escaped: false };
};

/** Whether `delimiter` is a Julia quoted string with `$()` holes. */
const isDollarParenString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => profile.id === 'julia' && delimiter.open === '"';

/**
 * Scans a quoted string with `$()` holes, keeping the holes opaque.
 *
 * Plain content without `$(` behaves like {@link findClosing}; holes may
 * nest quotes, which never close the outer literal while a hole is open.
 */
const findDollarParenClose = (line: string, from: number, delimiter: StringDelimiter, depth: number, escapedFirst: boolean): InterpolatedSearch => {
    const close = delimiter.close;
    let index = from;
    let currentDepth = depth;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (delimiter.escape === 'backslash' && line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, depth: currentDepth, escaped: true };
            index += 2;
            continue;
        }

        if (line[index] === '$' && line[index + 1] === '(') {
            currentDepth += 1;
            index += 2;
            continue;
        }

        if (line[index] === ')' && currentDepth > 0) {
            currentDepth -= 1;
            index += 1;
            continue;
        }

        if (currentDepth === 0 && line.startsWith(close, index)) {
            return { index, depth: currentDepth, escaped: false };
        }

        index += 1;
    }

    return { index: -1, depth: currentDepth, escaped: false };
};

/** Whether `delimiter` is a PHP double-quoted string with `{}` holes. */
const isPhpString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => profile.id === 'php' && delimiter.open === '"';

/** Whether `delimiter` is a Nim `fmt` interpolated string with `{}` holes. */
const isNimFmtString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => profile.id === 'nim' && /^fmt"$/.test(delimiter.open);

/** Nim `fmt` interpolated string delimiter that opens at `index`, or `null`. */
const matchNimFmtString = (line: string, index: number): StringDelimiter | null => {
    if (index > 0 && isScannerWordChar(line[index - 1])) return null;
    if (!line.startsWith('fmt"', index) || line.startsWith('fmt"""', index)) return null;

    return { open: 'fmt"', close: '"', escape: 'backslash', multiline: false };
};

/** Perl quote-like operator delimiter that opens at `index`, or `null`. */
const matchPerlQuote = (line: string, index: number): StringDelimiter | null => {
    if (index > 0 && isScannerWordChar(line[index - 1])) return null;

    const match = /^(qq|qx|qw|qr|q|m|s|tr|y)([^A-Za-z0-9_\s])/.exec(line.slice(index));
    if (match === null) return null;

    const open = line.slice(index, index + match[1].length + 1);
    const opener = match[2];
    const mirror: Readonly<Record<string, string>> = { '{': '}', '(': ')', '[': ']', '<': '>' };
    const close = mirror[opener] ?? opener;

    return { open, close, escape: 'backslash', multiline: true };
};

/** Whether `delimiter` is an Elixir sigil string. */
const isElixirSigil = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => profile.id === 'elixir' && delimiter.open.startsWith('~');

/** Elixir sigil delimiter that opens at `index`, or `null`. */
const matchElixirSigil = (line: string, index: number): StringDelimiter | null => {
    if (index > 0 && isScannerWordChar(line[index - 1])) return null;

    const match = /^~([A-Za-z])([^A-Za-z0-9_\s])/.exec(line.slice(index));
    if (match === null) return null;

    const open = line.slice(index, index + 3);
    const mirror: Readonly<Record<string, string>> = { '{': '}', '(': ')', '[': ']', '<': '>' };
    const close = mirror[match[2]] ?? match[2];

    return { open, close, escape: 'backslash', multiline: true };
};

/** Whether `delimiter` is a Ruby/Crystal percent literal. */
const isPercentString = (delimiter: StringDelimiter, profile: LanguageProfile): boolean => (profile.id === 'ruby' || profile.id === 'crystal') && /^%[qQiIwWsxr]?[{(<[]$/.test(delimiter.open);

/** Ruby/Crystal percent literal delimiter that opens at `index`, or `null`. */
const matchPercentString = (line: string, index: number, profile: LanguageProfile): StringDelimiter | null => {
    if (profile.id !== 'ruby' && profile.id !== 'crystal') return null;
    if (index > 0 && isScannerWordChar(line[index - 1])) return null;

    const match = /^%([qQiIwWsxr])?([{(<[])/.exec(line.slice(index));
    if (match === null) return null;

    const open = line.slice(index, index + (match[1]?.length ?? 0) + 2);
    const mirror: Readonly<Record<string, string>> = { '{': '}', '(': ')', '[': ']', '<': '>' };

    return { open, close: mirror[match[2]] ?? match[2], escape: 'backslash', multiline: true };
};

/** Whether `character` is a word character (letter, digit, or underscore). */
const isScannerWordChar = (character: string): boolean => (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character === '_';

/** Whether `profile` supports `<<WORD` heredocs whose body stays opaque. */
const isHeredocProfile = (profile: LanguageProfile): boolean => profile.id === 'shell' || profile.id === 'ruby' || profile.id === 'perl' || profile.id === 'php';

/** Heredoc terminator that opens at `index`, or `null`. */
const matchHeredocOpener = (line: string, index: number): string | null => {
    const match = /^<<<-?\s*['"`]?([A-Za-z_]\w*)['"`]?|^<<[-~]?\s*['"`]?([A-Za-z_]\w*)['"`]?/.exec(line.slice(index));
    if (match === null) return null;

    return match[1] ?? match[2] ?? null;
};

/** Whether `line` terminates the heredoc closed by `terminator`. */
const isHeredocTerminator = (line: string, terminator: string): boolean => {
    const trimmed = line.trim();

    return trimmed === terminator || trimmed === `${terminator};`;
};

/** Whether `profile` nests its `open`/`close` block comment pair. */
const isNestingBlockComment = (profile: LanguageProfile, open: string, close: string): boolean =>
    (profile.id === 'haskell' && open === '{-' && close === '-}') || (profile.id === 'julia' && open === '#=' && close === '=#') || ((profile.id === 'swift' || profile.id === 'rust') && open === '/*' && close === '*/');

/** Block comment that is currently open, tracking nesting depth. */
interface OpenBlock {
    readonly open: string;
    readonly close: string;
    readonly nesting: boolean;
    depth: number;
}

/** Python f-string delimiter that opens at `index`, or `null`. */
const matchPythonFString = (line: string, index: number): StringDelimiter | null => {
    if (index > 0 && isScannerWordChar(line[index - 1])) return null;

    const match = /^([rRbBuUfF]*)("""|'''|"|')/.exec(line.slice(index));
    if (match === null) return null;

    const prefix = match[1];
    const quote = match[2];
    if (!/[fF]/.test(prefix)) return null;

    const open = line.slice(index, index + prefix.length + quote.length);
    const escapeMode = /[rR]/.test(prefix) ? 'none' : 'backslash';

    return { open, close: quote, escape: escapeMode, multiline: quote.length === 3 };
};

/** Scala interpolated string delimiter that opens at `index`, or `null`. */
const matchScalaInterpolated = (line: string, index: number): StringDelimiter | null => {
    if (index > 0 && isScannerWordChar(line[index - 1])) return null;

    const match = /^(s|f|raw)(")/.exec(line.slice(index));
    if (match === null) return null;
    if (line.slice(index + match[1].length, index + match[1].length + 3) === '"""') return null;

    const open = line.slice(index, index + match[1].length + 1);

    return { open, close: '"', escape: match[1] === 'raw' ? 'none' : 'backslash', multiline: false };
};

/** Longest string delimiter that opens at `index`, or `null`. */
const matchString = (line: string, index: number, profile: LanguageProfile): StringDelimiter | null => {
    if (profile.id === 'python') {
        const fString = matchPythonFString(line, index);
        if (fString !== null) return fString;
    }

    if (profile.id === 'scala') {
        const interpolated = matchScalaInterpolated(line, index);
        if (interpolated !== null) return interpolated;
    }

    if (profile.id === 'nim') {
        const interpolated = matchNimFmtString(line, index);
        if (interpolated !== null) return interpolated;
    }

    if (profile.id === 'perl') {
        const quote = matchPerlQuote(line, index);
        if (quote !== null) return quote;
    }

    if (profile.id === 'elixir') {
        const sigil = matchElixirSigil(line, index);
        if (sigil !== null) return sigil;
    }

    if (profile.id === 'ruby' || profile.id === 'crystal') {
        const percent = matchPercentString(line, index, profile);
        if (percent !== null) return percent;
    }

    let best: StringDelimiter | null = null;

    for (const delimiter of profile.strings) {
        if (delimiter.open.length === 0 || !line.startsWith(delimiter.open, index)) continue;
        if (best === null || delimiter.open.length > best.open.length) best = delimiter;
    }

    if (best === null) return null;
    if (profile.id === 'rust' && best.open === "'" && !isRustCharLiteral(line, index)) return null;

    return best;
};

/**
 * Searches the closing delimiter of a string literal.
 *
 * `escapedFirst` marks a first character that is escaped by a backslash at
 * the end of the previous line.
 */
const findClosing = (line: string, from: number, delimiter: StringDelimiter, escapedFirst: boolean): ClosingSearch => {
    const close = delimiter.close;
    let index = from;
    let escaped = escapedFirst;

    while (index < line.length) {
        if (escaped) {
            escaped = false;
            index += 1;
            continue;
        }

        if (delimiter.escape === 'backslash' && line[index] === '\\') {
            if (index + 1 >= line.length) return { index: -1, escaped: true };
            index += 2;
            continue;
        }

        if (!line.startsWith(close, index)) {
            index += 1;
            continue;
        }

        if (delimiter.escape === 'doubled' && line.startsWith(close, index + close.length)) {
            index += close.length * 2;
            continue;
        }

        return { index, escaped: false };
    }

    return { index: -1, escaped: false };
};

/**
 * Scans `code` with the lexical rules of `profile`.
 *
 * @param code - The source text to scan.
 * @returns A function that takes the language profile and returns the scan result.
 */
export const scanSource =
    (code: string) =>
    (profile: LanguageProfile): ScanResult => {
        const lines = code.split('\n');
        const codeRegions: CodeRegion[][] = [];
        const lineComments: (LineComment | undefined)[] = [];

        /** Block comment that is currently open, if any. */
        let openBlock: OpenBlock | null = null;
        /** String literal that is currently open — it may span several lines. */
        let openString: StringDelimiter | null = null;
        /** Brace depth inside an interpolated string (`${}` or `{}` holes). */
        let openDepth = 0;
        /** Heredoc terminator that hides the following lines, or `null`. */
        let openHeredoc: string | null = null;
        /** Whether the first character of the current line is escaped. */
        let escaped = false;

        for (const line of lines) {
            if (openHeredoc !== null) {
                if (isHeredocTerminator(line, openHeredoc)) openHeredoc = null;
                codeRegions.push([]);
                lineComments.push(undefined);
                continue;
            }

            const regions: CodeRegion[] = [];
            let regionStart = -1;
            let comment: LineComment | undefined;
            let index = 0;
            let pendingHeredoc: string | null = null;

            const closeRegion = (end: number): void => {
                if (regionStart < 0) return;
                regions.push({ start: regionStart, end });
                regionStart = -1;
            };

            while (index < line.length) {
                if (openBlock !== null) {
                    if (!openBlock.nesting) {
                        const found = line.indexOf(openBlock.close, index);
                        if (found < 0) {
                            index = line.length;
                            break;
                        }
                        index = found + openBlock.close.length;
                        openBlock = null;
                        continue;
                    }

                    if (line.startsWith(openBlock.open, index)) {
                        openBlock.depth += 1;
                        index += openBlock.open.length;
                        continue;
                    }

                    if (line.startsWith(openBlock.close, index)) {
                        openBlock.depth -= 1;
                        index += openBlock.close.length;
                        if (openBlock.depth === 0) openBlock = null;
                        continue;
                    }

                    index += 1;
                    continue;
                }

                if (openString !== null) {
                    if (isJsTemplate(openString)) {
                        const search = findTemplateClose(line, index, openDepth, escaped);
                        if (search.index < 0) {
                            escaped = search.escaped;
                            openDepth = search.depth;
                            index = line.length;
                            break;
                        }
                        escaped = false;
                        openDepth = 0;
                        index = search.index + openString.close.length;
                        openString = null;
                        continue;
                    }

                    if (isBraceInterpolated(openString, profile) || isNimFmtString(openString, profile) || isPhpString(openString, profile)) {
                        const search = findCSharpInterpolatedClose(line, index, openString, openDepth, escaped);
                        if (search.index < 0) {
                            escaped = search.escaped;
                            openDepth = search.depth;
                            index = line.length;
                            break;
                        }
                        escaped = false;
                        openDepth = 0;
                        index = search.index + openString.close.length;
                        openString = null;
                        continue;
                    }

                    if (isDollarBraceString(openString, profile) || isScalaInterpolated(openString, profile)) {
                        const search = findDollarBraceClose(line, index, openString, openDepth, escaped);
                        if (search.index < 0) {
                            escaped = search.escaped;
                            openDepth = search.depth;
                            index = line.length;
                            break;
                        }
                        escaped = false;
                        openDepth = 0;
                        index = search.index + openString.close.length;
                        openString = null;
                        continue;
                    }

                    if (isHashBraceString(openString, profile) || isPercentString(openString, profile) || isElixirSigil(openString, profile)) {
                        const search = findHashBraceClose(line, index, openString, openDepth, escaped);
                        if (search.index < 0) {
                            escaped = search.escaped;
                            openDepth = search.depth;
                            index = line.length;
                            break;
                        }
                        escaped = false;
                        openDepth = 0;
                        index = search.index + openString.close.length;
                        openString = null;
                        continue;
                    }

                    if (isSwiftString(openString, profile)) {
                        const search = findSwiftClose(line, index, openString, openDepth, escaped);
                        if (search.index < 0) {
                            escaped = search.escaped;
                            openDepth = search.depth;
                            index = line.length;
                            break;
                        }
                        escaped = false;
                        openDepth = 0;
                        index = search.index + openString.close.length;
                        openString = null;
                        continue;
                    }

                    if (isDollarParenString(openString, profile)) {
                        const search = findDollarParenClose(line, index, openString, openDepth, escaped);
                        if (search.index < 0) {
                            escaped = search.escaped;
                            openDepth = search.depth;
                            index = line.length;
                            break;
                        }
                        escaped = false;
                        openDepth = 0;
                        index = search.index + openString.close.length;
                        openString = null;
                        continue;
                    }

                    const search = findClosing(line, index, openString, escaped);
                    if (search.index < 0) {
                        escaped = search.escaped;
                        index = line.length;
                        break;
                    }
                    escaped = false;
                    index = search.index + openString.close.length;
                    openString = null;
                    continue;
                }

                const block = matchBlockComment(line, index, profile.blockComments);
                if (block !== null) {
                    closeRegion(index);
                    index += block[0].length;
                    openBlock = { open: block[0], close: block[1], nesting: isNestingBlockComment(profile, block[0], block[1]), depth: 1 };
                    continue;
                }

                const marker = matchLongest(line, index, profile.lineComments);
                if (marker !== null) {
                    closeRegion(index);
                    comment = { column: index, marker };
                    index = line.length;
                    break;
                }

                const delimiter = matchString(line, index, profile);
                if (delimiter !== null) {
                    closeRegion(index);
                    index += delimiter.open.length;
                    if (delimiter.multiline) {
                        openString = delimiter;
                        openDepth = 0;
                        continue;
                    }
                    if (isBraceInterpolated(delimiter, profile) || isNimFmtString(delimiter, profile) || isPhpString(delimiter, profile)) {
                        const search = findCSharpInterpolatedClose(line, index, delimiter, 0, false);
                        if (search.index < 0) {
                            index = line.length;
                            break;
                        }
                        index = search.index + delimiter.close.length;
                        continue;
                    }
                    if (isDollarBraceString(delimiter, profile) || isScalaInterpolated(delimiter, profile)) {
                        const search = findDollarBraceClose(line, index, delimiter, 0, false);
                        if (search.index < 0) {
                            index = line.length;
                            break;
                        }
                        index = search.index + delimiter.close.length;
                        continue;
                    }
                    if (isDollarParenString(delimiter, profile)) {
                        const search = findDollarParenClose(line, index, delimiter, 0, false);
                        if (search.index < 0) {
                            index = line.length;
                            break;
                        }
                        index = search.index + delimiter.close.length;
                        continue;
                    }
                    if (isSwiftString(delimiter, profile)) {
                        const search = findSwiftClose(line, index, delimiter, 0, false);
                        if (search.index < 0) {
                            index = line.length;
                            break;
                        }
                        index = search.index + delimiter.close.length;
                        continue;
                    }
                    if (isHashBraceString(delimiter, profile) || isPercentString(delimiter, profile) || isElixirSigil(delimiter, profile)) {
                        const search = findHashBraceClose(line, index, delimiter, 0, false);
                        if (search.index < 0) {
                            index = line.length;
                            break;
                        }
                        index = search.index + delimiter.close.length;
                        continue;
                    }
                    const search = findClosing(line, index, delimiter, false);
                    if (search.index < 0) {
                        index = line.length;
                        break;
                    }
                    index = search.index + delimiter.close.length;
                    continue;
                }

                if (regionStart < 0) regionStart = index;
                if (isHeredocProfile(profile) && pendingHeredoc === null) {
                    const terminator = matchHeredocOpener(line, index);
                    if (terminator !== null) pendingHeredoc = terminator;
                }
                index += 1;
            }

            closeRegion(line.length);
            codeRegions.push(regions);
            lineComments.push(comment);
            if (pendingHeredoc !== null && openHeredoc === null) openHeredoc = pendingHeredoc;
        }

        return { codeRegions, lineComments };
    };
