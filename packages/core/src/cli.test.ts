import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CliStreams } from './cli.js';
import { parseArgs, readPackageVersion, renderDiff, runCli, usage, validatePath } from './cli.js';

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
            check: false,
            diff: false,
            files: [],
            help: false,
            version: false,
            write: false,
        });
    });

    it('starts scanning at index 2 of the argument vector', () => {
        expect(() => parseArgs(['--check', 'node', 'cli.js'])).toThrow('Unknown option: cli.js');
    });

    it('reads the file path from --file', () => {
        expect(parseArgs(['node', 'cli.js', '--file', 'input.ts']).files).toEqual(['input.ts']);
    });

    it('reads the file path from -f', () => {
        expect(parseArgs(['node', 'cli.js', '-f', 'input.ts']).files).toEqual(['input.ts']);
    });

    it('reads the file path from --file=value', () => {
        expect(parseArgs(['node', 'cli.js', '--file=input.ts']).files).toEqual(['input.ts']);
    });

    it('collects every file path in the order they are given', () => {
        expect(parseArgs(['node', 'cli.js', '--file', 'first.ts', '--file', 'second.ts']).files).toEqual(['first.ts', 'second.ts']);
    });

    it('collects the file paths of the mixed forms of the option', () => {
        expect(parseArgs(['node', 'cli.js', '-f', 'first.ts', '--file=second.ts']).files).toEqual(['first.ts', 'second.ts']);
    });

    it('collects several file paths from a single --file', () => {
        expect(parseArgs(['node', 'cli.js', '--file', 'first.ts', 'second.ts']).files).toEqual(['first.ts', 'second.ts']);
    });

    it('collects several file paths from a single --file=value', () => {
        expect(parseArgs(['node', 'cli.js', '--file=first.ts', 'second.ts']).files).toEqual(['first.ts', 'second.ts']);
    });

    it('stops collecting file paths at the next option', () => {
        const args = parseArgs(['node', 'cli.js', '--file', 'first.ts', 'second.ts', '--diff']);

        expect(args.files).toEqual(['first.ts', 'second.ts']);
        expect(args.diff).toBe(true);
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

    it('treats an empty symbol list as align nothing', () => {
        expect(parseArgs(['node', 'cli.js', '--symbols=']).symbols).toEqual([]);
    });

    it('reads one group from --group', () => {
        expect(parseArgs(['node', 'cli.js', '--group', 'MY_STATE1,MY_STATE2']).groups).toEqual([['MY_STATE1', 'MY_STATE2']]);
    });

    it('reads one group from -g', () => {
        expect(parseArgs(['node', 'cli.js', '-g', 'MY_STATE1,MY_STATE2']).groups).toEqual([['MY_STATE1', 'MY_STATE2']]);
    });

    it('reads one group from --group=value', () => {
        expect(parseArgs(['node', 'cli.js', '--group=A,B']).groups).toEqual([['A', 'B']]);
    });

    it('appends every repeated group in the order they are given', () => {
        expect(parseArgs(['node', 'cli.js', '--group', 'A,B', '--group', 'C,D']).groups).toEqual([
            ['A', 'B'],
            ['C', 'D'],
        ]);
    });

    it('trims the members of a group', () => {
        expect(parseArgs(['node', 'cli.js', '--group', ' A , B ']).groups).toEqual([['A', 'B']]);
    });

    it('drops an all empty group', () => {
        expect(parseArgs(['node', 'cli.js', '--group', ',', '--group', 'A,B']).groups).toEqual([['A', 'B']]);
    });

    it('reports a missing value for --group', () => {
        expect(() => parseArgs(['node', 'cli.js', '--group'])).toThrow('Missing value for group');
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

    it('reads the configuration file from --config', () => {
        expect(parseArgs(['node', 'cli.js', '--config', 'symbol-align.config.json']).config).toBe('symbol-align.config.json');
    });

    it('reads the configuration file from -c', () => {
        expect(parseArgs(['node', 'cli.js', '-c', 'symbol-align.config.json']).config).toBe('symbol-align.config.json');
    });

    it('reads the configuration file from --config=value', () => {
        expect(parseArgs(['node', 'cli.js', '--config=symbol-align.config.json']).config).toBe('symbol-align.config.json');
    });

    it('reports a missing value for --config', () => {
        expect(() => parseArgs(['node', 'cli.js', '--config'])).toThrow('Missing value for config');
    });

    it('rejects an unknown scope', () => {
        expect(() => parseArgs(['node', 'cli.js', '--scope', 'chunk'])).toThrow('Invalid scope: chunk. Expected "block", "indent" or "file".');
    });

    it('rejects an unknown language', () => {
        expect(() => parseArgs(['node', 'cli.js', '--language', 'klingon'])).toThrow('Unknown language: klingon');
    });

    it('enables the declaration alignment with --declarations', () => {
        expect(parseArgs(['node', 'cli.js', '--declarations']).declarations).toBe(true);
    });

    it('disables the declaration alignment with --no-declarations', () => {
        expect(parseArgs(['node', 'cli.js', '--no-declarations']).declarations).toBe(false);
    });

    it('lets the last declaration flag win', () => {
        expect(parseArgs(['node', 'cli.js', '--declarations', '--no-declarations']).declarations).toBe(false);
        expect(parseArgs(['node', 'cli.js', '--no-declarations', '--declarations']).declarations).toBe(true);
    });

    it('reads the declaration anchor from --declaration-anchor', () => {
        expect(parseArgs(['node', 'cli.js', '--declaration-anchor', 'end']).declarationAnchor).toBe('end');
    });

    it('reads the declaration anchor from --declaration-anchor=value', () => {
        expect(parseArgs(['node', 'cli.js', '--declaration-anchor=end']).declarationAnchor).toBe('end');
    });

    it('reads the max declaration pad from --max-declaration-pad', () => {
        expect(parseArgs(['node', 'cli.js', '--max-declaration-pad', '24']).maxDeclarationPad).toBe(24);
    });

    it('reads the max declaration pad from --max-declaration-pad=value', () => {
        expect(parseArgs(['node', 'cli.js', '--max-declaration-pad=24']).maxDeclarationPad).toBe(24);
    });

    it('parses the declaration options together', () => {
        const args = parseArgs(['node', 'cli.js', '--declarations', '--declaration-anchor', 'end', '--max-declaration-pad', '24']);

        expect(args.declarations).toBe(true);
        expect(args.declarationAnchor).toBe('end');
        expect(args.maxDeclarationPad).toBe(24);
    });

    it('rejects an unknown declaration anchor', () => {
        expect(() => parseArgs(['node', 'cli.js', '--declaration-anchor', 'middle'])).toThrow('Invalid declaration anchor: middle. Expected "start" or "end".');
    });

    it('rejects a zero max declaration pad', () => {
        expect(() => parseArgs(['node', 'cli.js', '--max-declaration-pad', '0'])).toThrow('Invalid max declaration pad: 0. Expected a positive integer.');
    });

    it('rejects a fractional max declaration pad', () => {
        expect(() => parseArgs(['node', 'cli.js', '--max-declaration-pad', '1.5'])).toThrow('Invalid max declaration pad: 1.5. Expected a positive integer.');
    });

    it('rejects a max declaration pad that is not a number', () => {
        expect(() => parseArgs(['node', 'cli.js', '--max-declaration-pad', 'many'])).toThrow('Invalid max declaration pad: many. Expected a positive integer.');
    });

    it('reports a missing value for --declaration-anchor', () => {
        expect(() => parseArgs(['node', 'cli.js', '--declaration-anchor'])).toThrow('Missing value for declaration-anchor');
    });

    it('reports a missing value for --max-declaration-pad', () => {
        expect(() => parseArgs(['node', 'cli.js', '--max-declaration-pad'])).toThrow('Missing value for max-declaration-pad');
    });

    it('reports a missing value when a declaration option is followed by another option', () => {
        expect(() => parseArgs(['node', 'cli.js', '--declaration-anchor', '--declarations'])).toThrow('Missing value for declaration-anchor');
    });

    it('enables the check mode with --check', () => {
        expect(parseArgs(['node', 'cli.js', '--check']).check).toBe(true);
    });

    it('enables the write mode with --write', () => {
        expect(parseArgs(['node', 'cli.js', '--write']).write).toBe(true);
    });

    it('enables the diff mode with --diff', () => {
        expect(parseArgs(['node', 'cli.js', '--diff']).diff).toBe(true);
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

    it('rejects an empty value for --file', () => {
        expect(() => parseArgs(['node', 'cli.js', '--file='])).toThrow('Empty value for file');
    });

    it('rejects an empty value for --output', () => {
        expect(() => parseArgs(['node', 'cli.js', '--output='])).toThrow('Empty value for output');
    });

    it('rejects an empty value for --config', () => {
        expect(() => parseArgs(['node', 'cli.js', '--config='])).toThrow('Empty value for config');
    });

    it('parses several options at once', () => {
        const args = parseArgs(['node', 'cli.js', '-f', 'input.ts', '-o', 'output.ts', '-s', ':,=', '--check']);

        expect(args.files).toEqual(['input.ts']);
        expect(args.output).toBe('output.ts');
        expect(args.symbols).toEqual([':', '=']);
        expect(args.check).toBe(true);
    });
});

describe('usage', () => {
    it('documents the group option', () => {
        expect(usage).toContain('-g, --group <list>');
        expect(usage).toContain('symbol-align --file input.ts --group MY_STATE1,MY_STATE2');
    });

    it('documents the declaration options', () => {
        expect(usage).toContain('--declarations');
        expect(usage).toContain('--no-declarations');
        expect(usage).toContain('--declaration-anchor <start|end>');
        expect(usage).toContain('--max-declaration-pad <n>');
    });

    it('documents an example with the declaration options', () => {
        expect(usage).toContain('symbol-align --file input.ts --declarations --declaration-anchor start --max-declaration-pad 12');
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

    it('allows dot segments that stay within the working directory', () => {
        const cwd = process.cwd();

        expect(validatePath(join('a', '..', 'input.ts'))).toBe(resolve(cwd, 'input.ts'));
        expect(validatePath(join('sub', '..', 'input.ts'))).toBe(resolve(cwd, 'input.ts'));
    });

    it.runIf(process.platform === 'win32')('ignores ASCII case when comparing with the working directory', () => {
        const cwd = process.cwd();
        const recased = cwd.charAt(0).toLowerCase() + cwd.slice(1);

        expect(validatePath(join(recased, 'input.ts'))).toBe(resolve(recased, 'input.ts'));
    });
});

describe('readPackageVersion', () => {
    it('returns the version of the package', () => {
        expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
    });
});

describe('renderDiff', () => {
    it('renders nothing when the two texts are identical', () => {
        expect(renderDiff('a = 1\n', 'a = 1\n')).toEqual([]);
    });

    it('renders the header and the hunk of a changed line', () => {
        expect(renderDiff('const cc = 1;\nconst d = 2;\n', 'const cc = 1;\nconst d  = 2;\n')).toEqual(['--- input', '+++ aligned', '@@ -1,2 +1,2 @@', ' const cc = 1;', '-const d = 2;', '+const d  = 2;']);
    });

    it('groups consecutive changed lines into a single hunk', () => {
        expect(renderDiff('aa = 1\nb = 2\nc = 3\n', 'aa = 1\nb  = 2\nc  = 3\n')).toEqual(['--- input', '+++ aligned', '@@ -1,3 +1,3 @@', ' aa = 1', '-b = 2', '+b  = 2', '-c = 3', '+c  = 3']);
    });

    it('separates two distant changed lines into two hunks', () => {
        expect(renderDiff('aa = 1\nb = 2\n\nc = 3\n\ndd = 4\ne = 5\n', 'aa = 1\nb  = 2\n\nc = 3\n\ndd = 4\ne  = 5\n')).toEqual([
            '--- input',
            '+++ aligned',
            '@@ -1,3 +1,3 @@',
            ' aa = 1',
            '-b = 2',
            '+b  = 2',
            ' ',
            '@@ -6,2 +6,2 @@',
            ' dd = 4',
            '-e = 5',
            '+e  = 5',
        ]);
    });

    it('merges two hunks that share a context line', () => {
        expect(renderDiff('aa = 1\nb = 2\n\nc = 3\ndd = 4\n', 'aa = 1\nb  = 2\n\nc  = 3\ndd = 4\n')).toEqual(['--- input', '+++ aligned', '@@ -1,5 +1,5 @@', ' aa = 1', '-b = 2', '+b  = 2', ' ', '-c = 3', '+c  = 3', ' dd = 4']);
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

    it('keeps the README CLI reference in sync with the usage text', async () => {
        const readme = await readFile(new URL('../../../README.md', import.meta.url), 'utf-8');
        const block = readme.match(/## CLI reference\n\n```\n([\s\S]*?)```/);

        expect(block?.[1]).toBe(usage);
    });

    it('aligns the code read from stdin', async () => {
        const streams = createStreams('a = 1\nbb = 2');

        const code = await runCli(['node', 'cli.js'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe('a  = 1\nbb = 2\n');
    });

    it('aligns a repeated group from the command line', async () => {
        const streams = createStreams('let status = MY_STATE1;\nlet longName = MY_STATE2;');

        const code = await runCli(['node', 'cli.js', '--symbols', '', '--group', 'MY_STATE1,MY_STATE2'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe('let status =   MY_STATE1;\nlet longName = MY_STATE2;\n');
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

    it('returns 0 with no output for an empty standard input', async () => {
        const streams = createStreams('');

        const code = await runCli(['node', 'cli.js'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).toBe('');
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

    it('writes the aligned code back into the file it read with --write', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--write'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('');
            expect(await readFile(join(directory, 'input.ts'), 'utf-8')).toBe('a  = 1\nbb = 2\n');
        });
    });

    it('writes every file back into place with --write and several files', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'first.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            await writeFile(join(directory, 'second.ts'), 'c = 3\ndd = 4\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'first.ts', '--file', 'second.ts', '--write'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('');
            expect(await readFile(join(directory, 'first.ts'), 'utf-8')).toBe('a  = 1\nbb = 2\n');
            expect(await readFile(join(directory, 'second.ts'), 'utf-8')).toBe('c  = 3\ndd = 4\n');
        });
    });

    it('writes several files given to a single --file', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'first.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            await writeFile(join(directory, 'second.ts'), 'c = 3\ndd = 4\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--write', '--file', 'first.ts', 'second.ts'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('');
            expect(await readFile(join(directory, 'first.ts'), 'utf-8')).toBe('a  = 1\nbb = 2\n');
            expect(await readFile(join(directory, 'second.ts'), 'utf-8')).toBe('c  = 3\ndd = 4\n');
        });
    });

    it('reports an error for --write without --file', async () => {
        const streams = createStreams('a = 1');

        const code = await runCli(['node', 'cli.js', '--write'], streams);

        expect(code).toBe(1);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).toBe('Error: --write requires --file\n');
    });

    it('reports an error for --check together with --write', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--check', '--write'], streams);

            expect(code).toBe(1);
            expect(streams.stdoutText()).toBe('');
            expect(streams.stderrText()).toBe('Error: --check cannot be combined with --write\n');
            expect(await readFile(join(directory, 'input.ts'), 'utf-8')).toBe('a = 1\nbb = 2\n');
        });
    });

    it('reports an error for --check together with --output', async () => {
        const streams = createStreams('a = 1\nbb = 2\n');

        const code = await runCli(['node', 'cli.js', '--check', '--output', 'output.ts'], streams);

        expect(code).toBe(1);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).toBe('Error: --check cannot be combined with --output\n');
    });

    it('reports an error for --diff together with --write', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--diff', '--write'], streams);

            expect(code).toBe(1);
            expect(streams.stdoutText()).toBe('');
            expect(streams.stderrText()).toBe('Error: --diff cannot be combined with --write\n');
            expect(await readFile(join(directory, 'input.ts'), 'utf-8')).toBe('a = 1\nbb = 2\n');
        });
    });

    it('reports an error for --diff together with --output', async () => {
        const streams = createStreams('a = 1\nbb = 2\n');

        const code = await runCli(['node', 'cli.js', '--diff', '--output', 'output.ts'], streams);

        expect(code).toBe(1);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).toBe('Error: --diff cannot be combined with --output\n');
    });
    it('reports an error for --write together with --output', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--write', '--output', 'output.ts'], streams);

            expect(code).toBe(1);
            expect(streams.stdoutText()).toBe('');
            expect(streams.stderrText()).toBe('Error: --write cannot be combined with --output\n');
            expect(await readFile(join(directory, 'input.ts'), 'utf-8')).toBe('a = 1\nbb = 2\n');
        });
    });

    it('reads every file given with --file', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'first.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            await writeFile(join(directory, 'second.ts'), 'c = 3\ndd = 4\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'first.ts', '--file', 'second.ts'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('a  = 1\nbb = 2\n\nc  = 3\ndd = 4\n');
        });
    });

    it('reports an error for --output with several files', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'first.ts'), 'a = 1\n', 'utf-8');
            await writeFile(join(directory, 'second.ts'), 'c = 3\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'first.ts', '--file', 'second.ts', '--output', 'output.ts'], streams);

            expect(code).toBe(1);
            expect(streams.stdoutText()).toBe('');
            expect(streams.stderrText()).toBe('Error: --output cannot be used with several files\n');
        });
    });

    it('returns 1 for --check when one of several files is not aligned', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'first.ts'), 'a  = 1\nbb = 2\n', 'utf-8');
            await writeFile(join(directory, 'second.ts'), 'c = 3\ndd = 4\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'first.ts', '--file', 'second.ts', '--check'], streams);

            expect(code).toBe(1);
            expect(streams.stdoutText()).toBe('');
            expect(streams.stderrText()).toContain('second.ts');
            expect(streams.stderrText()).not.toContain('first.ts');
        });
    });

    it('prints a unified diff for --diff', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'const cc = 1;\nconst cc = 2;\nconst cc = 3;\nconst d = 4;\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--diff'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe(['--- input', '+++ aligned', '@@ -3,2 +3,2 @@', ' const cc = 3;', '-const d = 4;', '+const d  = 4;', ''].join('\n'));
        });
    });

    it('prints nothing for --diff when the input is already aligned', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a  = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--diff'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('');
        });
    });

    it('never writes a file for --diff', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'input.ts'), 'a = 1\nbb = 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.ts', '--diff'], streams);

            expect(code).toBe(0);
            expect(await readFile(join(directory, 'input.ts'), 'utf-8')).toBe('a = 1\nbb = 2\n');
        });
    });

    it('reports an error for --diff together with --check', async () => {
        const streams = createStreams('a = 1');

        const code = await runCli(['node', 'cli.js', '--diff', '--check'], streams);

        expect(code).toBe(1);
        expect(streams.stdoutText()).toBe('');
        expect(streams.stderrText()).toBe('Error: --diff cannot be combined with --check\n');
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

describe('runCli with the declaration options', () => {
    /** Two C# declarations — the declaration pass and the `=` pass both move them. */
    const declarationInput = ['private const string Product = "symbol-align";', 'private const int DefaultPort = 5173;'].join('\n');
    /** The snippet with the declaration cells aligned at their start. */
    const startAligned = ['private const string Product     = "symbol-align";', 'private const int    DefaultPort = 5173;'].join('\n');
    /** The snippet with the types ending in one column. */
    const endAligned = ['private const string Product     = "symbol-align";', 'private const    int DefaultPort = 5173;'].join('\n');
    /** The snippet with only the `=` symbols aligned and the declaration columns untouched. */
    const symbolsOnly = ['private const string Product  = "symbol-align";', 'private const int DefaultPort = 5173;'].join('\n');
    /** The options that select the C# declaration style. */
    const csharp = ['--language', 'csharp'];

    it('aligns the declaration columns with --declarations', async () => {
        const streams = createStreams(declarationInput);

        const code = await runCli(['node', 'cli.js', ...csharp, '--declarations'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe(`${startAligned}\n`);
    });

    it('leaves the declaration columns untouched with --no-declarations', async () => {
        const streams = createStreams(declarationInput);

        const code = await runCli(['node', 'cli.js', ...csharp, '--no-declarations'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe(`${symbolsOnly}\n`);
    });

    it('lets --no-declarations override --declarations', async () => {
        const streams = createStreams(declarationInput);

        const code = await runCli(['node', 'cli.js', ...csharp, '--declarations', '--no-declarations'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe(`${symbolsOnly}\n`);
    });

    it('right-aligns the declaration cells with --declaration-anchor end', async () => {
        const streams = createStreams(declarationInput);

        const code = await runCli(['node', 'cli.js', ...csharp, '--declaration-anchor', 'end'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe(`${endAligned}\n`);
    });

    it('keeps a distant declaration cell apart with --max-declaration-pad 1', async () => {
        const streams = createStreams(declarationInput);

        const code = await runCli(['node', 'cli.js', ...csharp, '--max-declaration-pad', '1'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe(`${symbolsOnly}\n`);
    });

    it('aligns the declaration cells with a wide --max-declaration-pad', async () => {
        const streams = createStreams(declarationInput);

        const code = await runCli(['node', 'cli.js', ...csharp, '--max-declaration-pad', '24'], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe(`${startAligned}\n`);
    });

    it('passes the declaration options of the configuration through', async () => {
        await withTempDir(async (directory) => {
            const config = { language: 'csharp', groups: [['MY_STATE1', 'MY_STATE2']], declarations: true, declarationAnchor: 'end', maxDeclarationPad: 24 };
            await writeFile(join(directory, 'symbol-align.config.json'), JSON.stringify(config), 'utf-8');
            const streams = createStreams(declarationInput);

            const code = await runCli(['node', 'cli.js'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe(`${endAligned}\n`);
        });
    });

    it('lets the command line override the declaration anchor of the configuration', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'symbol-align.config.json'), JSON.stringify({ language: 'csharp', declarationAnchor: 'start' }), 'utf-8');
            const streams = createStreams(declarationInput);

            const code = await runCli(['node', 'cli.js', '--declaration-anchor', 'end'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe(`${endAligned}\n`);
        });
    });

    it('lets --declarations override a configuration that disables it', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'symbol-align.config.json'), JSON.stringify({ language: 'csharp', declarations: false }), 'utf-8');
            const streams = createStreams(declarationInput);

            const code = await runCli(['node', 'cli.js', '--declarations'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe(`${startAligned}\n`);
        });
    });

    it('lets --no-declarations override a configuration that enables it', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'symbol-align.config.json'), JSON.stringify({ language: 'csharp', declarations: true, declarationAnchor: 'end' }), 'utf-8');
            const streams = createStreams(declarationInput);

            const code = await runCli(['node', 'cli.js', '--no-declarations'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe(`${symbolsOnly}\n`);
        });
    });
});

describe('runCli with a project configuration', () => {
    it('discovers the nearest configuration file', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'symbol-align.config.json'), JSON.stringify({ symbols: [':'] }), 'utf-8');
            const streams = createStreams('a: 1\nbb: 2');

            const code = await runCli(['node', 'cli.js'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('a : 1\nbb: 2\n');
        });
    });

    it('treats an explicitly empty symbol list as align nothing', async () => {
        const streams = createStreams('a = 1\nbb = 2');

        const code = await runCli(['node', 'cli.js', '--symbols', ''], streams);

        expect(code).toBe(0);
        expect(streams.stdoutText()).toBe('a = 1\nbb = 2\n');
    });

    it('rejects a configuration file outside of the working directory', async () => {
        await withTempDir(async () => {
            const streams = createStreams('a = 1');

            const code = await runCli(['node', 'cli.js', '--config', '../outside.json'], streams);

            expect(code).toBe(1);
            expect(streams.stderrText()).toContain('Path traversal detected');
        });
    });

    it('reads the configuration file given with --config', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'custom.json'), JSON.stringify({ symbols: [':'] }), 'utf-8');
            const streams = createStreams('a: 1\nbb: 2');

            const code = await runCli(['node', 'cli.js', '--config', 'custom.json'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('a : 1\nbb: 2\n');
        });
    });

    it('lets the command line override the configuration', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'symbol-align.config.json'), JSON.stringify({ symbols: [':'] }), 'utf-8');
            const streams = createStreams('a: 1\nbb: 2');

            const code = await runCli(['node', 'cli.js', '--symbols', '='], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('a: 1\nbb: 2\n');
        });
    });

    it('applies a per file override of the configuration', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'symbol-align.config.json'), JSON.stringify({ overrides: { '*.py': { symbols: [':'] } } }), 'utf-8');
            await writeFile(join(directory, 'input.py'), 'a: 1\nbb: 2\n', 'utf-8');
            const streams = createStreams();

            const code = await runCli(['node', 'cli.js', '--file', 'input.py'], streams);

            expect(code).toBe(0);
            expect(streams.stdoutText()).toBe('a : 1\nbb: 2\n');
        });
    });

    it('reports a broken configuration file and returns 1', async () => {
        await withTempDir(async (directory) => {
            await writeFile(join(directory, 'symbol-align.config.json'), '{ not json', 'utf-8');
            const streams = createStreams('a = 1');

            const code = await runCli(['node', 'cli.js'], streams);

            expect(code).toBe(1);
            expect(streams.stderrText()).toContain('Failed to read configuration');
        });
    });
});
