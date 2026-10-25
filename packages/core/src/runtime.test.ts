/**
 * Guards the runtime independence of the public entry point.
 *
 * The modules that `index.ts` re-exports must not import a Node.js builtin —
 * otherwise the package cannot be bundled for the browser, a worker or any
 * other JavaScript runtime. The platform adapters — the CLI and the filesystem
 * helpers of the configuration — are the only modules that may use `node:`
 * builtins, and they are not reachable from the main entry point.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The directory that holds the modules of the package. */
const sourceDirectory = dirname(fileURLToPath(import.meta.url));

/** The entry point of the package. */
const ENTRY_POINT = 'index.ts';

/** The modules that the entry point re-exports. */
const PUBLIC_MODULES = ['aligner.ts', 'language.ts', 'finder.ts', 'scanner.ts', 'config.ts', 'types.ts'] as const;

/** The modules that are allowed to use Node.js builtins. */
const PLATFORM_ADAPTERS: readonly string[] = ['cli.ts', 'config-fs.ts'];

/** Reads the source of a module of the package. */
const readSource = (name: string): string => readFileSync(join(sourceDirectory, name), 'utf-8');

/** The module specifiers that a source imports or re-exports. */
const importedModules = (source: string): readonly string[] =>
    Array.from(source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g))
        .map((match) => match[1])
        .filter((specifier) => specifier !== undefined);

/** The module specifiers that a source re-exports. */
const exportedModules = (source: string): readonly string[] =>
    Array.from(source.matchAll(/export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s*from\s*['"]([^'"]+)['"]/g))
        .map((match) => match[1])
        .filter((specifier) => specifier !== undefined);

/** The file name of the module a relative specifier points at. */
const moduleFileOf = (specifier: string): string | undefined => {
    if (!specifier.startsWith('./')) {
        return undefined;
    }

    const name = specifier.slice(2).replace(/\.js$/, '.ts');

    return name.endsWith('.ts') ? name : undefined;
};

/** Every module that is reachable from the given module. */
const reachableModules = (entry: string): readonly string[] => {
    const visited = new Set<string>([entry]);
    let frontier = [entry];

    while (frontier.length > 0) {
        const next: string[] = [];

        frontier.forEach((name) => {
            importedModules(readSource(name))
                .map(moduleFileOf)
                .filter((file): file is string => file !== undefined)
                .forEach((file) => {
                    if (!visited.has(file)) {
                        visited.add(file);
                        next.push(file);
                    }
                });
        });

        frontier = next;
    }

    return [...visited];
};

/** The modules that import a Node.js builtin — statically, dynamically, bare or through `require`. */
const modulesWithNodeImports = (names: readonly string[]): readonly string[] => names.filter((name) => /(?:from\s*|import(?:\s*\(|\s+)|require\s*\()\s*['"]node:/.test(readSource(name)));

describe('the modules of the public entry point', () => {
    it('do not import a Node.js builtin', () => {
        expect(modulesWithNodeImports([ENTRY_POINT, ...PUBLIC_MODULES])).toEqual([]);
    });

    it('do not reach a Node.js builtin through the module graph', () => {
        expect(modulesWithNodeImports(reachableModules(ENTRY_POINT))).toEqual([]);
    });

    it('do not reach the platform adapters through the module graph', () => {
        expect(reachableModules(ENTRY_POINT).filter((name) => PLATFORM_ADAPTERS.includes(name))).toEqual([]);
    });
});

describe('the public entry point', () => {
    it('does not re-export the command line interface', () => {
        expect(exportedModules(readSource(ENTRY_POINT))).not.toContain('./cli.js');
    });

    it('does not re-export the executable entry point', () => {
        expect(exportedModules(readSource(ENTRY_POINT))).not.toContain('./bin.js');
    });

    it('does not re-export the filesystem helpers of the configuration', () => {
        expect(exportedModules(readSource(ENTRY_POINT))).not.toContain('./config-fs.js');
    });
});

describe('the platform adapters', () => {
    it('import a Node.js builtin in the command line interface', () => {
        expect(modulesWithNodeImports(['cli.ts'])).toEqual(['cli.ts']);
    });

    it('import a Node.js builtin in the filesystem helpers of the configuration', () => {
        expect(modulesWithNodeImports(['config-fs.ts'])).toEqual(['config-fs.ts']);
    });
});
