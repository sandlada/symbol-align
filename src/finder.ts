const firstCharMapCache = new Map<string, Map<string, string[]>>();

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
  // Cache the map so we don't rebuild it on every line
  const cacheKey = symbols.join('\0');
  let firstCharMap = firstCharMapCache.get(cacheKey);
  if (!firstCharMap) {
    firstCharMap = new Map<string, string[]>();
    const sortedSymbols = [...symbols].sort((a, b) => b.length - a.length);
    for (const sym of sortedSymbols) {
      const fc = sym[0];
      if (!firstCharMap.has(fc)) firstCharMap.set(fc, []);
      firstCharMap.get(fc)!.push(sym);
    }
    firstCharMapCache.set(cacheKey, firstCharMap);
  }

  let i = 0;
  let inSingleString = false;
  let inDoubleString = false;
  let inBacktickString = false;
  let inBlockComment = false;
  const len = line.length;

  while (i < len) {
    const ch = line[i];

    // === Exit states for strings and comments ===
    if (inSingleString) {
      if (ch === "'" && (i === 0 || line[i - 1] !== '\\')) inSingleString = false;
      i++;
      continue;
    }
    if (inDoubleString) {
      if (ch === '"' && (i === 0 || line[i - 1] !== '\\')) inDoubleString = false;
      i++;
      continue;
    }
    if (inBacktickString) {
      if (ch === '`' && (i === 0 || line[i - 1] !== '\\')) inBacktickString = false;
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
    if (ch === "'") {
      inSingleString = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDoubleString = true;
      i++;
      continue;
    }
    if (ch === '`') {
      inBacktickString = true;
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
