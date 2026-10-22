import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CliStreams } from './cli.js';
import { parseArgs, readPackageVersion, runCli, usage, validatePath } from './cli.js';

/** The CLI streams with the written output collected for assertions. */
interface CapturedStreams extends CliStreams {
    /** Everything that was written to standard output. */
    readonly stdoutText: () => string;
    /** Everything that was written to standard error. */
    readonly stderrText: () => string;
}

/** Creates streams that collect the output of the CLI. */
const createStreams = (input: string = ''): CapturedStreams => {
    const out: string[] = [];
    const err: string[] = [];

    return {
        stdout: (chunk: string) => {
            out.push(chunk);
        },
        stderr: (chunk: string) => {
            err.push(chunk);
        },
        stdin: async () => input,
        stdoutText: () => out.join(''),
        stderrText: () => err.join(''),
    };
};

/** Runs the callback inside a fresh temporary directory that acts as the working directory. */
const withTempDir = async (run: (directory: string) => Promise<void>): Promise<void> => {
    const directory = await mkdtemp(join(tmpdir(), 'symbol-align-cli-'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);

    try {
        await run(directory);
    } finally {
        cwd.mockRestore();
        await rm(directory, { recursive: true, force: true });
    }
};

describe('parseArgs', () => {
    it('returns the default arguments when no option is given', () => {
        expect(parseArgs(['node', 'cli.js'])).toEqual({
            scope: 'block',
            check: false,
            help: false,
            version: false,
        });
    });

    it('starts scanning at index 2 of the argument vector', () => {
        expect(() => parseArgs(['--check', 'node', 'cli.js'])).toThrow('Unknown option: cli.js');
    });

    it('reads the file path from --file', () => {
        expect(parseArgs(['node', 'cli.js', '--file', 'input.ts']).file).toBe('input.ts');
    });

    it('reads the file path from -f', () => {
        expect(parseArgs(['node', 'cli.js', '-f', 'input.ts']).file).toBe('input.ts');
    });

    it('reads the file path from --file=value', () => {
        expect(parseArgs(['node', 'cli.js', '--file=input.ts']).file).toBe('input.ts');
    });

    it('reads the output path from --output', () => {
        expect(parseArgs(['node', 'cli.js', '--output', 'output.ts']).output).toBe('output.ts');
    });

    it('reads the output path from -o', () => {
        expect(parseArgs(['node', 'cli.js', '-o', 'output.ts']).output).toBe('output.ts');
    });

    it('reads the output path from --output=value', () => {
        expect(parseArgs(['node', 'cli.js', '--output=output.ts']).output).toBe('output.ts');
    });

    it('reads the symbol list from --symbols', () => {
        expect(parseArgs(['node', 'cli.js', '--symbols', '=,:']).symbols).toEqual(['=', ':']);
    });

    it('reads the symbol list from -s', () => {
        expect(parseArgs(['node', 'cli.js', '-s', '=,:']).symbols).toEqual(['=', ':']);
    });

    it('reads the symbol list from --symbols=value', () => {
        expect(parseArgs(['node', 'cli.js', '--symbols=:,=']).symbols).toEqual([':', '=']);
    });

    it('trims the entries of the symbol list', () => {
        expect(parseArgs(['node', 'cli.js', '--symbols', ' = , : ']).symbols).toEqual(['=', ':']);
    });

    it('drops empty entries of the symbol list', () => {
        expect(parseArgs(['node', 'cli.js', '--symbols', ':,,=,']).symbols).toEqual([':', '=']);
    });

    it('keeps the default symbols when the symbol list is empty', () => {
        expect(parseArgs(['node', 'cli.js', '--symbols=']).symbols).toBeUndefined();
    });

    it('reads the language from --language', () => {
        expect(parseArgs(['node', 'cli.js', '--language', 'python']).language).toBe('python');
    });

    it('reads the language from -l', () => {
        expect(parseArgs(['node', 'cli.js', '-l', 'python']).language).toBe('python');
    });

    it('reads the language from --language=value', () => {
        expect(parseArgs(['node', 'cli.js', '--language=python']).language).toBe('python');
    });

    it('reads the piped file path from --stdin-filepath', () => {
        expect(parseArgs(['node', 'cli.js', '--stdin-filepath', 'snippet.py']).stdinFilepath).toBe('snippet.py');
    });

    it('reads the piped file path from -t', () => {
        expect(parseArgs(['node', 'cli.js', '-t', 'snippet.py']).stdinFilepath).toBe('snippet.py');
    });

    it('reads the piped file path from --stdin-filepath=value', () => {
        expect(parseArgs(['node', 'cli.js', '--stdin-filepath=snippet.py']).stdinFilepath).toBe('snippet.py');
    });

    it('reads the scope from --scope', () => {
        expect(parseArgs(['node', 'cli.js', '--scope', 'file']).scope).toBe('file');
    });

    it('reads the scope from --scope=value', () => {
        expect(parseArgs(['node', 'cli.js', '--scope=block']).scope).toBe('block');
    });

    it('rejects an unknown scope', () => {
        expect(() => parseArgs(['node', 'cli.js', '--scope', 'chunk'])).toThrow('Invalid scope: chunk. Expected "block" or "file".');
    });

    it('rejects an unknown language', () => {
        expect(() => parseArgs(['node', 'cli.js', '--language', 'klingon'])).toThrow('Unknown language: klingon');
    });

    it('enables the check mode with --check', () => {
        expect(parseArgs(['node', 'cli.js', '--check']).check).toBe(true);
    });

    it('enables the help mode with --help', () => {
        expect(parseArgs(['node', 'cli.js', '--help']).help).toBe(true);
    });

    it('enables the help mode with -h', () => {
        expect(parseArgs(['node', 'cli.js', '-h']).help).toBe(true);
    });

    it('enables the version mode with --version', () => {
        expect(parseArgs(['node', 'cli.js', '--version']).version).toBe(true);
    });

    it('enables the version mode with -v', () => {
        expect(parseArgs(['node', 'cli.js', '-v']).version).toBe(true);
    });

    it('reports an unknown option', () => {
        expect(() => parseArgs(['node', 'cli.js', '--nope'])).toThrow('Unknown option: --nope');
    });

    it('reports a missing value for --file', () => {
        expect(() => parseArgs(['node', 'cli.js', '--file'])).toThrow('Missing value for file');
    });

    it('reports a missing value for --output', () => {
        expect(() => parseArgs(['node', 'cli.js', '--output'])).toThrow('Missing value for output');
    });

    it('reports a missing value for --symbols', () => {
        expect(() => parseArgs(['node', 'cli.js', '--symbols'])).toThrow('Missing value for symbols');
    });

    it('reports a missing value for --language', () => {
        expect(() => parseArgs(['node', 'cli.js', '--language'])).toThrow('Missing value for language');
    });

    it('reports a missing value for --stdin-filepath', () => {
        expect(() => parseArgs(['node', 'cli.js', '--stdin-filepath'])).toThrow('Missing value for stdin-filepath');
    });

    it('reports a missing value for --scope', () => {
        expect(() => parseArgs(['node', 'cli.js', '--scope'])).toThrow('Missing value for scope');
    });

    it('parses several options at once', () => {
        const args = parseArgs(['node', 'cli.js', '-f', 'input.ts', '-o', 'output.ts', '-s', ':,=', '--check']);

        expect(args.file).toBe('input.ts');
        expect(args.output).toBe('output.ts');
        expect(args.symbols).toEqual([':', '=']);
        expect(args.check).toBe(true);
    });
});

describe('validatePath', () => {
    it('allows paths within the current directory', () => {
        const cwd = process.cwd();
        expect(validatePath('input.ts')).toBe(resolve(cwd, 'input.ts'));
        expect(validatePath('./input.ts')).toBe(resolve(cwd, './input.ts'));
        expect(validatePath('foo/bar.ts')).toBe(resolve(cwd, 'foo/bar.ts'));
        expect(validatePath(cwd)).toBe(cwd);
    });

    it('throws an error for path traversal attempts', () => {
        expect(() => validatePath('../input.ts')).toThrow(/Path traversal detected/);
        expect(() => validatePath('../../etc/passwd')).toThrow(/Path traversal detected/);
        expect(() => validatePath('/etc/passwd')).toThrow(/Path traversal detected/);
    });
});

describe('readPackageVersion', () => {
    it('returns the version of the package', () => {
        expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
    });
});

describe('runCli', () => {
    it('prints the usage and returns 0 for --help', async () => {
        const streams = createStreams();

        const code = await runCli(['node', 'cli.js', '--help'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe(usage);
        expect(streams.stdoutText()).toContain('Usage: symbol-align [options] [< file]');
    });

    it('prints the version and returns 0 for --version', async () => {
        const streams = createStreams();

        const code = await runCli(['node', 'cli.js', '--version'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText().trim()).toBe(readPackageVersion());
    });

    it('aligns the code read from stdin', async () => {
        const streams = createStreams('a = 1\nbb = 2');

        const code = await runCli(['node', 'cli.js'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe('a  = 1\nbb = 2\n');
    });

    it('ends the written output with exactly one newline', async () => {
        const streams = createStreams('a = 1\nbb = 2\n');

        const code = await runCli(['node', 'cli.js'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText().endsWith('\n')).toBe(true);
        expect(streams.stdoutText().endsWith('\n\n')).toBe(false);
    });

    it('reports unaligned input on stderr and returns 1 for --check', async () => {
        const streams = createStreams('a = 1\nbb = 2');

        const code = await runCli(['node', 'cli.js', '--check'], streams);

        expect(code).toBe(1);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).not.toBe('');
    });

    it('returns 0 and writes nothing for an aligned input with --check', async () => {
        const streams = createStreams('a  = 1\nbb = 2\n');

        const code = await runCli(['node', 'cli.js', '--check'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).toBe('');
    });

    it('reads the input from the file given with --file', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('a  = 1\nbb = 2\n');
        });
    });

    it('writes the aligned code to the file given with --output', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--output', 'output.ts'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('');
            expect(await readFile(join(directory, 'output.ts'), 'utf-8')).toBe('a  = 1\nbb = 2\n');
        });
    });

    it('writes an error to stderr and returns 1 for an unknown option', async () => {
        const streams = createStreams();

        const code = await runCli(['node', 'cli.js', '--nope'], streams);

        expect(code).toBe(1);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).toBe('Error: Unknown option: --nope\n');
    });

    it('forwards the language profile to the aligner', async () => {
        const streams = createStreams('# note = ignored\na = 1\nbb = 2');

        const code = await runCli(['node', 'cli.js', '--language', 'python'], streams);

        expect(code).toBe(0);

        const lines = streams.stdoutText().split('\n');
        expect(lines[0]).toBe('# note = ignored');
        expect(lines[1]?.indexOf('=')).toBe(lines[2]?.indexOf('='));
        expect(lines[1]?.indexOf('=')).toBeLessThan(lines[0]?.indexOf('=') ?? 0);
    });

    it('detects the language from the path of the piped file', async () => {
        const streams = createStreams('# note = ignored\na = 1\nbb = 2');

        const code = await runCli(['node', 'cli.js', '--stdin-filepath', 'snippet.py'], streams);

        expect(code).toBe(0);

        const lines = streams.stdoutText().split('\n');
        expect(lines[1]?.indexOf('=')).toBe(lines[2]?.indexOf('='));
        expect(lines[1]?.indexOf('=')).toBeLessThan(lines[0]?.indexOf('=') ?? 0);
    });
});
