# @sandlada/symbol-align — Agent Guidelines

## Project Overview

TypeScript + Rust **pnpm workspace** for the `symbol-align` product. The shipped
package is the Rust core in `packages/core`: a `wasm32-unknown-unknown` module
with a thin TypeScript API wrapper and the platform adapters. It is the only
implementation in the repository, and the Vitest suite in `packages/core/src`
is the behavioural contract.

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

- **Core:** Rust (edition 2024, `serde_json` only), compiled to
  `wasm32-unknown-unknown` and inlined into the TypeScript wrapper
- **Wrapper / adapters:** TypeScript 7 (`typescript@^7.0.2`, native compiler `tsc`)
- **Runtime:** Node.js ESM (`"type": "module"`); the main entry point is
  runtime independent and also runs in browsers and workers
- **Package manager:** pnpm (workspace + dependency `catalog`)
- **Test:** Vitest 5 (the conformance suite is shared with the TypeScript core)
- **Build:** `cargo` for the wasm module, `tsc` for the wrapper, Vite for the site
- **Lint/format:** Biome 2 (`@biomejs/biome`); Rust is formatted with `cargo fmt`
- **Dev runner:** `tsx` for the CLI, Vite for the site
- **Deploy:** `wrangler` for Cloudflare Workers Static Assets (`wrangler.jsonc`)

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
│   ├── core/                  # @sandlada/symbol-align — Rust core + wasm + TS wrapper
│   │   ├── rust/              # Rust crate (edition 2024)
│   │   │   └── src/
│   │   │       ├── types.rs       # owned data model
│   │   │       ├── line.rs        # Vec<char> + UTF-16 column table
│   │   │       ├── language.rs    # profile lookup and detection
│   │   │       ├── language_data.rs # generated from languages.json
│   │   │       ├── vocabulary.rs  # cross-language keyword sets
│   │   │       ├── scanner.rs     # lexical scanner (strings/comments)
│   │   │       ├── finder.rs      # symbol finder
│   │   │       ├── declarations.rs # declaration cell locator
│   │   │       ├── aligner.rs     # alignment engine
│   │   │       ├── json.rs        # boundary payloads
│   │   │       └── abi.rs         # raw wasm ABI (alloc/dealloc/align/…)
│   │   ├── src/
│   │   │   ├── abi.ts         # inline-base64 wasm loader
│   │   │   ├── boundary.ts    # wasm trap → SymbolAlignError translation
│   │   │   ├── errors.ts      # SymbolAlignError of the public API
│   │   │   ├── aligner.ts     # curried public API around the core
│   │   │   ├── scanner.ts     # scanSource adapter
│   │   │   ├── finder.ts      # findSymbolPositions adapter
│   │   │   ├── declarations.ts # findDeclarationCells adapter
│   │   │   ├── language.ts    # generated profile table + detection
│   │   │   ├── config.ts      # symbol-align.config.json parsing (pure)
│   │   │   ├── config-fs.ts   # configuration discovery/loading (Node.js)
│   │   │   ├── cli.ts         # CLI implementation
│   │   │   ├── pipe.ts        # closed pipe and output flush of the CLI
│   │   │   ├── bin.ts         # executable entry point
│   │   │   └── index.ts       # public API exports
│   │   ├── languages.json     # single source of truth for the 57 profiles
│   │   ├── schemas/           # JSON schema of symbol-align.config.json
│   │   └── package.json
│   ├── vscode/                # VS Code extension that drives the library
│   │   ├── src/
│   │   │   ├── extension.ts    # VS Code adapter (providers + commands)
│   │   │   ├── config.ts       # configuration file + explicit settings
│   │   │   ├── edits.ts        # pure edit computation (what changes in a document)
│   │   │   ├── format.ts       # pure alignment logic
│   │   │   ├── settings.ts     # normalisation of the workspace configuration
│   │   │   ├── language.ts     # VS Code language id → library profile
│   │   │   └── testing/vscode.ts # fake editor API for the adapter tests
│   │   ├── package.json       # Extension manifest
│   │   ├── CHANGELOG.md       # Changes of the extension
│   │   └── esbuild.mjs        # Bundles the extension
│   └── site/                  # Deployed site + live playground (private, not published)
│       ├── index.html         # SEO shell + static content + playground markup
│       ├── public/            # icons, OG artwork, manifest, robots, sitemap, 404, headers
│       ├── samples/           # vendored real-world sources + licenses
│       ├── src/
│       │   ├── main.ts        # DOM wiring and live updates
│       │   ├── model.ts       # pure options/state helpers around the core API
│       │   ├── highlight.ts   # safe inserted-space highlighting
│       │   ├── samples.ts     # exhaustive LanguageId → starter snippet map
│       │   ├── styles.css     # Fluent-inspired responsive light/dark design
│       │   └── *.test.ts      # Vitest coverage for the pure layers and the SEO shell
│       ├── vite.config.ts     # aliases the core source for real-time testing
│       └── vitest.config.ts
├── scripts/
│   ├── cloudflare-build.sh    # Workers Builds build (Rust install + wasm + site)
│   └── sync-docs.mjs          # Materializes / restores the linked doc files
├── .github/
│   └── workflows/
│       └── ci.yml             # Lint, format check, typecheck, build and test
├── biome.json                 # Biome configuration (lint + format)
├── pnpm-workspace.yaml        # Workspace packages + dependency catalog
├── wrangler.jsonc             # Cloudflare Workers Static Assets for packages/site
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
SymbolAlignError: Error & { readonly operation: SymbolAlignOperation }

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
- `SymbolAlignError.operation` — the operation that failed (`align`, `scan`,
  `findSymbols`, `findDeclarations`, `profiles` or `load`); the original error
  is kept as its `cause`

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

- `packages/core` is the shipped Rust core and the only implementation in the
  repository. The Vitest suite in `packages/core/src` is the behavioural
  contract: it was copied unchanged from the TypeScript reference
  implementation during the port and is kept as-is. Never weaken a test to
  make the core pass.
- The Rust core started as a **faithful baseline port** of the original
  pipeline (re-scan per symbol pass, five-iteration fixpoint, leading-symbol
  fallback). The single-scan optimization is merged: the core scans the source
  once per `align` call and shares that scan with every pass. `pnpm bench`
  writes the reference run to `report1.md`, `pnpm bench:optimized` compares a
  run against it.
- `Line` stores `Vec<char>` plus a UTF-16 column table. Internal positions are
  character indices; public positions are UTF-16 columns. The conversion lives
  at the JSON/wasm boundary (`json.rs`, `abi.ts`). This is what keeps `😀`
  aligned like JavaScript does.
- `languages.json` is the single source of truth for the 57 profiles.
  `pnpm --filter @sandlada/symbol-align generate:languages` regenerates
  `rust/src/language_data.rs` and `src/generated/languages.ts`; a parity test
  compares the Rust table with the TypeScript table at runtime.
- The wasm module is built by `scripts/build-wasm.mjs` with plain
  `wasm32-unknown-unknown` and a hand-written C ABI (`alloc`, `dealloc`,
  `align`, `scan`, `find_symbols`, `find_declarations`, `profiles`). There is
  no wasm-bindgen and no asset file: the base64 payload is inlined into
  `src/generated/wasm-binary.ts`.
- `abi.rs` is the only module allowed to use `unsafe`; every other module is
  safe Rust. The core modules never touch the filesystem, the process or the
  environment.
- `scanSource()` is a single-pass lexical scanner; it is the only place that
  knows about strings and comments
- `findSymbolPositions()` only ever looks inside the code regions reported by
  the scanner
- `findDeclarationCells()` only inspects the first code region of a line; it
  tokenises that region and relies on the cross-language supersets of
  `vocabulary.rs` instead of a per-language grammar
- `declarations.rs` is conservative: a member access, a statement or a
  construct without a type returns `None` and the line stays untouched
- the declaration pass runs before the groups in every fixpoint iteration; the
  group exclusions are only computed when groups are configured, so
  `declarations: false` and the no-group output stay byte-identical
- Language specific behaviour (comment markers, string delimiters, operators)
  lives in `languages.json` / `language_data.rs` — never hard-code it in the
  scanner or the aligner
- The aligner scans the source once per `align` call. Every declaration, group
  and symbol pass reuses that scan: an insertion shifts the stored code regions
  and line-comment columns in place, so the next pass sees the current line
  text without re-running the lexer. Group conflict detection resolves all
  members with one finder call per line.
- The pass order and the five-iteration fixpoint are unchanged; only the scan
  is shared.
- `changes` counts **distinct** modified lines
- CLI uses native `process.stdin` / `process.stdout` and `node:fs/promises` (no external arg parser)
- `bin.ts` ends the process quietly when the reader of its output is gone
  (`symbol-align file.ts | head`) and flushes the output before it ends — a pipe
  is written asynchronously on Windows, so a process that terminates right after
  a write can lose the tail of its output
- Every call into the wasm module goes through `boundary.ts`: a trap of the Rust
  code becomes a `SymbolAlignError` that names the operation, and a payload that
  is not valid JSON becomes a `SymbolAlignError` as well. The adapters validate
  the shape of the payload they receive instead of trusting it.

## VS Code Extension

The extension in `packages/vscode` is a thin adapter around the core library.

- `extension.ts` is the only module that imports `vscode`; everything else is
  pure and unit tested (`edits.ts`, `format.ts`, `settings.ts`, `language.ts`)
- The extension registers a **document** formatter and a **range** formatter, so
  *Format Document* and *Format Selection* both align the symbols
- A range is aligned by scanning the whole document and replacing only the
  lines of the range — a string or a comment that reaches into the range stays
  untouched
- The replaced range covers the carriage return of a CRLF document, so the line
  endings of the file survive the edit
- A setting with an unknown value falls back to the default of the core
  library; `symbolAlign.maxDeclarationPad` accepts `0` for "unlimited"
- A failure of the core is reported as a notification — the provider never
  throws into the extension host
- The extension reads the `symbol-align.config.json` of the workspace folder of
  the document; a setting that the user set explicitly wins over the file
- The unit tests alias `@sandlada/symbol-align` to the source of the core, so
  they never run against a stale build
- `src/testing/vscode.ts` is the fake editor API of the tests; the Vitest
  config aliases `vscode` to it, so the adapter itself is covered. The fake is
  a test double — it is never part of the bundle

## Runtime Independence

The main entry point (`index.ts`) and every module it reaches must stay free
of Node.js builtins — the package has to be bundleable for the browser, a
worker or any other JavaScript runtime.

- `cli.ts` and `config-fs.ts` are the **platform adapters**; they are the only
  modules that may import `node:` builtins
- `cli.ts` and `config-fs.ts` are **not** reachable from `index.ts` — the
  filesystem helpers are published as the `@sandlada/symbol-align/node`
  subpath export
- `abi.ts` instantiates the inline wasm payload synchronously with the
  `WebAssembly` global and the platform `TextEncoder` / `TextDecoder`; it must
  never import `node:fs` or rely on `Buffer`
- `runtime.test.ts` guards the invariant: it walks the module graph of
  `index.ts` and fails when a Node.js builtin is imported

## Site

`packages/site` is a private, Vite-only static site, deployed to Cloudflare
Workers Static Assets at <https://symbol-align.sandlada.com/>. It has **no
runtime dependency other than the core** (Vite is the only external package in
its manifest; TypeScript and Vitest come from the workspace root as dev tools)
and deliberately uses no UI framework, no icon pack and no syntax highlighter.

- The Vite alias resolves `@sandlada/symbol-align` to `../core/src/index.ts`,
  so the dev server doubles as a real-time test bench and the production bundle
  always contains the current core source
- The language selector is generated from `allLanguages`; `samples.ts` is typed
  as `Record<LanguageId, string>`, so a new core profile fails the build until
  it gets a starter snippet
- The popular programming languages load real, long source files from
  `packages/site/samples` through dynamic `?raw` imports; only the default
  C# file is in the initial bundle, the rest are split into per-language chunks
- `main.ts` owns DOM effects; option/symbol logic and output highlighting stay
  in pure modules and are covered by Vitest
- The toolbar exposes the symbol list, the scope, declarations on/off, the
  declaration anchor, the max declaration pad and the custom groups;
  `main.ts` maps them onto `AlignOptions`
- The UI must stay free of card layouts: use full-bleed bands, hairlines and
  columns. Styles support light, dark and reduced-motion preferences
- The site must reference no third-party resource: the only absolute `href` is
  the canonical link, and there is no import map
- SEO is part of the contract: keep the title, description, Open Graph data,
  JSON-LD, semantic headings and crawlable language/FAQ content in sync.
  `seo.test.ts` pins the canonical origin in `index.html`, `public/sitemap.xml`,
  `public/robots.txt` and re-runs every documented before/after pair through
  `align()`, so the marketing examples cannot drift from the core

## Deployment

- `wrangler.jsonc` in the repository root is the only deployment configuration:
  `name: symbol-align-site`, `assets.directory: ./packages/site/dist`,
  `assets.not_found_handling: 404-page` and the `symbol-align.sandlada.com`
  custom domain
- The site is published on Cloudflare Workers Static Assets, not Pages; Pages is
  in maintenance mode and cannot declare a custom domain in Wrangler
- Workers Builds connects the repository through the dashboard. The build
  command is `bash scripts/cloudflare-build.sh` because the build image ships
  Node.js and pnpm but no Rust toolchain, and
  `packages/core/src/generated/wasm-binary.ts` is generated and gitignored
- The build output is a plain static site with `base: '/'`; there is no server
  component, no Function and no data leaving the browser
- `public/_headers` owns the security and cache policy: immutable hashing for
  `/assets/*`, revalidating HTML, no third-party origins in the CSP, and
  `'wasm-unsafe-eval'` in `script-src` because the page instantiates the wasm
  core (without it the page renders and never aligns)
- Keep `public/og.png` and `public/og.svg` in sync: the metadata references the
  PNG, the SVG is the editable source

## Workspace Conventions

- Shared dependency versions live in the `catalog` section of `pnpm-workspace.yaml`
  and are referenced as `"catalog:"` from a package manifest
- `packages/core` is the only published package; it links `README.md`,
  `CHANGELOG.md`, `LICENSE`, `SECURITY.md` and `CODE_OF_CONDUCT.md` back to the
  repository root copies
- `npm-packlist` skips symlinked files, so `scripts/sync-docs.mjs` replaces the
  `packages/core` links with real copies in `prepack` and restores them in
  `postpack`; the workspace-only packages are never touched
- New packages are added by creating `packages/<name>/package.json` — no root
  change is required, the `packages/*` glob picks them up automatically
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` are written by pnpm and are
  excluded from the Biome configuration
- `packages/core/rust/Cargo.lock` is committed so the wasm build is
  reproducible; `packages/core/src/generated/wasm-binary.ts` is generated and
  gitignored
- The VS Code extension pins `@types/vscode` explicitly instead of using the
  catalog, because `vsce` parses that version to validate it against
  `engines.vscode` and cannot resolve the `catalog:` protocol

## Build & Test

```bash
pnpm install        # install workspace dependencies
pnpm build          # build every package (Rust wasm + tsc)
pnpm test           # test every package
pnpm typecheck      # type-check every package (incl. tests)
pnpm lint           # lint the workspace (Biome)
pnpm format         # format the workspace (Biome)
pnpm format:check   # verify formatting without writing
pnpm clean          # remove build output
pnpm bench          # write report1.md (baseline performance report)

pnpm --filter @sandlada/symbol-align build      # build the Rust core + wrapper
pnpm --filter @sandlada/symbol-align dev        # run the CLI from source
pnpm dev:site                                   # run the Vite site (localhost:5173)
pnpm --filter @sandlada/site build:deploy       # wasm core + static site
pnpm deploy:site                                # wrangler deploy (packages/site)
pnpm exec vitest run                            # run all projects from the root

cargo test --manifest-path packages/core/rust/Cargo.toml          # Rust unit tests
cargo clippy --manifest-path packages/core/rust/Cargo.toml -- -D warnings
```

The Rust wasm build requires the `wasm32-unknown-unknown` target:

```bash
rustup target add wasm32-unknown-unknown
```

On a Windows host without the MSVC linker, use the GNU toolchain
(`RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu`) or install the Visual Studio
C++ build tools.

## Release Flow

1. `pnpm --filter @sandlada/symbol-align version <major|minor|patch>`
2. `pnpm build`
3. `pnpm test`
4. `pnpm --filter @sandlada/symbol-align publish`

When modifying this project, maintain the existing conventions. If adding new symbols or behaviors, ensure tests cover both the finder and aligner layers.
