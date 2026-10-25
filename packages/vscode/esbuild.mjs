/**
 * Bundles the extension into a single CommonJS file.
 *
 * The extension host of VS Code loads `dist/extension.js` with `require()`,
 * so the bundle is CommonJS even though the sources are ES modules. The
 * `dist/package.json` marker keeps Node from treating the bundle as an ES
 * module because the extension package itself is `"type": "module"`.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const outfile = 'dist/extension.js';

/** Writes a message to stdout without using `console` (forbidden by the lint rules). */
const report = (message) => {
    process.stdout.write(`${message}\n`);
};

/** Writes a message to stderr without using `console` (forbidden by the lint rules). */
const reportError = (message) => {
    process.stderr.write(`${message}\n`);
};

/**
 * Makes sure that the core library is built.
 *
 * The core is a workspace package that is consumed from its `dist` folder, so
 * the bundle can only be created after the core has been compiled.
 */
const assertCoreIsBuilt = async () => {
    const entry = await import.meta.resolve('@sandlada/symbol-align-ts');

    if (existsSync(fileURLToPath(entry))) {
        return;
    }

    throw new Error('The core library is not built - run "pnpm --filter @sandlada/symbol-align-ts build" first.');
};

try {
    await assertCoreIsBuilt();

    await build({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        outfile,
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        sourcemap: false,
        minify: false,
    });

    await mkdir('dist', { recursive: true });
    await writeFile('dist/package.json', `${JSON.stringify({ type: 'commonjs' }, null, 4)}\n`, 'utf-8');

    report(`Bundled the extension into ${outfile}.`);
} catch (error) {
    reportError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
