/**
 * Filesystem access for the project configuration of `@sandlada/symbol-align`.
 *
 * This is the platform adapter of the configuration — it is the only module of
 * the core package that touches `node:fs` and `node:path`. The pure parsing
 * and resolution of a configuration live in `config.ts`, so the main entry
 * point of the package stays free of Node.js builtins and can be bundled for
 * the browser, a worker or any other JavaScript runtime.
 *
 * Consumers that need the helpers reach them through the `@sandlada/symbol-align/node`
 * entry point.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseConfig, type SymbolAlignConfig } from './config.js';

/** The name of the configuration file that is looked up in every directory. */
const CONFIG_FILE_NAME = 'symbol-align.config.json';

/**
 * Finds the nearest configuration file.
 *
 * The search starts in `startDir` and walks up to the filesystem root.
 */
export const findConfigFile = (startDir: string): string | undefined => {
    const directory = resolve(startDir);
    const candidate = join(directory, CONFIG_FILE_NAME);

    if (existsSync(candidate)) {
        return candidate;
    }

    const parent = dirname(directory);
    return parent === directory ? undefined : findConfigFile(parent);
};

/**
 * Loads a configuration file.
 *
 * Returns `undefined` when there is no configuration file. A file that cannot
 * be read or parsed raises an error that names the file and the reason.
 */
export const loadConfig = (startDir: string): SymbolAlignConfig | undefined => {
    const path = findConfigFile(startDir);

    if (path === undefined) {
        return undefined;
    }

    return loadConfigFile(path);
};

/**
 * Loads a configuration file from an exact path.
 *
 * A file that cannot be read or parsed raises an error that names the file and
 * the reason.
 */
export const loadConfigFile = (path: string): SymbolAlignConfig => {
    try {
        const content: unknown = JSON.parse(readFileSync(path, 'utf-8'));
        return parseConfig(content);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read configuration at ${path}: ${reason}`);
    }
};
