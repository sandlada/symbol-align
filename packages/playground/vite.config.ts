import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * The playground consumes the core source directly.
 *
 * That keeps the site a real-time test bench: a change in `packages/core/src`
 * is picked up by the dev server with HMR and is bundled into the production
 * build without an intermediate `tsc` run.
 */
const coreEntry = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@sandlada/symbol-align': coreEntry,
        },
    },
    build: {
        target: 'es2022',
        sourcemap: false,
    },
    server: {
        port: 5173,
    },
    preview: {
        port: 4173,
    },
});
