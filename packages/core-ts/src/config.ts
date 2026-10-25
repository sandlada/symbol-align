/**
 * Project configuration for `@sandlada/symbol-align-ts`.
 *
 * A repository can drop a `symbol-align.config.json` file next to its sources
 * to control the symbols, the token groups, the language profile and the
 * alignment scope. The file may also carry per file overrides that are
 * selected by a glob pattern.
 *
 * The module is free of Node.js builtins so that it can be bundled for the
 * browser, a worker or any other JavaScript runtime. The helpers that read
 * the configuration from the filesystem live in `config-fs.ts`.
 */

import { isLanguageId } from './language.js';
import type { AlignGroup, AlignmentScope, AlignOptions, AlignSymbol, DeclarationAnchor, LanguageId } from './types.js';

/** A per file pattern override of the configuration. */
export interface ConfigOverride {
    /** Symbols to align — an explicit empty list aligns nothing. */
    readonly symbols?: readonly AlignSymbol[];
    /** Groups of alternative tokens that share one alignment column. */
    readonly groups?: readonly AlignGroup[];
    readonly language?: LanguageId;
    readonly scope?: AlignmentScope;
    /** Whether the declaration columns of the language profile are aligned. */
    readonly declarations?: boolean;
    /** Which edge of a declaration cell is aligned. */
    readonly declarationAnchor?: DeclarationAnchor;
    /** Largest start-column difference that still joins a declaration column. */
    readonly maxDeclarationPad?: number;
}

/** The parsed content of a `symbol-align.config.json` file. */
export interface SymbolAlignConfig {
    /** Symbols to align — an explicit empty list aligns nothing. */
    readonly symbols?: readonly AlignSymbol[];
    /** Groups of alternative tokens that share one alignment column. */
    readonly groups?: readonly AlignGroup[];
    readonly language?: LanguageId;
    readonly scope?: AlignmentScope;
    /** Whether the declaration columns of the language profile are aligned. */
    readonly declarations?: boolean;
    /** Which edge of a declaration cell is aligned. */
    readonly declarationAnchor?: DeclarationAnchor;
    /** Largest start-column difference that still joins a declaration column. */
    readonly maxDeclarationPad?: number;
    /** Overrides keyed by a glob pattern that is matched against the file path. */
    readonly overrides?: Readonly<Record<string, ConfigOverride>>;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/** Whether `value` is a plain object that can hold configuration entries. */
const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `value` is an array of non empty strings. */
const isSymbolList = (value: unknown): value is readonly AlignSymbol[] => Array.isArray(value) && value.every((symbol) => typeof symbol === 'string' && symbol.length > 0);

/** Whether `value` is an array of arrays of non empty strings. */
const isGroupList = (value: unknown): value is readonly AlignGroup[] => Array.isArray(value) && value.every((group) => isSymbolList(group));

/** Whether `value` is a valid alignment scope. */
const isScope = (value: unknown): value is AlignmentScope => value === 'block' || value === 'indent' || value === 'file';

/** Whether `value` is a valid declaration anchor. */
const isDeclarationAnchor = (value: unknown): value is DeclarationAnchor => value === 'start' || value === 'end';

/** Reads the `symbols` entry of a configuration object. */
const readSymbols = (source: Record<string, unknown>): readonly AlignSymbol[] | undefined => {
    const value = source.symbols;

    if (value === undefined) {
        return undefined;
    }

    if (!isSymbolList(value)) {
        throw new Error('Invalid configuration: "symbols" must be an array of strings');
    }

    return value;
};

/** Reads the `groups` entry of a configuration object. */
const readGroups = (source: Record<string, unknown>): readonly AlignGroup[] | undefined => {
    const value = source.groups;

    if (value === undefined) {
        return undefined;
    }

    if (!isGroupList(value)) {
        throw new Error('Invalid configuration: "groups" must be an array of arrays of strings');
    }

    return value;
};

/** Reads the `language` entry of a configuration object. */
const readLanguage = (source: Record<string, unknown>): LanguageId | undefined => {
    const value = source.language;

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || !isLanguageId(value)) {
        throw new Error(`Invalid configuration: unknown language "${String(value)}"`);
    }

    return value;
};

/** Reads the `scope` entry of a configuration object. */
const readScope = (source: Record<string, unknown>): AlignmentScope | undefined => {
    const value = source.scope;

    if (value === undefined) {
        return undefined;
    }

    if (!isScope(value)) {
        throw new Error('Invalid configuration: "scope" must be "block", "indent" or "file"');
    }

    return value;
};

/** Reads the `declarations` entry of a configuration object. */
const readDeclarations = (source: Record<string, unknown>): boolean | undefined => {
    const value = source.declarations;

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'boolean') {
        throw new Error('Invalid configuration: "declarations" must be a boolean');
    }

    return value;
};

/** Reads the `declarationAnchor` entry of a configuration object. */
const readDeclarationAnchor = (source: Record<string, unknown>): DeclarationAnchor | undefined => {
    const value = source.declarationAnchor;

    if (value === undefined) {
        return undefined;
    }

    if (!isDeclarationAnchor(value)) {
        throw new Error('Invalid configuration: "declarationAnchor" must be "start" or "end"');
    }

    return value;
};

/** Reads the `maxDeclarationPad` entry of a configuration object. */
const readMaxDeclarationPad = (source: Record<string, unknown>): number | undefined => {
    const value = source.maxDeclarationPad;

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new Error('Invalid configuration: "maxDeclarationPad" must be a positive integer');
    }

    return value;
};

/** Reads a single override entry of the `overrides` map. */
const readOverride = (pattern: string, value: unknown): ConfigOverride => {
    if (!isPlainObject(value)) {
        throw new Error(`Invalid configuration: invalid override "${pattern}"`);
    }

    try {
        const symbols = readSymbols(value);
        const groups = readGroups(value);
        const language = readLanguage(value);
        const scope = readScope(value);
        const declarations = readDeclarations(value);
        const declarationAnchor = readDeclarationAnchor(value);
        const maxDeclarationPad = readMaxDeclarationPad(value);

        return {
            ...(symbols === undefined ? {} : { symbols }),
            ...(groups === undefined ? {} : { groups }),
            ...(language === undefined ? {} : { language }),
            ...(scope === undefined ? {} : { scope }),
            ...(declarations === undefined ? {} : { declarations }),
            ...(declarationAnchor === undefined ? {} : { declarationAnchor }),
            ...(maxDeclarationPad === undefined ? {} : { maxDeclarationPad }),
        };
    } catch (error) {
        const detail = (error as Error).message.replace(/^Invalid configuration: /, '');

        throw new Error(`Invalid configuration: invalid override "${pattern}": ${detail}`);
    }
};

/** Reads the `overrides` entry of a configuration object. */
const readOverrides = (source: Record<string, unknown>): Readonly<Record<string, ConfigOverride>> | undefined => {
    const value = source.overrides;

    if (value === undefined) {
        return undefined;
    }

    if (!isPlainObject(value)) {
        throw new Error('Invalid configuration: "overrides" must be an object');
    }

    return Object.fromEntries(Object.entries(value).map(([pattern, override]) => [pattern, readOverride(pattern, override)]));
};

/* -------------------------------------------------------------------------- */
/* Glob patterns                                                               */
/* -------------------------------------------------------------------------- */

/** The characters that have a special meaning inside a regular expression. */
const REGEX_META_CHARACTERS = /[.*+?^${}()|[\]\\]/;

/** Escapes a single character so that it matches itself inside a regular expression. */
const escapeRegExpCharacter = (character: string): string => character.replace(REGEX_META_CHARACTERS, '\\$&');

/**
 * Converts a glob pattern into an anchored regular expression.
 *
 * - `*` matches a run of characters that contains no `/`
 * - `**` matches a run of characters, `/` included
 * - a globstar that is followed by a slash also matches zero directories, so a
 *   pattern that starts with a globstar matches a file in the root as well as
 *   a file in a sub directory
 * - runs of three or more stars collapse into one globstar, so `***` behaves
 *   like `**` instead of depending on whether the run is even or odd
 * - a backslash in the pattern is a directory separator, so windows style
 *   patterns match the same files as their POSIX counterparts
 * - `?` matches exactly one character that is not `/`
 * - every other character matches itself
 */
const globToRegExp = (pattern: string): RegExp => {
    const collapsed = pattern.replace(/\*{3,}/g, '**').replace(/\\/g, '/');
    let source = '';
    let index = 0;

    while (index < collapsed.length) {
        const character = collapsed.charAt(index);

        if (character === '*') {
            const isGlobStar = collapsed.charAt(index + 1) === '*';

            if (isGlobStar && collapsed.charAt(index + 2) === '/') {
                source += '(?:.*/)?';
                index += 3;
                continue;
            }

            source += isGlobStar ? '.*' : '[^/]*';
            index += isGlobStar ? 2 : 1;
            continue;
        }

        if (character === '?') {
            source += '[^/]';
            index += 1;
            continue;
        }

        source += escapeRegExpCharacter(character);
        index += 1;
    }

    return new RegExp(`^${source}$`);
};

/** Matches the last path segment of a POSIX or Windows style path. */
const FILE_NAME_PATTERN = /[^/\\]+$/;

/** The last path segment of a path. */
const fileNameOf = (filePath: string): string => FILE_NAME_PATTERN.exec(filePath)?.[0] ?? '';

/** The path with every Windows separator replaced by a POSIX separator. */
const normalizePath = (filePath: string): string => filePath.replace(/\\/g, '/');

/**
 * Whether a glob pattern matches a file path.
 *
 * The pattern is tested against the file name and against the full path — it
 * matches when it matches either of them.
 */
const matchesPattern =
    (pattern: string) =>
    (filePath: string): boolean => {
        const expression = globToRegExp(pattern);
        return expression.test(fileNameOf(filePath)) || expression.test(normalizePath(filePath));
    };

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

/** The overrides whose pattern matches the file path, in the order of the configuration. */
const matchingOverrides =
    (config: SymbolAlignConfig) =>
    (filePath: string): readonly ConfigOverride[] =>
        Object.entries(config.overrides ?? {})
            .filter(([pattern]) => matchesPattern(pattern)(filePath))
            .map(([, override]) => override);

/** The value of a key in the last override that defines it. */
const lastDefined =
    <T>(read: (override: ConfigOverride) => T | undefined) =>
    (overrides: readonly ConfigOverride[]): T | undefined =>
        overrides.reduce<T | undefined>((current, override) => read(override) ?? current, undefined);

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Parses and validates the raw content of a configuration file.
 *
 * Unknown keys are ignored so that a newer configuration file still works
 * with an older version of the tool.
 */
export const parseConfig = (raw: unknown): SymbolAlignConfig => {
    if (!isPlainObject(raw)) {
        throw new Error('Invalid configuration: expected an object');
    }

    const symbols = readSymbols(raw);
    const groups = readGroups(raw);
    const language = readLanguage(raw);
    const scope = readScope(raw);
    const declarations = readDeclarations(raw);
    const declarationAnchor = readDeclarationAnchor(raw);
    const maxDeclarationPad = readMaxDeclarationPad(raw);
    const overrides = readOverrides(raw);

    return {
        ...(symbols === undefined ? {} : { symbols }),
        ...(groups === undefined ? {} : { groups }),
        ...(language === undefined ? {} : { language }),
        ...(scope === undefined ? {} : { scope }),
        ...(declarations === undefined ? {} : { declarations }),
        ...(declarationAnchor === undefined ? {} : { declarationAnchor }),
        ...(maxDeclarationPad === undefined ? {} : { maxDeclarationPad }),
        ...(overrides === undefined ? {} : { overrides }),
    };
};

/**
 * Resolves the effective alignment options for a file path.
 *
 * The top level options are the base. Every override whose pattern matches
 * the file name or the full path is applied afterwards, in the order the
 * patterns appear in the configuration — a later override wins for each key
 * it defines, so overrides merge per key rather than replacing each other.
 */
export const resolveConfig =
    (config: SymbolAlignConfig) =>
    (filePath?: string): AlignOptions => {
        const base: AlignOptions = {
            ...(config.symbols === undefined ? {} : { symbols: config.symbols }),
            ...(config.groups === undefined ? {} : { groups: config.groups }),
            ...(config.language === undefined ? {} : { language: config.language }),
            ...(config.scope === undefined ? {} : { scope: config.scope }),
            ...(config.declarations === undefined ? {} : { declarations: config.declarations }),
            ...(config.declarationAnchor === undefined ? {} : { declarationAnchor: config.declarationAnchor }),
            ...(config.maxDeclarationPad === undefined ? {} : { maxDeclarationPad: config.maxDeclarationPad }),
        };

        if (filePath === undefined) {
            return base;
        }

        const overrides = matchingOverrides(config)(filePath);
        const symbols = lastDefined((override) => override.symbols)(overrides) ?? base.symbols;
        const groups = lastDefined((override) => override.groups)(overrides) ?? base.groups;
        const language = lastDefined((override) => override.language)(overrides) ?? base.language;
        const scope = lastDefined((override) => override.scope)(overrides) ?? base.scope;
        const declarations = lastDefined((override) => override.declarations)(overrides) ?? base.declarations;
        const declarationAnchor = lastDefined((override) => override.declarationAnchor)(overrides) ?? base.declarationAnchor;
        const maxDeclarationPad = lastDefined((override) => override.maxDeclarationPad)(overrides) ?? base.maxDeclarationPad;

        return {
            ...(symbols === undefined ? {} : { symbols }),
            ...(groups === undefined ? {} : { groups }),
            ...(language === undefined ? {} : { language }),
            ...(scope === undefined ? {} : { scope }),
            ...(declarations === undefined ? {} : { declarations }),
            ...(declarationAnchor === undefined ? {} : { declarationAnchor }),
            ...(maxDeclarationPad === undefined ? {} : { maxDeclarationPad }),
        };
    };
