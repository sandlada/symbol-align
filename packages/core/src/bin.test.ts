import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The path of the executable entry point of the CLI.
 *
 * The test runs the sources through `tsx`, so it never depends on a build of
 * the package.
 */
const entryPoint = join(import.meta.dirname, 'bin.ts');

/** The result of a run of the CLI. */
interface CliRun {
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

/** Runs the CLI and collects everything it writes. */
const runCli = (file: string): Promise<CliRun> =>
    new Promise<CliRun>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', entryPoint, '--file', file], { stdio: ['ignore', 'pipe', 'pipe'] });
        const stdout: Buffer[] = [];
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => {
            stdout.push(chunk);
        });
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf-8');
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ code, stdout: Buffer.concat(stdout).toString('utf-8'), stderr });
        });
    });

describe('the executable entry point', () => {
    it('writes the whole output into a pipe', async () => {
        // The fixture lives inside the working directory, because the CLI
        // refuses to read a file from outside of it.
        const directory = await mkdtemp(join(process.cwd(), '.pipe-'));

        try {
            const file = join(directory, 'big.ts');
            const lines = Array.from({ length: 200000 }, (_, index) => `const value${index} = ${index};`);

            await writeFile(file, lines.join('\n'), 'utf-8');

            const run = await runCli(file);
            const written = run.stdout.split('\n');

            // A pipe is written asynchronously on Windows, so a process that
            // ends right after the write can lose the tail of its output.
            expect(written).toHaveLength(lines.length + 1);
            expect(written[0]).toMatch(/^const value0 += 0;$/);
            expect(written[lines.length - 1]).toMatch(/^const value199999 += 199999;$/);
            expect(new Set(written.filter((line) => line.length > 0).map((line) => line.indexOf('='))).size).toBe(1);
            expect(run.code).toBe(0);
            expect(run.stderr).toBe('');
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }, 60000);
});
