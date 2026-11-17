#!/usr/bin/env node

import { runCli, type CliStreams } from './cli.js';
import { flushStream, ignoreBrokenPipe } from './pipe.js';

/**
 * Collects the whole standard input as UTF-8 text.
 */
const readStdin = (): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        process.stdin.setEncoding('utf-8');

        process.stdin.on('data', (chunk: string | Buffer) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8'));
        });
        process.stdin.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        process.stdin.on('error', reject);

        if (process.stdin.isTTY) {
            resolve('');
        }
    });

/**
 * Ends the process quietly when the reader of a pipe is gone.
 *
 * `symbol-align file.ts | head` closes the pipe while the CLI is still
 * writing. The reader asked for it, so the CLI ends without a stack trace.
 */
const exitQuietly = (): void => {
    process.exit(0);
};

ignoreBrokenPipe(process.stdout)(exitQuietly);
ignoreBrokenPipe(process.stderr)(exitQuietly);

const streams: CliStreams = {
    stdout: (chunk: string) => {
        process.stdout.write(chunk);
    },
    stderr: (chunk: string) => {
        process.stderr.write(chunk);
    },
    stdin: readStdin,
};

const code = await runCli(process.argv, streams);

// A pipe is written asynchronously on Windows, so the process may only end
// after the output left it — otherwise the tail of the output can be lost.
await flushStream(process.stdout)();
await flushStream(process.stderr)();

process.exit(code);
