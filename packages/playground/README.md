# Symbol Align Playground

A live, no-framework playground for [`@sandlada/symbol-align`](../core) — the
code-snippet symbol-alignment formatter. It runs the real core library in the
browser, so it doubles as an interactive test bench for every language profile.

- **Default input:** a realistic C# snippet.
- **Live output:** every keystroke re-runs the aligner.
- **Language selector:** all 57 core profiles; the popular programming languages load long real-world sources on demand.
- **Symbols:** toggle the common ones or add a custom symbol.
- **Scopes:** `block`, `indent` and `file`, matching `AlignOptions.scope`.
- **Diff view:** inserted spaces are highlighted in the aligned output.
- **SEO:** descriptive metadata, Open Graph data, JSON-LD, semantic content,
  `robots.txt` and a web manifest.
- **Zero runtime dependencies:** the shipped bundle only contains the core
  library. Vite is the only external package in the playground manifest;
  TypeScript and Vitest are provided by the workspace root as development-only
  tools.

## Run

```bash
pnpm install
pnpm --filter @sandlada/playground dev       # http://localhost:5173
pnpm --filter @sandlada/playground build     # static site in dist/
pnpm --filter @sandlada/playground preview   # preview the production build
```

Or from the repository root:

```bash
pnpm dev:playground
```

## Architecture

```
packages/playground/
├── index.html              # SEO shell, static content, playground markup
├── public/                 # favicon, Open Graph artwork, manifest, robots.txt
├── samples/                # vendored real-world sources + licenses
├── src/
│   ├── main.ts             # DOM wiring, live updates, keyboard interactions
│   ├── model.ts            # pure state/options helpers around the core API
│   ├── highlight.ts        # safe inserted-space highlighting
│   ├── samples.ts          # exhaustive LanguageId → starter snippet map
│   ├── styles.css          # Fluent-inspired light/dark responsive design
│   └── *.test.ts           # Vitest coverage for the pure layers
├── vite.config.ts          # aliases the core source for real-time testing
└── vitest.config.ts
```

### Why the core source is aliased

`vite.config.ts` resolves `@sandlada/symbol-align` to `../core/src/index.ts`.
That means:

- `pnpm dev:playground` picks up core changes with HMR — no intermediate build.
- The production bundle always contains the current core source.
- The workspace dependency still gives pnpm the right build order, and the
  `paths` entry in `tsconfig.json` gives TypeScript the source types.

### Adding a language

Add its starter snippet to `samples.ts`. The map is typed as
`Record<LanguageId, string>`, so a new core profile fails type-checking until it
gets a sample. The language selector itself is generated from `allLanguages` at
runtime.

The popular programming languages - C#, TypeScript, JavaScript, Python, Go,
Rust, Java, Kotlin, Swift and C++ - use real, unmodified source files from their
ecosystems, vendored under `samples/` together with their licenses. The C#
entry is the .NET runtime's `JsonSerializerOptions.cs`, so the default
playground opens on a realistic 1,253-line file instead of a toy snippet. The
other real-world files are loaded on demand, so the initial bundle only carries
the C# sample.

### Tests

```bash
pnpm --filter @sandlada/playground test
```

The suite covers the model helpers, HTML escaping, inserted-space highlighting,
the exhaustive sample map, and one alignment run per language profile. There is
no browser dependency in the test suite.

### Deployment

The build is a static site with relative asset URLs (`base: './'`), so
`packages/playground/dist` can be served from any static host, including a
subdirectory. There is no server component and no data leaves the browser.

The social card is checked in as both `public/og.svg` (editable source) and
`public/og.png` (the 1200×630 image referenced by the metadata). The icon PNGs
are rasterized from `public/favicon.svg`; regenerate the set if the brand mark
changes. Add an absolute canonical/`og:url` at deploy time if the site gets a
stable public URL.
