# @sandlada/symbol-align — Agent Guidelines

## Project Overview

TypeScript + ESM project for vertically aligning code symbols. Published as `@sandlada/symbol-align` on npm. Zero runtime dependencies.

## Tech Stack

- **Language:** TypeScript (target: `ES2022`, module: `NodeNext`)
- **Runtime:** Node.js ESM (`"type": "module"`)
- **Test:** Vitest
- **Build:** `tsc` (TypeScript compiler)
- **Dev runner:** `tsx`

## Project Structure

```
src/
├── types.ts          # AlignOptions, AlignResult, AlignSymbol
├── finder.ts         # findSymbolPositions() — finds symbols outside strings/comments
├── aligner.ts        # align() — vertical alignment core engine
├── cli.ts            # CLI entry point (stdin / --file → stdout)
├── index.ts          # Public API exports
├── fixtures.ts       # Multi-line code test fixtures
├── finder.test.ts    # Finder unit tests
├── aligner.test.ts   # Aligner unit tests
└── fixtures.test.ts  # Fixture-driven alignment tests
```

## Key Conventions

| Rule        | Value                                        |
| ----------- | -------------------------------------------- |
| Indent      | 4 spaces                                     |
| Quotes      | single                                       |
| Line width  | 240 (`.ts`)                                  |
| Exports     | Named exports only                           |
| import      | ESM with `.js` extension in relative imports |
| Blank lines | Separate logical code sections               |

## API Surface

```ts
align(code: string, options?: AlignOptions): AlignResult
```

- `AlignOptions.symbols` — array of strings to align (default `['=']`)
- `AlignResult.code` — aligned code string
- `AlignResult.changes` — number of lines modified

## Important Behaviors

- Symbols inside `'`, `"`, `` ` `` strings are **skipped**
- Symbols inside `//` line comments and `/* */` block comments are **skipped**
- `//` detection: when `//` is in the target symbols list, it is recorded as an alignable symbol, then the rest of the line is treated as a comment
- Multi-symbol alignment: symbols are processed sequentially in order of first appearance
- The tool **only adds spaces** (never removes)

## Implementation Notes

- `findSymbolPositions()` uses a simple state machine (not a full parser)
- Regex `/.../` is not detected — symbols inside regex may be matched
- Longer symbols are matched before shorter ones (e.g., `=>` before `=`)
- `changes` counter tracks how many lines were padded
- CLI uses native `process.stdin` / `process.stdout` and `node:fs/promises` (no external arg parser)

## Build & Test

```bash
npm run build     # tsc → dist/
npm test          # vitest run
npm run test:watch # vitest (watch mode)
npm run dev       # tsx (run .ts directly)
```

## Release Flow

1. `npm version <major|minor|patch>`
2. `npm run build`
3. `npm test`
4. `npm publish`

When modifying this project, maintain the existing conventions. If adding new symbols or behaviors, ensure tests cover both the finder and aligner layers.
