import { describe, it, expect } from 'vitest';
import { parseArgs, validatePath } from './cli.js';
import { resolve } from 'node:path';

describe('parseArgs', () => {
  it('returns default arguments when no flags are provided', () => {
    const argv = ['node', 'cli.js'];
    const args = parseArgs(argv);
    expect(args).toEqual({
      symbols: ['='],
      help: false,
    });
  });

  it('handles --help flag', () => {
    const argv = ['node', 'cli.js', '--help'];
    const args = parseArgs(argv);
    expect(args.help).toBe(true);
  });

  it('handles --symbols flag with space separated value', () => {
    const argv = ['node', 'cli.js', '--symbols', ':,=, =>'];
    const args = parseArgs(argv);
    expect(args.symbols).toEqual([':', '=', '=>']);
  });

  it('handles -s flag with space separated value', () => {
    const argv = ['node', 'cli.js', '-s', ':,=, =>'];
    const args = parseArgs(argv);
    expect(args.symbols).toEqual([':', '=', '=>']);
  });

  it('handles --symbols= format', () => {
    const argv = ['node', 'cli.js', '--symbols=:,=, =>'];
    const args = parseArgs(argv);
    expect(args.symbols).toEqual([':', '=', '=>']);
  });

  it('handles --symbols with empty components', () => {
    const argv = ['node', 'cli.js', '--symbols', ':, , ,='];
    const args = parseArgs(argv);
    expect(args.symbols).toEqual([':', '=']);
  });

  it('ignores --symbols flag if no value follows', () => {
    const argv = ['node', 'cli.js', '--symbols'];
    const args = parseArgs(argv);
    expect(args.symbols).toEqual(['=']); // Default
  });

  it('handles --file flag with space separated value', () => {
    const argv = ['node', 'cli.js', '--file', 'input.ts'];
    const args = parseArgs(argv);
    expect(args.file).toBe('input.ts');
  });

  it('handles -f flag with space separated value', () => {
    const argv = ['node', 'cli.js', '-f', 'input.ts'];
    const args = parseArgs(argv);
    expect(args.file).toBe('input.ts');
  });

  it('handles --file= format', () => {
    const argv = ['node', 'cli.js', '--file=input.ts'];
    const args = parseArgs(argv);
    expect(args.file).toBe('input.ts');
  });

  it('ignores --file flag if no value follows', () => {
    const argv = ['node', 'cli.js', '--file'];
    const args = parseArgs(argv);
    expect(args.file).toBeUndefined();
  });

  it('handles --output flag with space separated value', () => {
    const argv = ['node', 'cli.js', '--output', 'output.ts'];
    const args = parseArgs(argv);
    expect(args.output).toBe('output.ts');
  });

  it('handles -o flag with space separated value', () => {
    const argv = ['node', 'cli.js', '-o', 'output.ts'];
    const args = parseArgs(argv);
    expect(args.output).toBe('output.ts');
  });

  it('handles --output= format', () => {
    const argv = ['node', 'cli.js', '--output=output.ts'];
    const args = parseArgs(argv);
    expect(args.output).toBe('output.ts');
  });

  it('ignores --output flag if no value follows', () => {
    const argv = ['node', 'cli.js', '--output'];
    const args = parseArgs(argv);
    expect(args.output).toBeUndefined();
  });

  it('handles multiple flags combined', () => {
    const argv = ['node', 'cli.js', '-f', 'input.ts', '-o', 'output.ts', '-s', ':,='];
    const args = parseArgs(argv);
    expect(args).toEqual({
      file: 'input.ts',
      output: 'output.ts',
      symbols: [':', '='],
      help: false,
    });
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
