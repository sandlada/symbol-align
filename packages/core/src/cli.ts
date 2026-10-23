/**
 * Command line interface of `@sandlada/symbol-align`.
 *
 * The module is free of side effects: importing it never touches the
 * process. Parsing, reading, aligning and writing are exposed as plain
 * functions; the executable entry point (`bin.ts`) owns the process plumbing
 * and turns the returned exit code into `process.exit`.
 */

import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { align } from './aligner.js';
import { resolveConfig, type SymbolAlignConfig } from './config.js';
import { loadConfig, loadConfigFile } from './config-fs.js';
import { detectLanguage, isLanguageId } from './language.js';
import type { AlignmentScope, AlignOptions, LanguageId } from './types.js';

/* -------------------------------------------------------------------------- */
/* Public types                                                                 */
/* -------------------------------------------------------------------------- */

/** The parsed command line arguments. */
export interface CliArgs {
    /** Symbols to align — `undefined` keeps the defaults of the language profile. */
    readonly symbols?: readonly string[];
    /** Language profile that drives string and comment handling. */
    readonly language?: LanguageId;
    /** Path of the piped file — used to detect the language of standard input. */
    readonly stdinFilepath?: string;
    /** Path of the configuration file — `undefined` discovers the nearest one. */
    readonly config?: string;
    /** Grouping strategy used before aligning — `undefined` keeps the default. */
    readonly scope?: AlignmentScope;
    /** Report misalignment instead of writing the aligned code. */
    readonly check: boolean;
    /** Print the usage text. */
    readonly help: boolean;
    /** Print the package version. */
    readonly version: boolean;
    /** Write the aligned code back into the file it was read from. */
    readonly write: boolean;
    /** Print a unified diff of the input and the aligned result. */
    readonly diff: boolean;
    /** The files to read — empty when the standard input is read. */
    readonly files: readonly string[];
    /** File to write instead of standard output. */
    readonly output?: string;
}

/** The I/O channels of the CLI — the process is never touched directly. */
export interface CliStreams {
    /** Writes a chunk to standard output. */
    readonly stdout: (chunk: string) => void;
    /** Writes a chunk to standard error. */
    readonly stderr: (chunk: string) => void;
    /** Reads the whole standard input as text. */
    readonly stdin: () => Promise<string>;
}

/* -------------------------------------------------------------------------- */
/* Usage text                                                                   */
/* -------------------------------------------------------------------------- */

/** The help text printed by `--help`. */
export const usage = `Usage: symbol-align [options] [< file]
       symbol-align [options] --file <path> [--file <path> ...]

Vertically align punctuation symbols in a code snippet.
Reads from stdin or from one or more files and writes to stdout.

Options:
  -f, --file <path>         Read from file instead of stdin (may be repeated)
  -o, --output <path>       Write to file instead of stdout
      --write               Write the aligned code back into the file that was read
      --diff                Print a unified diff of the input and the aligned result
  -s, --symbols <list>      Comma-separated symbols to align
  -l, --language <id>       Language profile to use
  -t, --stdin-filepath <p>  Path of the piped file (used for language detection)
  -c, --config <path>       Configuration file (default: nearest symbol-align.config.json)
      --scope <block|indent|file>  Grouping strategy (default: block)
      --check               Exit 1 when the input is not already aligned
  -v, --version             Print the version
  -h, --help                Show this help

Notes:
  --write requires --file and cannot be combined with --output
  --write only inserts spaces, the line endings of the file are kept
  --output cannot be used with several files
  --diff cannot be combined with --check and never writes a file

Examples:
  echo "a = 1\\nbb = 2" | symbol-align
  cat file.ts | symbol-align --symbols =,:
  symbol-align --file input.ts
  symbol-align -f input.ts -o output.ts
  symbol-align -f input.ts --write
  symbol-align -f input.ts -f other.ts --diff
  symbol-align -f input.ts --language python
  symbol-align -f input.ts --config symbol-align.config.json
`;

/* -------------------------------------------------------------------------- */
/* Argument parsing                                                             */
/* -------------------------------------------------------------------------- */

/** Long names of the options that take a value. */
type ValueOptionName = 'file' | 'output' | 'symbols' | 'language' | 'stdin-filepath' | 'config' | 'scope';

/** A value taking option of the command line. */
interface ValueOption {
    /** The long name of the option — also used in error messages. */
    readonly name: ValueOptionName;
    /** The optional short alias, written without the leading dash. */
    readonly short: string | undefined;
}

/** A value taking option found on the command line. */
interface OptionMatch {
    /** The long name of the matched option. */
    readonly name: ValueOptionName;
    /** The value of the `--name=value` form — `undefined` for the `--name value` form. */
    readonly inline: string | undefined;
}

/** Every value taking option, in the order they are listed in the usage text. */
const valueOptions: readonly ValueOption[] = [
    { name: 'file', short: 'f' },
    { name: 'output', short: 'o' },
    { name: 'symbols', short: 's' },
    { name: 'language', short: 'l' },
    { name: 'stdin-filepath', short: 't' },
    { name: 'config', short: 'c' },
    { name: 'scope', short: undefined },
];

/** Looks a value taking option up by its long name. */
const findLongOption = (name: string): ValueOption | undefined => valueOptions.find((option) => option.name === name);

/** Looks a value taking option up by its short alias. */
const findShortOption = (alias: string): ValueOption | undefined => valueOptions.find((option) => option.short === alias);

/**
 * Matches a token against the value taking options.
 *
 * Both the `--name value` and the `--name=value` form are recognised, the
 * short aliases only support the `--name value` form.
 */
const matchOption = (token: string): OptionMatch | undefined => {
    if (token.startsWith('--')) {
        const separator = token.indexOf('=');
        const name = separator === -1 ? token.slice(2) : token.slice(2, separator);
        const inline = separator === -1 ? undefined : token.slice(separator + 1);
        const option = findLongOption(name);

        return option === undefined ? undefined : { name: option.name, inline };
    }

    if (token.startsWith('-') && token.length === 2) {
        const option = findShortOption(token.slice(1));

        return option === undefined ? undefined : { name: option.name, inline: undefined };
    }

    return undefined;
};

/**
 * Parses a comma separated symbol list.
 *
 * Entries are trimmed and empty entries are dropped. An explicitly empty list
 * means "align nothing" — it matches the core library, where an empty symbol
 * list leaves the input untouched, and the configuration file, where
 * `"symbols": []` is a quiet no-op.
 */
const parseSymbols = (value: string): readonly string[] => {
    const symbols = value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    return symbols;
};

/** Parses a language id — an unknown id is an error. */
const parseLanguage = (value: string): LanguageId => {
    if (!isLanguageId(value)) {
        throw new Error(`Unknown language: ${value}`);
    }

    return value;
};

/** Parses the grouping strategy — an unknown strategy is an error. */
const parseScope = (value: string): AlignmentScope => {
    if (value === 'block' || value === 'indent' || value === 'file') {
        return value;
    }

    throw new Error(`Invalid scope: ${value}. Expected "block", "indent" or "file".`);
};

/** Applies a parsed option value to the arguments collected so far. */
const applyOption =
    (name: ValueOptionName) =>
    (value: string) =>
    (args: CliArgs): CliArgs => {
        switch (name) {
            case 'file':
                return { ...args, files: [...args.files, value] };
            case 'output':
                return { ...args, output: value };
            case 'symbols':
                return { ...args, symbols: parseSymbols(value) };
            case 'language':
                return { ...args, language: parseLanguage(value) };
            case 'stdin-filepath':
                return { ...args, stdinFilepath: value };
            case 'config':
                return { ...args, config: value };
            case 'scope':
                return { ...args, scope: parseScope(value) };
        }
    };

/** The arguments of a command line without any option. */
const defaultArgs: CliArgs = {
    check: false,
    diff: false,
    files: [],
    help: false,
    version: false,
    write: false,
};

/**
 * Parses the tokens of a command line.
 *
 * The tokens are consumed from left to right; a value taking option takes the
 * next token as its value — unless the next token is another long option,
 * which means that the value is missing.
 */
const parseTokens = (tokens: readonly string[], args: CliArgs): CliArgs => {
    const [token, ...rest] = tokens;

    if (token === undefined) {
        return args;
    }

    if (token === '--help' || token === '-h') {
        return parseTokens(rest, { ...args, help: true });
    }

    if (token === '--version' || token === '-v') {
        return parseTokens(rest, { ...args, version: true });
    }

    if (token === '--check') {
        return parseTokens(rest, { ...args, check: true });
    }

    if (token === '--write') {
        return parseTokens(rest, { ...args, write: true });
    }

    if (token === '--diff') {
        return parseTokens(rest, { ...args, diff: true });
    }

    const option = matchOption(token);

    if (option === undefined) {
        throw new Error(`Unknown option: ${token}`);
    }

    if (option.inline !== undefined) {
        return parseTokens(rest, applyOption(option.name)(option.inline)(args));
    }

    const [value, ...afterValue] = rest;

    if (value === undefined || (value.startsWith('--') && value.length > 2)) {
        throw new Error(`Missing value for ${option.name}`);
    }

    return parseTokens(afterValue, applyOption(option.name)(value)(args));
};

/**
 * Parses the command line arguments of the CLI.
 *
 * The first two entries of `argv` — the node executable and the script path —
 * are ignored, everything after them is parsed as an option.
 */
export const parseArgs = (argv: readonly string[]): CliArgs => parseTokens(argv.slice(2), defaultArgs);

/* -------------------------------------------------------------------------- */
/* Diff                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Splits a text into its lines.
 *
 * The empty tail behind a trailing newline is not a line of the text.
 */
const toLines = (text: string): readonly string[] => {
    const lines = text.split('\n');

    return lines.length > 1 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
};

/** The indices of the lines that differ between the two texts. */
const changedLineIndices = (input: readonly string[], result: readonly string[]): readonly number[] => input.map((line, index) => (line === result[index] ? -1 : index)).filter((index) => index >= 0);

/** A hunk of a unified diff — an inclusive range of lines. */
interface DiffHunk {
    /** The zero-based index of the first line of the hunk. */
    readonly start: number;
    /** The zero-based index of the last line of the hunk. */
    readonly end: number;
}

/** Groups the given indices into runs of consecutive indices. */
const groupConsecutive = (indices: readonly number[]): readonly (readonly number[])[] => {
    const groups: number[][] = [];

    indices.forEach((index) => {
        const current = groups[groups.length - 1];

        if (current !== undefined && current[current.length - 1] + 1 === index) {
            current.push(index);
            return;
        }

        groups.push([index]);
    });

    return groups;
};

/**
 * Merges the hunks that overlap or touch each other.
 *
 * Two hunks that share a context line belong to the same hunk — the lines
 * between them are never printed twice.
 */
const mergeHunks = (hunks: readonly DiffHunk[]): readonly DiffHunk[] => {
    const merged: DiffHunk[] = [];

    hunks.forEach((hunk) => {
        const current = merged[merged.length - 1];

        if (current === undefined || hunk.start > current.end + 1) {
            merged.push(hunk);
            return;
        }

        merged[merged.length - 1] = { start: current.start, end: Math.max(current.end, hunk.end) };
    });

    return merged;
};

/** The lines of a hunk — the context lines, the removed and the added lines. */
const hunkLines =
    (input: readonly string[]) =>
    (result: readonly string[]) =>
    (start: number, end: number): readonly string[] =>
        Array.from({ length: end - start + 1 }, (_, offset) => {
            const index = start + offset;
            const before = input[index] ?? '';
            const after = result[index] ?? '';

            return before === after ? [` ${before}`] : [`-${before}`, `+${after}`];
        }).flat();

/**
 * Renders the unified diff between the input and the aligned result.
 *
 * The aligner only inserts spaces, so both texts have the same number of
 * lines and a line keeps its number on both sides of the diff. A hunk covers
 * the changed lines plus one line of context before and after them.
 *
 * Nothing is rendered when the two texts are identical.
 */
export const renderDiff = (input: string, result: string): readonly string[] => {
    const inputLines = toLines(input);
    const resultLines = toLines(result);
    const changed = changedLineIndices(inputLines, resultLines);

    if (changed.length === 0) {
        return [];
    }

    const hunks = mergeHunks(
        groupConsecutive(changed).map((group) => ({
            start: Math.max(0, group[0] - 1),
            end: Math.min(inputLines.length - 1, group[group.length - 1] + 1),
        })),
    );

    return [
        '--- input',
        '+++ aligned',
        ...hunks.flatMap((hunk) => {
            const count = hunk.end - hunk.start + 1;
            const start = hunk.start + 1;

            return [`@@ -${start},${count} +${start},${count} @@`, ...hunkLines(inputLines)(resultLines)(hunk.start, hunk.end)];
        }),
    ];
};

/* -------------------------------------------------------------------------- */
/* Runtime                                                                      */
/* -------------------------------------------------------------------------- */

/** The version reported when the package manifest cannot be read. */
const fallbackVersion = '0.0.0';

/** Extracts the message of an unknown error value. */
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The path the per file overrides of the configuration are matched against.
 *
 * The file that is read wins over the path of the piped file.
 */
const targetPathOf = (args: CliArgs, filePath: string | undefined): string | undefined => filePath ?? args.stdinFilepath;

/**
 * Loads the project configuration.
 *
 * An explicit `--config` names the file that is read, otherwise the nearest
 * `symbol-align.config.json` is discovered from the working directory.
 */
const loadConfiguration = (args: CliArgs): SymbolAlignConfig | undefined => {
    if (args.config !== undefined) {
        return loadConfigFile(validatePath(args.config));
    }

    return loadConfig(process.cwd());
};

/**
 * Builds the aligner options.
 *
 * The configuration provides the defaults, the command line overrides them.
 * The language is taken from `--language`, then from the configuration and
 * finally from the extension of the piped file.
 */
const buildOptions =
    (args: CliArgs) =>
    (filePath: string | undefined) =>
    (config: SymbolAlignConfig | undefined): AlignOptions => {
        const base = config === undefined ? {} : resolveConfig(config)(targetPathOf(args, filePath));
        const detected = args.stdinFilepath === undefined ? undefined : detectLanguage(args.stdinFilepath);
        const language = args.language ?? base.language ?? detected;

        return {
            ...base,
            ...(language === undefined ? {} : { language }),
            ...(args.symbols === undefined ? {} : { symbols: args.symbols }),
            ...(args.scope === undefined ? {} : { scope: args.scope }),
        };
    };

/** Adds exactly one trailing newline to a non empty text. */
const withTrailingNewline = (code: string): string => (code.length === 0 ? code : `${code.replace(/\n+$/, '')}\n`);

/** A single input of a run — the standard input or one of the files. */
interface CliInput {
    /** The path of the file — `undefined` for the standard input. */
    readonly path: string | undefined;
    /** The content that was read. */
    readonly code: string;
}

/** The outcome of the alignment of a single input. */
interface CliResult extends CliInput {
    /** The aligned content. */
    readonly aligned: string;
    /** The number of lines that were modified. */
    readonly changes: number;
}

/**
 * Rejects the option combinations that cannot be executed.
 *
 * `--write` needs a file to write into, `--output` needs a single input and
 * `--diff` reports what would change instead of checking it.
 */
const validateArgs = (args: CliArgs): void => {
    if (args.diff && args.check) {
        throw new Error('--diff cannot be combined with --check');
    }

    if (args.write && args.output !== undefined) {
        throw new Error('--write cannot be combined with --output');
    }

    if (args.write && args.files.length === 0) {
        throw new Error('--write requires --file');
    }

    if (args.output !== undefined && args.files.length > 1) {
        throw new Error('--output cannot be used with several files');
    }
};

/** Reads the inputs of the run — the standard input or the given files. */
const readInputs =
    (args: CliArgs) =>
    async (streams: CliStreams): Promise<readonly CliInput[]> => {
        if (args.files.length === 0) {
            return [{ path: undefined, code: await streams.stdin() }];
        }

        return Promise.all(args.files.map(async (path) => ({ path, code: await readFile(validatePath(path), 'utf-8') })));
    };

/** Aligns every input of the run. */
const alignInputs =
    (args: CliArgs) =>
    (config: SymbolAlignConfig | undefined) =>
    (inputs: readonly CliInput[]): readonly CliResult[] =>
        inputs.map((input) => {
            const result = align(input.code)(buildOptions(args)(input.path)(config));

            return { ...input, aligned: result.code, changes: result.changes };
        });

/** Writes the aligned content back into the file it was read from. */
const writeInPlace = (result: CliResult): Promise<void> => {
    if (result.path === undefined) {
        throw new Error('--write requires --file');
    }

    return writeFile(validatePath(result.path), result.aligned, 'utf-8');
};

/** The aligned content of every result, separated by a newline. */
const toStandardOutput = (results: readonly CliResult[]): string => results.map((result) => withTrailingNewline(result.aligned)).join('\n');

/** The unified diff of every result. */
const toDiff = (results: readonly CliResult[]): string => {
    const diffs = results.map((result) => renderDiff(result.code, result.aligned)).filter((diff) => diff.length > 0);

    return diffs.length === 0 ? '' : `${diffs.map((diff) => diff.join('\n')).join('\n')}\n`;
};

/** The message that reports an input that is not aligned. */
const checkMessage = (label: string | undefined, changes: number): string => (label === undefined ? `Input is not aligned: ${changes} line(s) would change.\n` : `${label}: not aligned, ${changes} line(s) would change.\n`);

/**
 * Reports the inputs that are not aligned.
 *
 * The exit code is 1 as soon as one of the inputs would change.
 */
const reportCheck =
    (results: readonly CliResult[]) =>
    (streams: CliStreams): number => {
        const usePath = results.length > 1;
        let failed = false;

        results.forEach((result) => {
            if (result.changes === 0) {
                return;
            }

            failed = true;
            streams.stderr(checkMessage(usePath ? result.path : undefined, result.changes));
        });

        return failed ? 1 : 0;
    };

/** Runs the CLI for the given arguments. */
const execute =
    (args: CliArgs) =>
    async (streams: CliStreams): Promise<number> => {
        if (args.help) {
            streams.stdout(usage);
            return 0;
        }

        if (args.version) {
            streams.stdout(`${readPackageVersion()}\n`);
            return 0;
        }

        validateArgs(args);

        const results = alignInputs(args)(loadConfiguration(args))(await readInputs(args)(streams));

        if (args.diff) {
            streams.stdout(toDiff(results));
            return 0;
        }

        if (args.check) {
            return reportCheck(results)(streams);
        }

        if (args.write) {
            await Promise.all(results.map(writeInPlace));
            return 0;
        }

        if (args.output !== undefined) {
            const [result] = results;

            await writeFile(validatePath(args.output), withTrailingNewline(result?.aligned ?? ''), 'utf-8');

            return 0;
        }

        streams.stdout(toStandardOutput(results));

        return 0;
    };

/**
 * Runs the command line interface.
 *
 * The returned number is the exit code of the process — the function never
 * calls `process.exit` itself.
 */
export const runCli = async (argv: readonly string[], streams: CliStreams): Promise<number> => {
    try {
        return await execute(parseArgs(argv))(streams);
    } catch (error) {
        streams.stderr(`Error: ${errorMessage(error)}\n`);
        return 1;
    }
};

/* -------------------------------------------------------------------------- */
/* Files and version                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a path against the current working directory.
 *
 * Paths that leave the working directory are rejected — the CLI must not
 * read or write outside of the project the user is working in.
 */
export const validatePath = (filePath: string): string => {
    const cwd = process.cwd();
    const resolvedPath = resolve(cwd, filePath);

    if (resolvedPath !== cwd && !resolvedPath.startsWith(cwd + sep)) {
        throw new Error(`Path traversal detected: ${filePath} resolves outside of current working directory`);
    }

    return resolvedPath;
};

/**
 * Reads the version of the package from the manifest next to this module.
 *
 * The manifest is resolved relative to the module, which works for the
 * sources in `src/` as well as for the build output in `dist/`. An unreadable
 * or malformed manifest falls back to `0.0.0`.
 */
export const readPackageVersion = (): string => {
    try {
        const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
        const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf-8'));

        if (typeof manifest === 'object' && manifest !== null && 'version' in manifest) {
            const version = (manifest as { readonly version?: unknown }).version;

            if (typeof version === 'string' && version.length > 0) {
                return version;
            }
        }

        return fallbackVersion;
    } catch {
        return fallbackVersion;
    }
};
