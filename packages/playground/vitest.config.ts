import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const coreEntry = fileURLToPath(new URL('../core-ts/src/index.ts', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@sandlada/symbol-align-ts': coreEntry,
        },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
