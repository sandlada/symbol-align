import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findConfigFile, loadConfig, loadConfigFile } from './config-fs.js';

/** The name of the configuration file that is looked up in every directory. */
const CONFIG_FILE_NAME = 'symbol-align.config.json';

/** Creates a temporary directory that is removed once the callback finished. */
const withTempDir = async (run: (directory: string) => Promise<void>): Promise<void> => {
    const directory = await mkdtemp(join(tmpdir(), 'symbol-align-config-'));

    try {
        await run(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
};

describe('findConfigFile', () => {
    it('finds a configuration file in the given directory', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, CONFIG_FILE_NAME);
            await writeFile(path, '{}', 'utf-8');

            expect(findConfigFile(directory)).toBe(path);
        });
    });

    it('finds a configuration file in a parent directory', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, CONFIG_FILE_NAME);
            await writeFile(path, '{}', 'utf-8');
            const child = join(directory, 'child');
            await mkdir(child);

            expect(findConfigFile(child)).toBe(path);
        });
    });

    it('returns undefined when there is no configuration file', async () => {
        await withTempDir(async (directory) => {
            expect(findConfigFile(directory)).toBeUndefined();
        });
    });
});

describe('loadConfig', () => {
    it('reads and parses the nearest configuration file', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, CONFIG_FILE_NAME);
            await writeFile(path, JSON.stringify({ symbols: ['='], language: 'python', scope: 'file' }), 'utf-8');

            expect(loadConfig(directory)).toEqual({ symbols: ['='], language: 'python', scope: 'file' });
        });
    });

    it('reads the nearest configuration file of a parent directory', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, CONFIG_FILE_NAME);
            await writeFile(path, JSON.stringify({ language: 'python' }), 'utf-8');
            const child = join(directory, 'child');
            await mkdir(child);

            expect(loadConfig(child)).toEqual({ language: 'python' });
        });
    });

    it('returns undefined when there is no configuration file', async () => {
        await withTempDir(async (directory) => {
            expect(loadConfig(directory)).toBeUndefined();
        });
    });

    it('reports the path of a file that is not valid JSON', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, CONFIG_FILE_NAME);
            await writeFile(path, '{invalid', 'utf-8');

            expect(() => loadConfig(directory)).toThrow(`Failed to read configuration at ${path}`);
        });
    });

    it('reports the reason of a file that is not valid JSON', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, CONFIG_FILE_NAME);
            await writeFile(path, '{invalid', 'utf-8');

            expect(() => loadConfig(directory)).toThrow(/Failed to read configuration at .+: .+/);
        });
    });

    it('reports the path of a file that does not satisfy the schema', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, CONFIG_FILE_NAME);
            await writeFile(path, JSON.stringify({ language: 'cobol' }), 'utf-8');

            expect(() => loadConfig(directory)).toThrow(`Failed to read configuration at ${path}`);
        });
    });
});

describe('loadConfigFile', () => {
    it('reads and parses the file at the given path', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, 'custom.json');
            await writeFile(path, JSON.stringify({ symbols: [':'], scope: 'file' }), 'utf-8');

            expect(loadConfigFile(path)).toEqual({ symbols: [':'], scope: 'file' });
        });
    });

    it('reports the path of a file that cannot be read', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, 'missing.json');

            expect(() => loadConfigFile(path)).toThrow(`Failed to read configuration at ${path}`);
        });
    });

    it('reports the reason of a file that cannot be read', async () => {
        await withTempDir(async (directory) => {
            const path = join(directory, 'missing.json');

            expect(() => loadConfigFile(path)).toThrow(/Failed to read configuration at .+: .+/);
        });
    });
});
