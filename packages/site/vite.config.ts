import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * The site consumes the core source directly.
 *
 * That keeps the page a real-time test bench: a change in `packages/core/src`
 * is picked up by the dev server with HMR and is bundled into the production
 * build without an intermediate `tsc` run.
 */
const coreEntry = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
    // The site is served from the domain root, so the canonical URL, the
    // sitemap and the asset URLs all share one absolute base.
    base: '/',
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
