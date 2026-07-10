import { describe, it, expect } from 'vitest';
import { align } from './aligner.js';

describe('align', () => {
  it('aligns = signs', () => {
    const input = 'const foo = 1\nconst foobar = 22';
    const result = align(input);
    expect(result.code).toBe('const foo    = 1\nconst foobar = 22');
    expect(result.changes).toBe(1);
  });

  it('aligns : signs', () => {
    const input = 'const x: string;\nconst yy: number;';
    const result = align(input, { symbols: [':'] });
    expect(result.code).toBe('const x : string;\nconst yy: number;');
    expect(result.changes).toBe(1);
  });

  it('aligns => arrows', () => {
    const input = 'const f = (x) => x;\nconst g = (xyz) => xyz;';
    const result = align(input, { symbols: ['=>'] });
    expect(result.code).toBe('const f = (x)   => x;\nconst g = (xyz) => xyz;');
    expect(result.changes).toBe(1);
  });

  it('aligns // comments', () => {
    const input = 'const a = 1;  // short\nconst bb = 22; // longer';
    const result = align(input, { symbols: ['//'] });
    expect(result.code).toBe('const a = 1;   // short\nconst bb = 22; // longer');
    expect(result.changes).toBe(1);
  });

  it('aligns # symbols (Python-style comments)', () => {
    const input = 'a = 1   # short\nbb = 22 # longer';
    const result = align(input, { symbols: ['#'] });
    expect(result.code).toBe('a = 1   # short\nbb = 22 # longer');
    expect(result.changes).toBe(0); // already aligned
  });

  it('handles multi-symbol alignment in order', () => {
    const input = 'const x: Type = 1;\nconst yy: AnotherType = 22;';
    const result = align(input, { symbols: [':', '='] });

    // : align: line 0 gets 1 space padding (col 7→8)
    // = align: line 0 gets padding to match line 1's = position
    const lines = result.code.split('\n');
    expect(lines[0]).toContain(': Type');
    expect(lines[1]).toContain('const yy: AnotherType = 22;');
    expect(result.changes).toBe(2);
  });

  it('skips symbols inside strings', () => {
    const input = "const msg = 'hello = world';\nconst greeting = 'hi';";
    const result = align(input);
    expect(result.code).toBe("const msg      = 'hello = world';\nconst greeting = 'hi';");
    expect(result.changes).toBe(1);
  });

  it('skips symbols inside comments', () => {
    const input = 'const a = 1; /* = */\nconst bb = 2;';
    const result = align(input);
    expect(result.code).toBe('const a  = 1; /* = */\nconst bb = 2;');
    expect(result.changes).toBe(1);
  });

  it('handles empty input', () => {
    const result = align('');
    expect(result.code).toBe('');
    expect(result.changes).toBe(0);
  });

  it('handles single line (no alignment needed)', () => {
    const result = align('const x = 1;');
    expect(result.code).toBe('const x = 1;');
    expect(result.changes).toBe(0);
  });

  it('handles lines without the target symbol', () => {
    const input = 'const x = 1;\n\nconst y = 2;';
    const result = align(input);
    expect(result.code).toBe('const x = 1;\n\nconst y = 2;');
    expect(result.changes).toBe(0); // already aligned
  });

  it('handles custom symbols', () => {
    const input = 'a | b\ncc | ddd';
    const result = align(input, { symbols: ['|'] });
    expect(result.code).toBe('a  | b\ncc | ddd');
    expect(result.changes).toBe(1);
  });

  it('does not modify already-aligned code', () => {
    const input = 'const foo    = 1;\nconst foobar = 22;';
    const result = align(input);
    expect(result.code).toBe(input);
    expect(result.changes).toBe(0);
  });

  it('handles real-world multi-line assignment', () => {
    const input = [
      'const backgroundColor = tokens.color.surface.base;',
      'const textColor       = tokens.color.text.primary;',
      'const borderColor     = tokens.color.border.default;',
    ].join('\n');
    const result = align(input);
    // Already aligned, no changes
    expect(result.changes).toBe(0);
  });

  it('handles mixed alignment with multiple symbols on same line', () => {
    const input = [
      'export const x: Type = 1;',
      'export const yy: Another = 22;',
    ].join('\n');
    const result = align(input, { symbols: [':', '='] });

    // : align: line 0 gets padding
    // = align: line 0 gets padding to match line 1's = position
    const lines = result.code.split('\n');
    expect(lines[0]).toContain(': Type');
    expect(lines[1]).toBe('export const yy: Another = 22;');
    expect(result.changes).toBe(2);
  });
});
