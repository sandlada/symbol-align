import { findSymbolPositions } from './finder.js';
import type { AlignOptions, AlignResult } from './types.js';

/**
 * Vertically aligns target symbols in a block of code.
 *
 * For each symbol, finds its first meaningful position (outside strings/comments)
 * on every line, then pads with spaces so all occurrences align to the same column.
 * Multi-symbol lines are processed sequentially by order of first appearance.
 */
export function align(code: string, options?: AlignOptions): AlignResult {
  const symbols = options?.symbols ?? ['='];

  const lines = code.split('\n');
  if (lines.length === 0) {
    return { code, changes: 0 };
  }

  // Determine processing order by first occurrence in the code
  const firstOccurrence = new Map<string, number>();
  for (const line of lines) {
    const positions = findSymbolPositions(line, symbols);
    for (const [sym, cols] of positions) {
      if (cols.length > 0 && !firstOccurrence.has(sym)) {
        firstOccurrence.set(sym, cols[0]);
      }
    }
  }

  // Sort symbols: first appearance order, then by length (stable for equal)
  const orderedSymbols = [...symbols].sort((a, b) => {
    const aOcc = firstOccurrence.get(a) ?? Infinity;
    const bOcc = firstOccurrence.get(b) ?? Infinity;
    if (aOcc !== bOcc) return aOcc - bOcc;
    return 0;
  });

  let changes = 0;

  for (const sym of orderedSymbols) {
    const symPositions: (number | null)[] = lines.map((line) => {
      const positions = findSymbolPositions(line, [sym]);
      const cols = positions.get(sym)!;
      return cols.length > 0 ? cols[0] : null;
    });

    // Find the rightmost column where this symbol appears
    let maxCol = 0;
    for (const pos of symPositions) {
      if (pos !== null && pos > maxCol) {
        maxCol = pos;
      }
    }

    // If no line has this symbol at all, skip
    if (symPositions.every(p => p === null)) continue;

    // Keyword padding: if this symbol acts as a prefix keyword on lines that have it,
    // pad non-blank lines without it so their content starts at the column after the keyword.
    // Only pads lines at the SAME indentation level as lines with the keyword.
    const hasLineWith = symPositions.some(p => p !== null);
    const hasLineWithout = symPositions.some((p, i) => p === null && lines[i].trim().length > 0);
    if (hasLineWith && hasLineWithout) {
      const allPrefix = lines.every((line, i) => {
        if (symPositions[i] === null) return true;
        return line.trimStart().startsWith(sym);
      });
      // Find common leading whitespace of lines that have the symbol
      let symbolIndent = -1;
      let sameIndent = true;
      for (let i = 0; i < lines.length; i++) {
        if (symPositions[i] === null) continue;
        const indent = lines[i].length - lines[i].trimStart().length;
        if (symbolIndent === -1) {
          symbolIndent = indent;
        } else if (indent !== symbolIndent) {
          sameIndent = false;
          break;
        }
      }
      if (allPrefix && sameIndent) {
        const targetIndent = maxCol + sym.length + 1;
        for (let i = 0; i < lines.length; i++) {
          if (symPositions[i] !== null) continue;
          const line = lines[i];
          if (line.trim().length === 0) continue;
          const currentIndent = line.length - line.trimStart().length;
          if (currentIndent !== symbolIndent) continue;
          const neededPad = targetIndent - currentIndent;
          if (neededPad > 0) {
            lines[i] = ' '.repeat(neededPad) + line;
            changes++;
          }
        }
      }
    }

    // Pad lines whose symbol appears before maxCol
    for (let i = 0; i < lines.length; i++) {
      const pos = symPositions[i];
      if (pos === null) continue;

      const needed = maxCol - pos;
      if (needed > 0) {
        const line = lines[i];
        lines[i] = line.slice(0, pos) + ' '.repeat(needed) + line.slice(pos);
        changes++;
      }
    }
  }

  return { code: lines.join('\n'), changes };
}
