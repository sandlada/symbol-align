import { describe, it, expect } from 'vitest';
import { findSymbolPositions } from './finder.js';

describe('findSymbolPositions', () => {
  it('finds a single symbol', () => {
    const result = findSymbolPositions('a = b', ['=']);
    expect(result.get('=')).toEqual([2]);
  });

  it('finds multiple symbols on the same line', () => {
    const result = findSymbolPositions('const x: Type = value', [':', '=']);
    expect(result.get(':')).toEqual([7]);
    expect(result.get('=')).toEqual([14]);
  });

  it('returns empty array for symbol not present', () => {
    const result = findSymbolPositions('const x = 1', [':']);
    expect(result.get(':')).toEqual([]);
  });

  it('skips symbols inside single-quoted strings', () => {
    const result = findSymbolPositions("const s = 'a = b'", ['=']);
    // Only the first = outside the string
    expect(result.get('=')).toEqual([8]);
  });

  it('skips symbols inside double-quoted strings', () => {
    const result = findSymbolPositions('const s = "a = b"', ['=']);
    expect(result.get('=')).toEqual([8]);
  });

  it('skips symbols inside backtick strings', () => {
    const result = findSymbolPositions('const s = `a = b`', ['=']);
    expect(result.get('=')).toEqual([8]);
  });

  it('handles escaped quotes in strings', () => {
    const result = findSymbolPositions("const s = 'a \\' = b' = c", ['=']);
    // Both = signs outside strings are found (before the string and after)
    expect(result.get('=')).toEqual([8, 21]);
  });

  it('skips symbols inside single-line comments', () => {
    const result = findSymbolPositions('const x = 1 // this = comment', ['=']);
    expect(result.get('=')).toEqual([8]);
  });

  it('skips symbols inside block comments', () => {
    const result = findSymbolPositions('const x = /* = */ 1', ['=']);
    expect(result.get('=')).toEqual([8]);
  });

  it('records // as a symbol when present in targets', () => {
    const result = findSymbolPositions('x = 1 // comment', ['=', '//']);
    expect(result.get('=')).toEqual([2]);
    expect(result.get('//')).toEqual([6]);
  });

  it('prefers longer symbol matches (=> before =)', () => {
    const result = findSymbolPositions('const f = (x) => x = 1', ['=', '=>']);
    expect(result.get('=>')).toEqual([14]);
    expect(result.get('=')).toEqual([8, 19]);
  });

  it('returns empty map for empty symbols list', () => {
    const result = findSymbolPositions('a = b', []);
    expect(result.size).toBe(0);
  });

  it('handles empty line', () => {
    const result = findSymbolPositions('', ['=']);
    expect(result.get('=')).toEqual([]);
  });

  it('finds # symbol', () => {
    const result = findSymbolPositions('x = 1 # comment', ['=', '#']);
    expect(result.get('=')).toEqual([2]);
    expect(result.get('#')).toEqual([6]);
  });

  it('finds symbols on consecutive lines with different positions', () => {
    const lines = ['a = 1', 'bb = 22'];
    const results = lines.map((l) => findSymbolPositions(l, ['=']));
    expect(results[0].get('=')).toEqual([2]);
    expect(results[1].get('=')).toEqual([3]);
  });

  it('handles block comment spanning content with symbols', () => {
    const result = findSymbolPositions('x = 1 /* comment = still */ y = 2', ['=']);
    // The = inside /* */ should be skipped
    expect(result.get('=')).toEqual([2, 30]);
  });

  it('handles nested string-like content inside backticks', () => {
    const result = findSymbolPositions('const s = `hello "${x}"` = end', ['=']);
    expect(result.get('=')).toEqual([8, 25]);
  });

  it('does not break on regex-like division', () => {
    // Simple case: /regex/ - we treat / as regular char (acceptable limitation)
    const result = findSymbolPositions('const re = /foo=bar/', ['=']);
    // Both = signs found (one before the regex-like part, one inside it)
    expect(result.get('=')).toEqual([9, 15]);
  });
});
