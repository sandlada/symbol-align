/**
 * TypeScript reference benchmark harness.
 *
 * Usage: node bench/run.mjs <manifest.json>
 * Prints one JSON object with the median of seven measured runs per corpus.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { alignWith } from '../dist/index.js';

const WARMUP = 2;
const RUNS = 7;

const manifestPath = process.argv[2] ?? fileURLToPath(new URL('../../../benchmarks/manifest.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const results = [];

for (const entry of manifest) {
    const code = readFileSync(entry.path, 'utf-8');
    const run = () => alignWith(entry.options)(code);
    const times = [];

    for (let index = 0; index < WARMUP + RUNS; index += 1) {
        const start = performance.now();
        run();
        const elapsed = performance.now() - start;

        if (index >= WARMUP) {
            times.push(elapsed);
        }
    }

    times.sort((left, right) => left - right);

    results.push({ name: entry.name, lines: entry.lines, bytes: entry.bytes, medianMs: times[Math.floor(times.length / 2)], runs: times });
}

process.stdout.write(`${JSON.stringify(results)}\n`);
