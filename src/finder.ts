/**
 * Find positions of target symbols in a line of code,
 * skipping symbols inside strings and comments.
 */
export function findSymbolPositions(line: string, symbols: string[]): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (const sym of symbols) {
    result.set(sym, []);
  }

  if (symbols.length === 0) return result;

  // Build a map from first character to candidate symbols
  // Sort longer symbols first so e.g. '=>' matches before '='
  const sortedSymbols = [...symbols].sort((a, b) => b.length - a.length);
  const firstCharMap = new Map<string, string[]>();
  for (const sym of sortedSymbols) {
    const fc = sym[0];
    if (!firstCharMap.has(fc)) firstCharMap.set(fc, []);
    firstCharMap.get(fc)!.push(sym);
  }

  let i = 0;
  let stringQuote: string | null = null;
  let inBlockComment = false;
  const len = line.length;

  while (i < len) {
    const ch = line[i];

    // === Exit states for strings and comments ===
    if (stringQuote !== null) {
      if (ch === stringQuote && (i === 0 || line[i - 1] !== '\\')) stringQuote = null;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && i + 1 < len && line[i + 1] === '/') {
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    // === Outside strings/comments ===

    // Line comment (//) — also matches as a symbol if present
    if (ch === '/' && i + 1 < len && line[i + 1] === '/') {
      if (symbols.includes('//')) {
        result.get('//')!.push(i);
      }
      break; // rest of line is a comment
    }

    // Block comment start (/*)
    if (ch === '/' && i + 1 < len && line[i + 1] === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    // String starts
    if (ch === "'" || ch === '"' || ch === '`') {
      stringQuote = ch;
      i++;
      continue;
    }

    // Check for target symbols
    const candidates = firstCharMap.get(ch);
    if (candidates) {
      let matched = false;
      for (const sym of candidates) {
        if (line.slice(i, i + sym.length) === sym) {
          result.get(sym)!.push(i);
          i += sym.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    i++;
  }

  return result;
}
