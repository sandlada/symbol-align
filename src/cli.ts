#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { align } from './aligner.js';

function sanitizePath(filePath: string): string {
  const baseDir = process.cwd();
  const resolvedPath = path.resolve(baseDir, filePath);
  const safeBase = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (!resolvedPath.startsWith(safeBase) && resolvedPath !== baseDir) {
    throw new Error('Invalid path: Directory traversal is not allowed.');
  }
  return resolvedPath;
}

function showHelp(): void {
  process.stdout.write(`
Usage: symbol-align [options] [< file]
       symbol-align [options] --file <path>

Vertically align symbols in code. Reads from stdin or a file, writes to stdout.

Options:
  -f, --file <path>    Read from file instead of stdin
  -o, --output <path>  Write to file instead of stdout
  -s, --symbols <list> Comma-separated symbols to align (default: "=")
                           Examples: "="  "=,:"  "=,:,=>,//,#"
  --help               Show this help

Examples:
  echo "a = 1\nbb = 2" | symbol-align
  cat file.ts | symbol-align --symbols =,:
  symbol-align --file input.ts
  symbol-align -f input.ts -o output.ts
  symbol-align -f input.ts --symbols =,: -o aligned.ts

Notes:
  - Symbols inside strings and comments are ignored.
  - Lines that don't contain the symbol are left unchanged.
  - Multi-symbol alignment processes symbols in order of appearance.
`);
}

export interface CliArgs {
  symbols: string[];
  help: boolean;
  file?: string;
  output?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    symbols: ['='],
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help') {
      args.help = true;
    } else if (arg === '--symbols' || arg === '-s') {
      if (i + 1 < argv.length) {
        const raw = argv[++i];
        args.symbols = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else if (arg.startsWith('--symbols=')) {
      const raw = arg.slice('--symbols='.length);
      args.symbols = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--file' || arg === '-f') {
      if (i + 1 < argv.length) {
        args.file = argv[++i];
      }
    } else if (arg.startsWith('--file=')) {
      args.file = arg.slice('--file='.length);
    } else if (arg === '--output' || arg === '-o') {
      if (i + 1 < argv.length) {
        args.output = argv[++i];
      }
    } else if (arg.startsWith('--output=')) {
      args.output = arg.slice('--output='.length);
    }
  }

  return args;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8'));
    });

    process.stdin.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    process.stdin.on('error', (err) => {
      reject(err);
    });

    // If stdin is a TTY, there's no piped input
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}

async function readFileFromDisk(filePath: string): Promise<string> {
  const safePath = sanitizePath(filePath);
  try {
    return await readFile(safePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'EISDIR') {
      throw new Error(`Cannot read directory: ${safePath}`);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const code = args.file
    ? await readFileFromDisk(args.file)
    : await readStdin();

  if (code.length === 0) {
    process.exit(0);
  }

  const result = align(code, { symbols: args.symbols });
  const output = result.code.length > 0 && !result.code.endsWith('\n')
    ? result.code + '\n'
    : result.code;

  if (args.output) {
    const safeOutput = sanitizePath(args.output);
    try {
      await writeFile(safeOutput, output, 'utf-8');
    } catch (err: any) {
      if (err.code === 'EISDIR') {
        throw new Error(`Cannot write to directory: ${safeOutput}`);
      }
      throw err;
    }
  } else {
    process.stdout.write(output);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
