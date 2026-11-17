import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * The extension consumes the core source directly.
 *
 * The core is a workspace package that is published from its `dist` folder, so
 * the tests would otherwise run against a build that can be older than the
 * source. The alias keeps the tests honest and lets them run without a build
 * step. The entry point of the filesystem helpers is aliased as well, because
 * the plain alias would rewrite it as well.
 */
const coreEntry = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
const coreNodeEntry = fileURLToPath(new URL('../core/src/config-fs.ts', import.meta.url));
const vscodeEntry = fileURLToPath(new URL('./src/testing/vscode.ts', import.meta.url));

export default defineConfig({
    resolve: {
        alias: [
            { find: '@sandlada/symbol-align/node', replacement: coreNodeEntry },
            { find: '@sandlada/symbol-align', replacement: coreEntry },
            { find: 'vscode', replacement: vscodeEntry },
        ],
    },
    test: {
        include: ['src/**/*.test.ts'],
    },
});
