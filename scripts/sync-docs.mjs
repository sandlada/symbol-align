/**
 * Keeps the documentation files of the published package in sync with the
 * repository root.
 *
 * Only `packages/core` is published. The reference implementation, the VS Code
 * extension and the playground are workspace-only packages, so a pack must
 * never touch their documentation files.
 *
 * The published package links `README.md`, `CHANGELOG.md`, `LICENSE`,
 * `SECURITY.md` and `CODE_OF_CONDUCT.md` back to the root copies so that a
 * document is edited in exactly one place. `npm-packlist` skips symlinked
 * files though, which would strip the README from the published tarball.
 *
 * - `materialize` replaces the symlinks with real copies (run before packing)
 * - `restore` turns the copies back into symlinks (run after packing)
 *
 * The journal in the system temporary directory records exactly which files
 * were materialized. A failed pack therefore cannot turn an unrelated real
 * file into a symlink on the next restore.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(root, 'packages', 'core');
const manifestPath = join(tmpdir(), `symbol-align-sync-docs-${createHash('sha256').update(root).digest('hex').slice(0, 16)}.json`);

/** Documentation files that live in the repository root and are linked into `packages/core`. */
const DOCS = ['README.md', 'CHANGELOG.md', 'LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md'];

function isSymbolicLink(path) {
    try {
        return lstatSync(path).isSymbolicLink();
    } catch {
        return false;
    }
}

function isPackageDoc(path) {
    return dirname(resolve(path)) === packageDir && DOCS.includes(basename(path));
}

function isRootDoc(path) {
    return dirname(resolve(path)) === root && DOCS.includes(basename(path));
}

function readManifest() {
    if (!existsSync(manifestPath)) {
        return [];
    }

    try {
        const entries = JSON.parse(readFileSync(manifestPath, 'utf-8'));

        if (!Array.isArray(entries)) {
            return [];
        }

        return entries.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.link === 'string' && typeof entry.source === 'string' && isPackageDoc(entry.link) && isRootDoc(entry.source));
    } catch {
        return [];
    }
}

function writeManifest(entries) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
}

function clearManifest() {
    rmSync(manifestPath, { force: true });
}

function materialize(doc) {
    const linkPath = join(packageDir, doc);
    const sourcePath = join(root, doc);

    if (!existsSync(sourcePath) || !isSymbolicLink(linkPath)) {
        return undefined;
    }

    rmSync(linkPath);
    copyFileSync(sourcePath, linkPath);
    console.log(`materialized ${doc} in ${packageDir}`);

    return { link: linkPath, source: sourcePath };
}

function restore({ link, source }) {
    if (!existsSync(source) || !existsSync(link) || isSymbolicLink(link)) {
        return;
    }

    rmSync(link);
    symlinkSync(relative(dirname(link), source), link, 'file');
    console.log(`restored symlink ${basename(link)} in ${dirname(link)}`);
}

const mode = process.argv[2];

if (mode !== 'materialize' && mode !== 'restore') {
    console.error('Usage: node scripts/sync-docs.mjs <materialize|restore>');
    process.exit(1);
}

if (mode === 'materialize') {
    const journal = new Map();

    for (const entry of readManifest()) {
        journal.set(entry.link, entry.source);
    }

    for (const doc of DOCS) {
        const entry = materialize(doc);

        if (entry !== undefined) {
            journal.set(entry.link, entry.source);
        }
    }

    writeManifest(
        [...journal].map(([link, source]) => ({
            link,
            source,
        })),
    );
} else {
    for (const entry of readManifest()) {
        restore(entry);
    }

    clearManifest();
}
