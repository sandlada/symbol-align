/**
 * Runs the TypeScript, wasm and native Rust benchmark harnesses and writes a
 * reproducible performance report.
 *
 * Usage:
 *   node scripts/benchmark.mjs --label baseline --report report1.md
 *   node scripts/benchmark.mjs --label optimized --report report2.md
 *
 * Every harness reads the same generated corpora and the same options. The
 * report contains the environment, the method, the medians and the raw runs.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, arch, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeCorpora } from './bench-corpus.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const benchmarks = join(root, 'benchmarks');
const manifestPath = join(benchmarks, 'manifest.json');

/** Reads a `--name value` argument. */
const argument = (name, fallback) => {
    const index = process.argv.indexOf(name);

    return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
};

const label = argument('--label', 'baseline');
const reportPath = join(root, argument('--report', label === 'optimized' ? 'report2.md' : 'report1.md'));

/** Runs a command and returns its stdout. */
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], ...options }).trim();

/** Runs a Node harness. */
const runNode = (script, args = []) => {
    const output = run(process.execPath, [script, ...args]);

    return JSON.parse(output);
};

/** Builds the native benchmark binary. */
const buildNative = () => {
    const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo';

    execFileSync(cargo, ['build', '--release', '--bin', 'bench', '--manifest-path', join('packages', 'core', 'rust', 'Cargo.toml')], { cwd: root, stdio: 'inherit' });
};

/** The path of the native benchmark executable. */
const nativeBinary = () => join(root, 'packages', 'core', 'rust', 'target', 'release', process.platform === 'win32' ? 'bench.exe' : 'bench');

/** Reads the git commit of the workspace. */
const gitCommit = () => {
    try {
        return run('git', ['rev-parse', '--short', 'HEAD']);
    } catch {
        return 'unknown';
    }
};

/** Reads a tool version without failing the benchmark. */
const version = (command, args) => {
    try {
        return run(command, args).split('\n')[0];
    } catch {
        return 'unavailable';
    }
};

/** The environment recorded in the report and the raw JSON. */
const environment = () => ({
    date: new Date().toISOString(),
    commit: gitCommit(),
    os: `${platform()} ${release()} (${arch()})`,
    cpu: `${cpus()[0]?.model ?? 'unknown'} (${cpus().length} logical cores)`,
    node: process.version,
    rust: version('rustc', ['--version']),
    cargo: version('cargo', ['--version']),
});

/** Formats a number with a fixed amount of decimals. */
const fixed = (value, decimals = 3) => Number(value).toFixed(decimals);

/** Formats a speed-up ratio. */
const ratio = (baseline, optimized) => (optimized <= 0 ? 'n/a' : `${fixed(baseline / optimized, 2)}×`);

/** The rows of the merged result table. */
const merge = (typescript, wasm, native) => {
    const byName = new Map();

    for (const result of typescript) byName.set(result.name, { name: result.name, lines: result.lines, bytes: result.bytes, ts: result, wasm: undefined, native: undefined });
    for (const result of wasm) byName.get(result.name).wasm = result;
    for (const result of native) byName.get(result.name).native = result;

    return [...byName.values()];
};

/** Renders the markdown performance table. */
const table = (rows) => {
    const header = ['Corpus', 'Lines', 'KiB', 'TS ms', 'Rust native ms', 'Rust wasm ms', 'native vs TS', 'wasm vs TS', 'native ML/s', 'TS ML/s'];
    const separator = header.map(() => '---');
    const body = rows.map((row) => {
        const lines = row.lines;
        const ts = row.ts.medianMs;
        const native = row.native.medianMs;
        const wasm = row.wasm.medianMs;
        const megabytes = row.bytes / 1024;

        return [row.name, String(lines), fixed(megabytes, 1), fixed(ts), fixed(native), fixed(wasm), ratio(ts, native), ratio(ts, wasm), fixed(lines / native, 0), fixed(lines / ts, 0)];
    });

    return [header, separator, ...body].map((cells) => `| ${cells.join(' | ')} |`).join('\n');
};

/** Renders the raw JSON appendix. */
const rawAppendix = (typescript, wasm, native) =>
    JSON.stringify(
        {
            typescript,
            wasm,
            native,
        },
        null,
        4,
    );

/** Reads the baseline results of an earlier run, when it exists. */
const baselineResults = () => {
    const path = join(benchmarks, 'results-baseline.json');

    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null;
};

/** Renders the comparison against the baseline. */
const baselineComparison = (rows, baseline) => {
    if (baseline === null) {
        return '';
    }

    const byName = new Map(baseline.merge.map((row) => [row.name, row]));
    const lines = rows.map((row) => {
        const before = byName.get(row.name);

        if (before === undefined) {
            return null;
        }

        return `| ${row.name} | ${fixed(before.native.medianMs)} | ${fixed(row.native.medianMs)} | ${ratio(before.native.medianMs, row.native.medianMs)} | ${fixed(before.ts.medianMs)} | ${fixed(row.ts.medianMs)} |`;
    });

    return ['| Corpus | Rust before ms | Rust after ms | Rust gain | TS before ms | TS after ms |', '| --- | --- | --- | --- | --- | --- |', ...lines.filter((line) => line !== null)].join('\n');
};

const entries = writeCorpora(benchmarks);

process.stdout.write(`Generated ${entries.length} corpora in ${benchmarks}\n`);
process.stdout.write('Running the TypeScript harness...\n');
const typescript = runNode(join('packages', 'core-ts', 'bench', 'run.mjs'), [manifestPath]);
process.stdout.write('Running the wasm harness...\n');
const wasm = runNode(join('packages', 'core', 'bench', 'run.mjs'), [manifestPath]);
process.stdout.write('Building and running the native Rust harness...\n');
buildNative();
const native = JSON.parse(run(nativeBinary(), [manifestPath]));
const rows = merge(typescript, wasm, native);

writeFileSync(join(benchmarks, `results-${label}.json`), `${JSON.stringify({ label, environment: environment(), merge: rows, typescript, wasm, native }, null, 4)}\n`, 'utf-8');

const report = `# Performance report ${label === 'optimized' ? '2 — optimized algorithm' : '1 — baseline'}

This report is generated by \`node scripts/benchmark.mjs --label ${label} --report ${reportPath.split(/[/\\\\]/).pop()}\`.
Every harness reads the exact same corpus bytes and the exact same options
from \`benchmarks/manifest.json\`.

## Method

- Corpora: 4 workloads × 3 sizes (1,000 / 5,000 / 20,000 lines), generated
  deterministically by \`scripts/bench-corpus.mjs\`.
- Workloads: plain assignments, C# declaration columns, a configured token
  group, and a string-heavy corpus.
- Each harness performs 2 warm-up runs and 7 measured runs; the table reports
  the **median**.
- \`TS\` is the TypeScript reference core (\`packages/core-ts/dist\`), executed by
  Node.js.
- \`Rust native\` is \`symbol_align_core::aligner::align\` called directly from a
  release build with \`lto = "fat"\`; this is the pure language-level comparison.
- \`Rust wasm\` is the published npm path: the same Rust core compiled to
  \`wasm32-unknown-unknown\` and called through the inline-base64 TypeScript
  wrapper (UTF-8 encode/decode + one wasm boundary per call).
- \`native ML/s\` and \`TS ML/s\` are thousands of lines per second.
${label === 'optimized' ? '- The optimized report uses the same corpora and harnesses as report 1, so the\n  delta is the algorithm change rather than a different measurement setup.\n' : '- This is the **unoptimized baseline**: the Rust core is a faithful port of the\n  TypeScript pipeline (re-scan per symbol pass, fixpoint loop).\n'}

## Environment

| Item | Value |
| --- | --- |
| Date | ${new Date().toISOString()} |
| Git commit | \`${gitCommit()}\` |
| OS | ${platform()} ${release()} (${arch()}) |
| CPU | ${cpus()[0]?.model ?? 'unknown'} (${cpus().length} logical cores) |
| Node.js | ${process.version} |
| Rust | ${version('rustc', ['--version'])} |
| Cargo | ${version('cargo', ['--version'])} |

## Results

${table(rows)}

${label === 'optimized' ? `## Gain over the baseline\n\n${baselineComparison(rows, baselineResults())}\n` : ''}

## Raw data

\`\`\`json
${rawAppendix(typescript, wasm, native)}
\`\`\`
`;

writeFileSync(reportPath, report, 'utf-8');
process.stdout.write(`Wrote ${reportPath}\n`);
