# @sandlada/symbol-align — Agent Guidelines

## Project Overview

TypeScript + ESM **pnpm workspace** for the `@sandlada/symbol-align` package
(core library + CLI), living in `packages/core`. Zero runtime dependencies.

**What this project is:** a *code-snippet symbol-alignment formatter*. It pads
punctuation symbols (`=`, `:`, `=>`, `->`, `//`, `#`, …) so that they line up
vertically inside a snippet. For typed languages it can also split a
declaration into `modifiers`, `type` and `name` cells and line those cells up,
and configured groups of alternative tokens can share one column.

**What this project is not:** a general purpose code formatter. It never
reorders, rewraps, renames or reformats code the way Prettier, ESLint
(`--fix`) or Biome would. The only mutation it performs is *inserting spaces*
before a symbol so that symbols of the same kind share one column.

The workspace is laid out as `packages/*` so that more packages (e.g. a VS Code
extension) can be added later without restructuring the repository.

## Tech Stack

- **Language:** TypeScript 7 (`typescript@^7.0.2`, native compiler `tsc`)
- **Runtime:** Node.js ESM (`"type": "module"`)
- **Package manager:** pnpm (workspace + dependency `catalog`)
- **Test:** Vitest 5
- **Build:** `tsc` (TypeScript compiler) for the library, Vite for the playground
- **Lint/format:** Biome 2 (`@biomejs/biome`)
- **Dev runner:** `tsx` for the CLI, Vite for the playground

## Engineering Rules

These rules are mandatory for every change in this repository.

### 1. Latest standards, no legacy compatibility

Adopt the **latest standards and the latest technologies**. Never add
compatibility shims, transpilation fallbacks or polyfills for older versions of
Node.js, TypeScript, or any other dependency. When a newer major version is
available and the project can move to it cleanly, move — do not keep the old
code path alive "just in case".

Concretely:

- Target the current Node.js LTS and current TypeScript; use modern syntax
  (`satisfies`, `const` type parameters, `using` declarations where they help)
  instead of workarounds.
- Use the current Biome configuration format, the current Vitest API, the
  current pnpm workspace layout.
- Deprecations are removed, not guarded. Breaking changes in a pre-1.0 package
  are preferred over carrying dead weight.
- Do not add `engines` ranges, `resolutions` or polyfills that exist only to
  keep an old toolchain alive.

### 2. Functional coding

Write **functional** code. Prefer pure functions, higher-order functions,
**currying** and **trailing parameters**.

`func(a1)(a2)(a3)` is always preferred over `func(a1, a2, a3)`.

Concretely:

- Every exported function is pure unless it is explicitly documented as an
  effect (I/O, process exit, …).
- No module-level mutable state and no module-level caches. If a cache is
  genuinely needed, it must be created per call or injected.
- Data is transformed, never mutated in place. Prefer `map` / `reduce` /
  `filter` over index loops that rewrite arrays.
- Configuration flows through the *trailing* argument, so the primary value
  stays first: `align(code)(options)`, `alignWith(options)(code)`.
- Split work into small named helpers; keep functions short enough to read
  top-to-bottom.

### 3. Production-grade quality

- Every change ships with **high-quality unit tests**: one behaviour per test,
  meaningful assertions, no tautologies, no swallowed exceptions, no
  order-dependent or flaky tests.
- Public API changes come with updated README and AGENTS documentation.
- No `any`, no `@ts-ignore`, no unused exports, no dead code.

## Repository Structure

```
.
├── packages/
│   ├── core/                  # @sandlada/symbol-align — the published package
│   │   ├── src/
│   │   │   ├── types.ts       # public type contract (LanguageProfile, AlignOptions, …)
│   │   │   ├── language.ts     # language profiles: comments, strings, operators, default symbols
│   │   │   ├── vocabulary.ts   # cross-language modifier/type/keyword vocabularies
│   │   │   ├── scanner.ts      # lexical scanner — finds real code regions (strings/comments removed)
│   │   │   ├── declarations.ts # findDeclarationCells() — locates the declaration cells of a line
│   │   │   ├── finder.ts       # findSymbolPositions() — locates symbols inside code regions
│   │   │   ├── aligner.ts      # align() — vertical alignment engine
│   │   │   ├── config.ts       # symbol-align.config.json — parsing and glob overrides (pure)
│   │   │   ├── config-fs.ts   # symbol-align.config.json — discovery and loading (Node.js)
│   │   │   ├── cli.ts          # CLI implementation — pure, side effect free
│   │   │   ├── bin.ts          # executable entry point — owns the process plumbing
│   │   │   ├── index.ts        # Public API exports
│   │   │   ├── fixtures.ts     # Multi-line code test fixtures
│   │   │   ├── language.test.ts  # Language profile tests
│   │   │   ├── scanner.test.ts   # Scanner tests
│   │   │   ├── finder.test.ts    # Finder unit tests
│   │   │   ├── aligner.test.ts   # Aligner unit tests
│   │   │   ├── declarations.test.ts # Declaration locator and language classification tests
│   │   │   ├── cli.test.ts       # CLI argument/path tests
│   │   │   ├── config.test.ts    # Configuration tests
│   │   │   ├── config-fs.test.ts # Filesystem configuration tests
│   │   │   ├── runtime.test.ts   # Runtime independence guard (no Node.js builtins)
│   │   │   ├── invariants.test.ts # Property-style invariant tests over every language
│   │   │   └── fixtures.test.ts  # Fixture-driven alignment tests
│   │   ├── package.json       # Package manifest (published)
│   │   ├── schemas/            # JSON schema of symbol-align.config.json
│   │   ├── tsconfig.json      # Build config (emits to dist/)
│   │   ├── tsconfig.test.json # Type-check config (src incl. tests, no emit)
│   │   └── vitest.config.ts   # Package-level test config
│   ├── vscode/                # VS Code extension that drives the library
│   │   ├── src/
│   │   │   ├── extension.ts    # VS Code adapter (provider + commands)
│   │   │   ├── format.ts       # pure alignment logic
│   │   │   └── language.ts     # VS Code language id → library profile
│   │   ├── package.json       # Extension manifest
│   │   └── esbuild.mjs        # Bundles the extension
│   └── playground/            # Vite-powered live playground (private, not published)
│       ├── index.html         # SEO shell + static content + playground markup
│       ├── public/            # favicon, OG artwork, manifest, robots.txt
│       ├── src/
│       │   ├── main.ts        # DOM wiring and live updates
│       │   ├── model.ts       # pure options/state helpers around the core API
│       │   ├── highlight.ts   # safe inserted-space highlighting
│       │   ├── samples.ts     # exhaustive LanguageId → starter snippet map
│       │   ├── styles.css     # Fluent-inspired responsive light/dark design
│       │   └── *.test.ts      # Vitest coverage for the pure layers
│       ├── vite.config.ts     # aliases the core source for real-time testing
│       └── vitest.config.ts
├── scripts/
│   └── sync-docs.mjs          # Materializes / restores the linked doc files
├── .github/
│   └── workflows/
│       └── ci.yml             # Lint, format check, typecheck, build and test
├── biome.json                 # Biome configuration (lint + format)
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

The package has two entry points. The main entry point is free of Node.js
builtins, so it can be bundled for the browser, a worker or any other
JavaScript runtime. The helpers that touch the filesystem live in the
`@sandlada/symbol-align/node` entry point.

```ts
// @sandlada/symbol-align
align(code: string): (options?: AlignOptions) => AlignResult
alignWith(options: AlignOptions): (code: string) => AlignResult
alignSymbols(...symbols: string[]): (code: string) => AlignResult
alignLanguage(language: LanguageId): (code: string) => AlignResult
scanSource(code: string): (profile: LanguageProfile) => ScanResult
findSymbolPositions(line: string): (options: FindOptions) => ReadonlyMap<string, readonly number[]>
findDeclarationCells(line: string): (options: DeclarationOptions) => readonly DeclarationCell[] | null
parseConfig(raw: unknown): SymbolAlignConfig
resolveConfig(config: SymbolAlignConfig): (filePath?: string) => AlignOptions

// @sandlada/symbol-align/node
findConfigFile(startDir: string): string | undefined
loadConfig(startDir: string): SymbolAlignConfig | undefined
loadConfigFile(path: string): SymbolAlignConfig
```

- `AlignOptions.symbols` — symbols to align (defaults to the language profile's `defaultSymbols`)
- `AlignOptions.groups` — groups of alternative tokens, each group aligned to one column before the symbols
- `AlignGroup` — `readonly AlignSymbol[]`, one group of alternative tokens for `AlignOptions.groups`
- `AlignOptions.language` — language profile that drives string/comment handling (defaults to `generic`)
- `AlignOptions.scope` — `block` (default), `indent` or `file`
- `AlignOptions.range` — the lines that are aligned (defaults to the whole input)
- `AlignOptions.declarations` — whether the declaration columns are aligned (defaults to `true` unless the profile has no declaration style)
- `AlignOptions.declarationAnchor` — `start` (default) or `end`; which edge of a declaration cell is aligned
- `AlignOptions.maxDeclarationPad` — largest start-column difference that still joins a declaration column (default `12`; below `1` means unlimited)
- `LanguageProfile.declarations` — `prefix`, `type-first` or `none`; drives the declaration pass
- `DeclarationStyle`, `DeclarationAnchor`, `DeclarationCell` and `DeclarationOptions` — the declaration types of the locator and the profile
- `AlignResult.code` — aligned code string
- `AlignResult.changes` — number of distinct lines that were modified

## Important Behaviors

- Symbols inside `'`, `"`, `` ` `` strings are **skipped**
- Symbols inside `//` line comments and `/* */` block comments are **skipped**
- Multi-line strings and block comments are tracked **across lines**
- A line comment marker (e.g. `//`, `#`) is itself alignable when it is
  requested as a symbol
- A symbol that is only a fragment of a longer operator (`=` inside `=>` or
  `==`) is **not** aligned
- Multi-symbol alignment processes symbols in **order of first appearance**
- With `scope: 'block'` only lines of the same blank-line separated block are
  aligned with each other; with `scope: 'indent'` only the lines of the same
  nesting level are
- `range` limits the alignment to a part of the input while the rest is still
  scanned
- The declaration pass splits a line into up to three cells — `modifiers`,
  `type` and `name` — and pads only the gaps between them; the indentation of
  a line never changes
- Declaration lines are partitioned by indentation and cell shape, so a
  three-cell declaration never shares a column with a two-cell one
- `declarationAnchor: 'start'` aligns the start of every cell;
  `declarationAnchor: 'end'` pads in front of the type cell so the type
  contents end on one column. The first cell of a line is never padded, so a
  two-cell declaration has nothing to align with `end`
- `maxDeclarationPad` (default `12`) keeps one long type from setting the
  column of a whole block: only the widest cluster of start columns within the
  window is padded, the outlier keeps its column. Values below `1` mean
  unlimited
- Groups are aligned before the symbols, run in the order they are given and
  their members are removed from the symbol list; duplicate and empty members
  are ignored. The first occurrence of any member on a line defines the column
- A line whose declaration prefix (`modifiers`, `type` or `name` cell)
  contains a group member is excluded from the declaration partitions, so the
  group owns that column; a member in the initializer does not exclude it
- A group that alternates its order with another group can conflict;
  conflicting groups leave the input unchanged
- F# lexer: `(*)` and `(**)` are ordinary values, not block comment openers;
  `(* *)` nests; `$"`, `$@"`, `@$"`, `$"""` and `$$"""` are interpolated
  strings whose `{}` holes stay opaque (`$$"""` uses `{{…}}` holes); `'T` is a
  type parameter, not a character literal
- The tool **only adds spaces** (never removes)

### Language classification

57 language profiles, classified by `LanguageProfile.declarations`:

| Style        | Languages                                                                        | Reason                                                              |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `prefix`     | `c`, `cpp`, `csharp`, `dart`, `groovy`, `java`, `objectivec`, `php`              | modifiers come first, then the type and the name                    |
| `type-first` | `solidity`                                                                       | the type comes first, visibility follows (`uint256 public value`)   |
| `none`       | every other profile, including `fsharp`, `go`, `rust`, `kotlin`, `swift`, `scala`, `typescript`, `javascript` | name-first or untyped languages, or the formatter owns the spacing |

## Implementation Notes

- `scanSource()` is a single-pass lexical scanner; it is the only place that
  knows about strings and comments
- `findSymbolPositions()` only ever looks inside the code regions reported by
  the scanner
- `findDeclarationCells()` only inspects the first code region of a line; it
  tokenises that region and relies on the cross-language supersets of
  `vocabulary.ts` instead of a per-language grammar
- `declarations.ts` is conservative: a member access, a statement or a
  construct without a type returns `null` and the line stays untouched
- the declaration pass runs before the groups in every fixpoint iteration; the
  group exclusions are only computed when groups are configured, so
  `declarations: false` and the no-group output stay byte-identical
- Language specific behaviour (comment markers, string delimiters, operators)
  lives in `language.ts` — never hard-code it in the scanner or the aligner
- The aligner re-scans between symbol passes because earlier passes insert
  spaces and shift the columns of later symbols
- `changes` counts **distinct** modified lines
- CLI uses native `process.stdin` / `process.stdout` and `node:fs/promises` (no external arg parser)

## Runtime Independence

The main entry point (`index.ts`) and every module it reaches must stay free
of Node.js builtins — the package has to be bundleable for the browser, a
worker or any other JavaScript runtime.

- `cli.ts` and `config-fs.ts` are the **platform adapters**; they are the only
  modules that may import `node:` builtins
- `cli.ts` and `config-fs.ts` are **not** reachable from `index.ts` — the
  filesystem helpers are published as the `@sandlada/symbol-align/node`
  subpath export
- `runtime.test.ts` guards the invariant: it walks the module graph of
  `index.ts` and fails when a Node.js builtin is imported

## Playground

`packages/playground` is a private, Vite-only static site. It has **no runtime
dependency other than the core** (Vite is the only external package in its
manifest; TypeScript and Vitest come from the workspace root as dev tools) and
deliberately uses no UI framework, no icon pack and no syntax highlighter.

- The Vite alias resolves `@sandlada/symbol-align` to `../core/src/index.ts`,
  so the dev server doubles as a real-time test bench and the production bundle
  always contains the current core source
- The language selector is generated from `allLanguages`; `samples.ts` is typed
  as `Record<LanguageId, string>`, so a new core profile fails the build until
  it gets a starter snippet
- `main.ts` owns DOM effects; option/symbol logic and output highlighting stay
  in pure modules and are covered by Vitest
- The toolbar exposes the symbol list, the scope, declarations on/off, the
  declaration anchor, the max declaration pad and the custom groups;
  `main.ts` maps them onto `AlignOptions`
- The UI must stay free of card layouts: use full-bleed bands, hairlines and
  columns. Styles support light, dark and reduced-motion preferences
- The site must keep zero external `href`s and must not use an import map
- SEO is part of the contract: keep the title, description, Open Graph data,
  JSON-LD, semantic headings and crawlable language/FAQ content in sync

## Workspace Conventions

- Shared dependency versions live in the `catalog` section of `pnpm-workspace.yaml`
  and are referenced as `"catalog:"` from a package manifest
- `packages/core` links `README.md`, `LICENSE`, `SECURITY.md` and
  `CODE_OF_CONDUCT.md` back to the repository root copies
- `npm-packlist` skips symlinked files, so `scripts/sync-docs.mjs` replaces the
  links with real copies in `prepack` and restores them in `postpack`
- New packages are added by creating `packages/<name>/package.json` — no root
  change is required, the `packages/*` glob picks them up automatically
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` are written by pnpm and are
  excluded from the Biome configuration
- The VS Code extension pins `@types/vscode` explicitly instead of using the
  catalog, because `vsce` parses that version to validate it against
  `engines.vscode` and cannot resolve the `catalog:` protocol

## Build & Test

```bash
pnpm install        # install workspace dependencies
pnpm build          # build every package
pnpm test           # test every package
pnpm typecheck      # type-check every package (incl. tests)
pnpm lint           # lint the workspace (Biome)
pnpm format         # format the workspace (Biome)
pnpm format:check   # verify formatting without writing
pnpm clean          # remove build output

pnpm --filter @sandlada/symbol-align build   # build a single package
pnpm --filter @sandlada/symbol-align dev     # run the CLI from source
pnpm dev:playground                          # run the Vite playground (localhost:5173)
pnpm --filter @sandlada/playground build     # static site in packages/playground/dist
pnpm exec vitest run                          # run all projects from the root
```

## Release Flow

1. `pnpm --filter @sandlada/symbol-align version <major|minor|patch>`
2. `pnpm build`
3. `pnpm test`
4. `pnpm --filter @sandlada/symbol-align publish`

When modifying this project, maintain the existing conventions. If adding new symbols or behaviors, ensure tests cover both the finder and aligner layers.
