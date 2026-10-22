# @sandlada/symbol-align

![npm version](https://img.shields.io/npm/v/@sandlada/symbol-align?label=NPM%20Version&labelColor=%2300531f&color=%23a3f5aa)
![GitHub License](https://img.shields.io/github/license/sandlada/symbol-align?label=License&labelColor=%2300531f&color=%23a3f5aa)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-%233178c6?labelColor=%232b2d2f)](https://www.typescriptlang.org/)

**A code-snippet symbol-alignment formatter.** It lines up the punctuation
symbols of a snippet — `=`, `:`, `=>`, `->`, `//`, `#`, … — so that they form
clean vertical columns.

> **This is not a code formatter.** Prettier, ESLint `--fix` and Biome rewrite
> your code: they reformat expressions, reflow long lines, normalise quotes and
> reorder nothing but everything. `symbol-align` does exactly one thing — it
> inserts spaces in front of a punctuation symbol so that the symbols of a
> block share a column. It never removes or reorders code, never touches
> string or comment content, and never changes what your snippet means.

---

## Contents

- [Packages](#packages)
- [Install](#install)
- [What it does](#what-it-does)
- [Usage](#usage)
  - [CLI](#cli)
  - [API](#api)
- [Options](#options)
- [Supported languages](#supported-languages)
- [Rules](#rules)
- [Examples](#examples)
- [CLI reference](#cli-reference)
- [Limitations](#limitations)
- [Repository structure](#repository-structure)
- [Development](#development)
- [License](#license)

## Packages

This repository is a [pnpm](https://pnpm.io) workspace (`packages/*`).

| Package                                                   | Description                          |
| --------------------------------------------------------- | ------------------------------------ |
| [`@sandlada/symbol-align`](packages/core)                 | Core library + CLI (published to npm) |

## Install

```bash
pnpm add -D @sandlada/symbol-align
```

```bash
npm install -D @sandlada/symbol-align
```

## What it does

Given a snippet:

```ts
const name = 'ada';
const greeting = 'hello';
```

it becomes:

```ts
const name     = 'ada';
const greeting = 'hello';
```

That is the whole idea. The tool:

- finds the punctuation symbols you ask for, **ignoring** the ones inside
  strings and comments;
- pads the lines so that every symbol of the same kind starts at the same
  column;
- stops there. Nothing else is touched.

Because it only ever inserts whitespace, the result is safe to run on a
snippet in an editor, a pull-request comment or a chat message.

## Usage

### CLI

Pipe code through the CLI or pass a file directly:

```bash
# Align = signs (default) — pipe mode
cat file.ts | npx symbol-align

# Align = signs — file mode
npx symbol-align --file input.ts

# Align : and = signs
npx symbol-align --file input.ts --symbols =,:

# Align => arrows
cat file.ts | npx symbol-align --symbols '=>'

# Use the conventions of a language
npx symbol-align --file main.py --language python

# Check whether a file is already aligned (exit code 1 when it is not)
npx symbol-align --file input.ts --check
```

Any symbol can be aligned — just list it with `--symbols`.

Use `--file` / `-f` for direct file input, or pipe via stdin for streaming use.
Use `--output` / `-o` to write to a file instead of stdout.
Use `--language` / `-l` to pick a language profile and `--stdin-filepath` / `-t`
to let the CLI detect the language from the path of the piped file.

### API

The API is curried: the value you transform comes first, the configuration
comes last.

```ts
import { align } from '@sandlada/symbol-align';

const result = align(
    [
        'const backgroundColor = tokens.color.surface;',
        'const textColor       = tokens.color.text.primary;',
        'const borderColor     = tokens.color.border.default;',
    ].join('\n'),
)();

console.log(result.code);
// Already aligned — no changes needed
console.log(result.changes); // 0
```

Build a reusable aligner once and apply it to many snippets:

```ts
import { alignWith, alignSymbols, alignLanguage } from '@sandlada/symbol-align';

const aligner = alignWith({ symbols: [':', '='], language: 'typescript' });
aligner(snippet);

alignSymbols('=', ':')(snippet);
alignLanguage('python')(snippet);
```

Multi-symbol alignment:

```ts
const code = ['const x: Type = 1;', 'const yy: AnotherType = 22;'].join('\n');

const { code: aligned } = align(code)({ symbols: [':', '='] });
// → const x : Type        = 1;
// → const yy: AnotherType = 22;
```

## Options

### `AlignOptions`

| Option     | Type                 | Default              | Description                                                     |
| ---------- | -------------------- | -------------------- | --------------------------------------------------------------- |
| `symbols`  | `readonly string[]`  | language defaults    | Symbols to align (e.g. `['=', ':', '=>', '//', '#']`)           |
| `language` | `LanguageId`         | `'generic'`          | Language profile that drives string and comment handling        |
| `scope`    | `'block' \| 'file'`  | `'block'`            | Which lines are aligned with each other                         |

`scope: 'block'` aligns only the lines of the same blank-line separated block
with each other — unrelated parts of a file never influence one another.
`scope: 'file'` aligns every line of the input as a single group.

### `AlignResult`

| Field     | Type     | Description                        |
| --------- | -------- | ---------------------------------- |
| `code`    | `string` | The aligned code                   |
| `changes` | `number` | Number of distinct lines modified  |

## Supported languages

The alignment itself is language agnostic — any punctuation symbol can be
aligned. What the language profile adds is the *lexical* knowledge: which
sequences start a string, which start a comment, and which operators must not
be split apart.

| Language   | Id           | Default symbol | Notable handling                                        |
| ---------- | ------------ | -------------- | ------------------------------------------------------- |
| Generic    | `generic`    | `=`            | default profile — `'`, `"`, `` ` `` strings, `//`, `/* */` |
| JavaScript | `javascript` | `=`            | template literals, `//`, `/* */`                        |
| TypeScript | `typescript` | `=`            | template literals, `//`, `/* */`                        |
| Python     | `python`     | `=`            | `#` comments, triple-quoted strings                    |
| Go         | `go`         | `=`, `:=`      | raw backtick strings, `:=`                              |
| Rust       | `rust`       | `=`            | lifetimes vs. char literals, `::`, `->`                 |
| Java       | `java`       | `=`            | `//`, `/* */`                                            |
| Kotlin     | `kotlin`     | `=`            | `//`, `/* */`                                            |
| Swift      | `swift`      | `=`            | `//`, `/* */`                                            |
| C#         | `csharp`     | `=`            | verbatim `@"…"`, raw `"""…"""`, `//`, `/* */`            |
| C++        | `cpp`        | `=`            | `//`, `/* */`, `->`, `::`                                |
| C          | `c`          | `=`            | `//`, `/* */`                                            |
| Ruby       | `ruby`       | `=`            | `#` comments, `=>`                                       |
| PHP        | `php`       | `=`            | `#` and `//` comments, `=>`, `::`                        |
| Dart       | `dart`       | `=`            | `//`, `/* */`                                            |
| Shell      | `shell`      | `=`            | `#` comments                                             |
| SQL        | `sql`        | `=`            | `--` comments, `/* */`                                   |
| YAML       | `yaml`       | `=`            | `#` comments                                             |
| JSON       | `json`       | `:`            | no comments                                              |
| CSS        | `css`        | `:`            | `/* */` comments                                          |
| HTML       | `html`       | `=`            | `<!-- -->` comments                                       |
| XML        | `xml`        | `=`            | `<!-- -->` comments                                       |
| Markdown   | `markdown`   | `=`            | no comments                                               |
| Plaintext  | `plaintext`  | `=`            | fallback profile                                          |

## Rules

- Symbols **inside strings** (`'`, `"`, `` ` ``, `"""`, …) are ignored
- Symbols **inside comments** (`//`, `#`, `/* */`, `<!-- -->`, `--`) are ignored
- Multi-line strings and block comments are tracked **across lines**
- A line comment marker (`//`, `#`, …) is alignable itself when requested
- A symbol that is only a fragment of a longer operator (`=` inside `=>` or
  `==`) is never aligned
- Lines that do not contain the symbol are left unchanged
- Multi-symbol alignment processes symbols in **order of first appearance**
- Only **adds** spaces — never removes existing spacing

## Examples

### Align `=` assignments

symbols: `=`

<table>
<tr><th>Before</th><th>After</th></tr>
<tr><td>

```ts
const a = 1;
const bb = 2;
const ccc = 3;
```

</td><td>

```ts
const a   = 1;
const bb  = 2;
const ccc = 3;
```

</td></tr>
</table>

### Align `//` comments

symbols: `//`

<table>
<tr><th>Before</th><th>After</th></tr>
<tr><td>

```ts
const a = 1; // short
const bb = 22; // longer
```

</td><td>

```ts
const a = 1;    // short
const bb = 22;  // longer
```

</td></tr>
</table>

### Align `:` type annotations

symbols: `:`

<table>
<tr><th>Before</th><th>After</th></tr>
<tr><td>

```ts
const x:  string;
const yy: number;
```

</td><td>

```ts
const x : string;
const yy: number;
```

</td></tr>
</table>

### Align `=>` arrows without touching the `=`

symbols: `=>`

<table>
<tr><th>Before</th><th>After</th></tr>
<tr><td>

```ts
const f = (x) => x;
const g = (xyz) => xyz;
```

</td><td>

```ts
const f = (x)   => x;
const g = (xyz) => xyz;
```

</td></tr>
</table>

## CLI reference

```
Usage: symbol-align [options] [< file]
       symbol-align [options] --file <path>

Vertically align punctuation symbols in a code snippet.
Reads from stdin or a file and writes to stdout.

Options:
  -f, --file <path>         Read from file instead of stdin
  -o, --output <path>       Write to file instead of stdout
  -s, --symbols <list>      Comma-separated symbols to align
  -l, --language <id>       Language profile to use
  -t, --stdin-filepath <p>  Path of the piped file (used for language detection)
      --scope <block|file>  Grouping strategy (default: block)
      --check               Exit 1 when the input is not already aligned
  -v, --version             Print the version
  -h, --help                Show this help

Examples:
  echo "a = 1\nbb = 2" | symbol-align
  cat file.ts | symbol-align --symbols =,:
  symbol-align --file input.ts
  symbol-align -f input.ts -o output.ts
  symbol-align -f input.ts --language python
```

## Limitations

- Regular expressions are not detected — symbols inside a `/…/` literal may
  still be aligned
- Only the **first** occurrence of a symbol per line is used for alignment
- The aligner never removes spaces, so it cannot un-align a snippet

## Repository structure

```
symbol-align/
├── packages/
│   └── core/               # @sandlada/symbol-align — the published package
│       ├── src/            # library + CLI sources
│       └── package.json
├── scripts/
│   └── sync-docs.mjs       # materializes / restores the linked doc files
├── pnpm-workspace.yaml     # workspace + shared dependency catalog
├── tsconfig.base.json      # shared compiler options
└── package.json            # workspace root (private)
```

Documentation files (`README.md`, `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md`)
live in the repository root. Each package links them back to the root copies so
that a document is edited in exactly one place. `scripts/sync-docs.mjs` turns the
links into real files while packing (`prepack`) and restores them afterwards
(`postpack`), because `npm-packlist` skips symlinked files.

## Development

Requires [pnpm](https://pnpm.io) 9+ (the repository pins the version in
`packageManager`).

```bash
pnpm install        # install workspace dependencies
pnpm build          # build every package (tsc)
pnpm test           # run every package's test suite (vitest)
pnpm typecheck      # type-check every package including tests
pnpm lint           # lint every package
pnpm clean          # remove build output

pnpm --filter @sandlada/symbol-align build   # build a single package
pnpm --filter @sandlada/symbol-align dev     # run the CLI from source (tsx)
```

Shared dependency versions are declared in the `catalog` section of
`pnpm-workspace.yaml` and referenced from a package with the `catalog:` protocol.

### Release

```bash
pnpm --filter @sandlada/symbol-align version <major|minor|patch>
pnpm build
pnpm test
pnpm --filter @sandlada/symbol-align publish
```

## License

MIT &mdash; see [LICENSE](LICENSE).
