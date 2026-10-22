/**
 * Keeps the documentation files of every workspace package in sync with the
 * repository root.
 *
 * The packages link `README.md`, `LICENSE`, `SECURITY.md` and
 * `CODE_OF_CONDUCT.md` back to the root copies so that a document is edited
 * in exactly one place. `npm-packlist` skips symlinked files though, which
 * would strip the README from the published tarball.
 *
 * - `materialize` replaces the symlinks with real copies (run before packing)
 * - `restore` turns the copies back into symlinks (run after packing)
 */
import { copyFileSync, existsSync, lstatSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

/** Documentation files that live in the repository root and are linked into each package. */
const DOCS = ['README.md', 'LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md'];

function listPackages() {
    if (!existsSync(packagesDir)) {
        return [];
    }

    return readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(packagesDir, entry.name))
        .filter((dir) => existsSync(join(dir, 'package.json')));
}

function isSymbolicLink(path) {
    try {
        return lstatSync(path).isSymbolicLink();
    } catch {
        return false;
    }
}

function materialize(pkgDir, doc) {
    const linkPath = join(pkgDir, doc);
    const sourcePath = join(root, doc);

    if (!existsSync(sourcePath) || !isSymbolicLink(linkPath)) {
        return;
    }

    rmSync(linkPath);
    copyFileSync(sourcePath, linkPath);
    console.log(`materialized ${doc} in ${pkgDir}`);
}

function restore(pkgDir, doc) {
    const linkPath = join(pkgDir, doc);
    const sourcePath = join(root, doc);

    if (!existsSync(sourcePath) || isSymbolicLink(linkPath)) {
        return;
    }

    rmSync(linkPath);
    symlinkSync(join('..', '..', doc), linkPath, 'file');
    console.log(`restored symlink ${doc} in ${pkgDir}`);
}

const mode = process.argv[2];

if (mode !== 'materialize' && mode !== 'restore') {
    console.error('Usage: node scripts/sync-docs.mjs <materialize|restore>');
    process.exit(1);
}

for (const pkgDir of listPackages()) {
    for (const doc of DOCS) {
        if (mode === 'materialize') {
            materialize(pkgDir, doc);
        } else {
            restore(pkgDir, doc);
        }
    }
}
