# @sandlada/symbol-align — Agent Guidelines

## Project Overview

TypeScript + ESM **pnpm workspace** for vertically aligning code symbols. The
published package is `@sandlada/symbol-align` (core library + CLI), living in
`packages/core`. Zero runtime dependencies.

The workspace is laid out as `packages/*` so that more packages (e.g. a VS Code
extension) can be added later without restructuring the repository.

## Tech Stack

- **Language:** TypeScript 7 (`typescript@^7.0.2`, native compiler `tsc`)
- **Runtime:** Node.js ESM (`"type": "module"`)
- **Package manager:** pnpm (workspace + dependency `catalog`)
- **Test:** Vitest 5
- **Build:** `tsc` (TypeScript compiler)
- **Dev runner:** `tsx`

## Repository Structure

```
.
├── packages/
│   └── core/                  # @sandlada/symbol-align — the published package
│       ├── src/
│       │   ├── types.ts       # AlignOptions, AlignResult, AlignSymbol
│       │   ├── finder.ts      # findSymbolPositions() — finds symbols outside strings/comments
│       │   ├── aligner.ts     # align() — vertical alignment core engine
│       │   ├── cli.ts         # CLI entry point (stdin / --file → stdout)
│       │   ├── index.ts       # Public API exports
│       │   ├── fixtures.ts    # Multi-line code test fixtures
│       │   ├── finder.test.ts   # Finder unit tests
│       │   ├── aligner.test.ts  # Aligner unit tests
│       │   ├── cli.test.ts      # CLI argument/path tests
│       │   └── fixtures.test.ts # Fixture-driven alignment tests
│       ├── package.json       # Package manifest (published)
│       ├── tsconfig.json      # Build config (emits to dist/)
│       ├── tsconfig.test.json # Type-check config (src incl. tests, no emit)
│       └── vitest.config.ts   # Package-level test config
├── scripts/
│   └── sync-docs.mjs          # Materializes / restores the linked doc files
├── pnpm-workspace.yaml        # Workspace packages + dependency catalog
├── tsconfig.base.json         # Shared compiler options
├── tsconfig.json              # Solution file (project references)
├── vitest.config.ts           # Root test config (projects: packages/*)
└── package.json               # Workspace root (private)
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
- Longer symbols are matched before shorter ones (e.g. `=>` before `=`)
- `changes` counter tracks how many lines were padded
- CLI uses native `process.stdin` / `process.stdout` and `node:fs/promises` (no external arg parser)

## Workspace Conventions

- Shared dependency versions live in the `catalog` section of `pnpm-workspace.yaml`
  and are referenced as `"catalog:"` from a package manifest
- `packages/core` links `README.md`, `LICENSE`, `SECURITY.md` and
  `CODE_OF_CONDUCT.md` back to the repository root copies
- `npm-packlist` skips symlinked files, so `scripts/sync-docs.mjs` replaces the
  links with real copies in `prepack` and restores them in `postpack`
- New packages are added by creating `packages/<name>/package.json` — no root
  change is required, the `packages/*` glob picks them up automatically

## Build & Test

```bash
pnpm install        # install workspace dependencies
pnpm build          # build every package
pnpm test           # test every package
pnpm typecheck      # type-check every package (incl. tests)
pnpm clean          # remove build output

pnpm --filter @sandlada/symbol-align build   # build a single package
pnpm --filter @sandlada/symbol-align dev     # run the CLI from source
pnpm exec vitest run                          # run all projects from the root
```

## Release Flow

1. `pnpm --filter @sandlada/symbol-align version <major|minor|patch>`
2. `pnpm build`
3. `pnpm test`
4. `pnpm --filter @sandlada/symbol-align publish`

When modifying this project, maintain the existing conventions. If adding new symbols or behaviors, ensure tests cover both the finder and aligner layers.
