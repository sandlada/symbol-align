# Symbol Align site

The deployed site for [`@sandlada/symbol-align`](../core) — the code-snippet
symbol-alignment formatter. It runs the real core library in the browser, so it
doubles as an interactive test bench for every language profile.

- **Default input:** a realistic C# snippet.
- **Live output:** every keystroke re-runs the aligner.
- **Language selector:** all 57 core profiles; the popular programming languages load long real-world sources on demand.
- **Symbols:** toggle the common ones or add a custom symbol.
- **Scopes:** `block`, `indent` and `file`, matching `AlignOptions.scope`.
- **Diff view:** inserted spaces are highlighted in the aligned output.
- **SEO:** descriptive metadata, a canonical URL, Open Graph and Twitter data,
  a connected JSON-LD graph, static before/after examples that the test suite
  verifies with the aligner, a sitemap, `robots.txt`, a web manifest and a
  `noindex` 404 page.
- **Zero runtime dependencies:** the shipped bundle only contains the core
  library. Vite is the only external package in the site manifest; TypeScript
  and Vitest are provided by the workspace root as development-only tools.

## Run

```bash
pnpm install
pnpm --filter @sandlada/site dev       # http://localhost:5173
pnpm --filter @sandlada/site build     # static site in dist/
pnpm --filter @sandlada/site preview   # preview the production build
```

Or from the repository root:

```bash
pnpm dev:site
```

`build` assumes the core is already built, which the workspace build order
guarantees for `pnpm build`. A standalone build of only this package has to
generate the wasm payload first:

```bash
pnpm --filter @sandlada/site build:deploy
```

## Architecture

```
packages/site/
├── index.html              # SEO shell, static content, playground markup
├── public/                 # icons, social card, manifest, robots, sitemap, 404, headers
├── samples/                # vendored real-world sources + licenses
├── src/
│   ├── main.ts             # DOM wiring, live updates, keyboard interactions
│   ├── model.ts            # pure state/options helpers around the core API
│   ├── highlight.ts        # safe inserted-space highlighting
│   ├── samples.ts          # exhaustive LanguageId → starter snippet map
│   ├── styles.css          # Fluent-inspired light/dark responsive design
│   └── *.test.ts           # Vitest coverage for the pure layers and the shell
├── vite.config.ts          # aliases the core source for real-time testing
└── vitest.config.ts
```

### Why the core source is aliased

`vite.config.ts` resolves `@sandlada/symbol-align` to `../core/src/index.ts`.
That means:

- `pnpm dev:site` picks up core changes with HMR — no intermediate build.
- The production bundle always contains the current core source.
- The workspace dependency still gives pnpm the right build order, and the
  `paths` entry in `tsconfig.json` gives TypeScript the source types.

The alias is the reason a build needs `packages/core/src/generated/wasm-binary.ts`:
the core loads its wasm payload from that generated module.

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

### SEO contract

`src/seo.test.ts` is the guard rail for the shell:

- the static language list must match `allLanguages` exactly, and every
  advertised count must equal the number of profiles;
- the canonical link, `og:url`, the social image, the sitemap and the
  `robots.txt` entry must all use the same origin;
- the page must not reference a third-party resource;
- every JSON-LD node must be identified by the canonical origin, and the
  `FAQPage` questions must match the visible `<summary>` list;
- every `<figure class="recipe" data-language data-symbols>` pair is re-run
  through `align()`, so the documented output cannot drift from the core.

When the domain changes, update the origin in `index.html`,
`public/sitemap.xml`, `public/robots.txt` and `src/seo.test.ts` together; the
test fails until they agree.

### Tests

```bash
pnpm --filter @sandlada/site test
```

The suite covers the model helpers, HTML escaping, inserted-space highlighting,
the exhaustive sample map, one alignment run per language profile and the SEO
shell above. There is no browser dependency in the test suite.

## Deployment

The site is served by **Cloudflare Workers Static Assets**. The build is a
static site with absolute asset URLs (`base: '/'`), so it is served from the
domain root `https://symbol-align.sandlada.com/`.

### Configuration

`wrangler.jsonc` lives in the repository root, because `wrangler deploy` is a
repository-level tool and the single deployable is this package:

- `name: symbol-align-site`
- `assets.directory: ./packages/site/dist`
- `assets.not_found_handling: 404-page` → serves `public/404.html`
- `routes[0]`: `symbol-align.sandlada.com` with `custom_domain: true`, so the
  DNS record and the certificate are created by Cloudflare on deploy

The custom domain requires the `sandlada.com` zone to live in the same
Cloudflare account. If it does not, drop the `routes` block and attach the
domain in the dashboard instead, otherwise the deploy fails.

### One-time setup (GitHub → Workers Builds)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Worker** → **Connect to Git** (Workers Builds), and authorize the Cloudflare GitHub App for the repository.
2. Pick `sandlada/symbol-align` and the `main` branch.
3. Root directory: leave empty (the repository root).
4. Build command: `bash scripts/cloudflare-build.sh`.
5. Deploy command: leave the default `npx wrangler deploy`.
6. Save. The first build installs a minimal Rust toolchain, compiles the wasm
   core, runs `vite build` and deploys `packages/site/dist`.

`scripts/cloudflare-build.sh` is needed because the Workers build image ships
Node.js and pnpm but no Rust toolchain, while the core payload
(`packages/core/src/generated/wasm-binary.ts`) is generated and gitignored.

Every other branch produces a preview deployment on its `*.workers.dev`
preview URL; only the production branch gets the custom domain.

### Manual deploy

```bash
pnpm install
pnpm --filter @sandlada/site build:deploy
pnpm deploy:site                     # wrangler deploy
```

`pnpm deploy:site` requires a `wrangler login` (or `CLOUDFLARE_API_TOKEN`).

### What is served

| Path | Purpose |
| --- | --- |
| `/` | the single page |
| `/sitemap.xml`, `/robots.txt` | crawler entry points |
| `/404.html` | `noindex` fallback for unknown paths |
| `/_headers` | security and cache headers (not served as a file) |
| `/assets/*` | hashed Vite chunks, cached immutably |

The `Content-Security-Policy` in `_headers` has to allow
`'wasm-unsafe-eval'` in `script-src`: the page instantiates the wasm core, and
the browser refuses to compile WebAssembly without that source. Everything else
stays on `'self'`.

### Assets and brand mark

The social card is checked in as both `public/og.svg` (editable source) and
`public/og.png` (the 1200×630 image referenced by the metadata). The icon PNGs
are rasterized from `public/favicon.svg`; regenerate the set if the brand mark
changes. Both PNG files must be regenerated when `og.svg` changes.
