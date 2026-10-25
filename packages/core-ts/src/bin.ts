#!/usr/bin/env node

import { runCli, type CliStreams } from './cli.js';

/** Collects the whole standard input as UTF-8 text. */
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

const streams: CliStreams = {
    stdout: (chunk: string) => {
        process.stdout.write(chunk);
    },
    stderr: (chunk: string) => {
        process.stderr.write(chunk);
    },
    stdin: readStdin,
};

process.exit(await runCli(process.argv, streams));
