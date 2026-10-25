/**
 * Deterministic benchmark corpora shared by the TypeScript, wasm and native
 * Rust harnesses.
 *
 * The generated files and the manifest are written to `benchmarks/` so every
 * harness measures the exact same bytes with the exact same options.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SIZES = [1_000, 5_000, 20_000];

/** Builds a corpus from a line factory. */
const corpus = (size, build) => Array.from({ length: size }, (_, index) => build(index)).join('\n');

/** The workloads measured by every harness. */
const workloads = [
    {
        name: 'assignments',
        language: 'typescript',
        symbols: ['='],
        declarations: false,
        build: (index) => `const value${String(index).padStart(5, '0')} = ${index % 97};`,
    },
    {
        name: 'declarations',
        language: 'csharp',
        symbols: ['='],
        declarations: true,
        build: (index) => {
            const modifiers = ['private const string', 'public static int', 'protected readonly long', 'internal sealed bool'][index % 4];

            return `${modifiers} Name${String(index).padStart(5, '0')} = ${index % 89};`;
        },
    },
    {
        name: 'groups',
        language: 'typescript',
        symbols: ['='],
        declarations: false,
        groups: [['MY_STATE1', 'MY_STATE2']],
        build: (index) => `state = ${index % 2 === 0 ? 'MY_STATE1' : 'MY_STATE2'};`,
    },
    {
        name: 'strings',
        language: 'typescript',
        symbols: ['=', ':'],
        declarations: false,
        build: (index) => `const label${String(index).padStart(5, '0')} = "key = value stays inside the string";`,
    },
];

/** Writes every corpus and returns the manifest entries. */
export const writeCorpora = (directory) => {
    mkdirSync(directory, { recursive: true });

    const entries = [];

    for (const workload of workloads) {
        for (const size of SIZES) {
            const name = `${workload.name}-${size}`;
            const path = join(directory, `${name}.txt`);
            const code = corpus(size, workload.build);
            const options = {
                language: workload.language,
                symbols: workload.symbols,
                declarations: workload.declarations,
                ...(workload.groups === undefined ? {} : { groups: workload.groups }),
            };

            writeFileSync(path, code, 'utf-8');
            entries.push({ name, path, options, lines: size, bytes: Buffer.byteLength(code) });
        }
    }

    writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(entries, null, 4)}\n`, 'utf-8');

    return entries;
};
