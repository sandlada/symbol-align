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
import { loadConfig, loadConfigFile, resolveConfig, type SymbolAlignConfig } from './config.js';
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
    /** File to read instead of standard input. */
    readonly file?: string;
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
       symbol-align [options] --file <path>

Vertically align punctuation symbols in a code snippet.
Reads from stdin or a file and writes to stdout.

Options:
  -f, --file <path>         Read from file instead of stdin
  -o, --output <path>       Write to file instead of stdout
  -s, --symbols <list>      Comma-separated symbols to align
  -l, --language <id>       Language profile to use
  -t, --stdin-filepath <p>  Path of the piped file (used for language detection)
  -c, --config <path>       Configuration file (default: nearest symbol-align.config.json)
      --scope <block|indent|file>  Grouping strategy (default: block)
      --check               Exit 1 when the input is not already aligned
  -v, --version             Print the version
  -h, --help                Show this help

Examples:
  echo "a = 1\\nbb = 2" | symbol-align
  cat file.ts | symbol-align --symbols =,:
  symbol-align --file input.ts
  symbol-align -f input.ts -o output.ts
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
 * Entries are trimmed and empty entries are dropped. An empty list keeps the
 * default of the language profile.
 */
const parseSymbols = (value: string): readonly string[] | undefined => {
    const symbols = value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    return symbols.length > 0 ? symbols : undefined;
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
                return { ...args, file: value };
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
    help: false,
    version: false,
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
const targetPathOf = (args: CliArgs): string | undefined => args.file ?? args.stdinFilepath;

/**
 * Loads the project configuration.
 *
 * An explicit `--config` names the file that is read, otherwise the nearest
 * `symbol-align.config.json` is discovered from the working directory.
 */
const loadConfiguration = (args: CliArgs): SymbolAlignConfig | undefined => {
    if (args.config !== undefined) {
        return loadConfigFile(resolve(process.cwd(), args.config));
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
    (config: SymbolAlignConfig | undefined): AlignOptions => {
        const base = config === undefined ? {} : resolveConfig(config)(targetPathOf(args));
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

        const code = args.file === undefined ? await streams.stdin() : await readFile(validatePath(args.file), 'utf-8');
        const result = align(code)(buildOptions(args)(loadConfiguration(args)));

        if (args.check) {
            if (result.changes > 0) {
                streams.stderr(`Input is not aligned: ${result.changes} line(s) would change.\n`);
                return 1;
            }

            return 0;
        }

        const output = withTrailingNewline(result.code);

        if (args.output === undefined) {
            streams.stdout(output);
            return 0;
        }

        await writeFile(validatePath(args.output), output, 'utf-8');

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
