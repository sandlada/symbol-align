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
- [How it works](#how-it-works)
- [Options](#options)
- [Declarations](#declarations)
- [Custom groups](#custom-groups)
- [Supported languages](#supported-languages)
- [Rules](#rules)
- [Examples](#examples)
- [CLI reference](#cli-reference)
- [Configuration](#configuration)
- [Recipes](#recipes)
- [Migration](#migration)
- [Limitations](#limitations)
- [Repository structure](#repository-structure)
- [Development](#development)
- [License](#license)

## Packages

This repository is a [pnpm](https://pnpm.io) workspace (`packages/*`).

| Package                                                   | Description                            |
| --------------------------------------------------------- | -------------------------------------- |
| [`@sandlada/symbol-align`](packages/core)                 | Rust core (wasm) + TypeScript API + CLI |
| [`@sandlada/symbol-align-ts`](packages/core-ts)           | TypeScript reference implementation     |
| [Symbol Align](packages/vscode)                            | VS Code extension                      |
| [Playground](packages/playground)                          | Vite-powered live playground           |

The shipped package is the Rust core in `packages/core`. It compiles to a
single `wasm32-unknown-unknown` module that is inlined into the TypeScript
wrapper, so the same package runs in Node.js, the browser, a worker and the
VS Code extension host. `packages/core-ts` is the original TypeScript
implementation and the behavioural reference of the conformance suite.

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

# Align = signs — rewrite the file in place
npx symbol-align --file input.ts --write

# Align : and = signs
npx symbol-align --file input.ts --symbols =,:

# Align => arrows
cat file.ts | npx symbol-align --symbols '=>'

# Show what would change
npx symbol-align --file input.ts --diff

# Use the conventions of a language
npx symbol-align --file main.py --language python

# Check whether a file is already aligned (exit code 1 when it is not)
npx symbol-align --file input.ts --check
```

Any symbol can be aligned — just list it with `--symbols`.

Use `--file` / `-f` for direct file input (repeat it to align several files),
or pipe via stdin for streaming use. Use `--output` / `-o` to write to a file
instead of stdout and `--write` to rewrite the input file. Use
`--language` / `-l` to pick a language profile and `--stdin-filepath` / `-t`
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

The package has two entry points:

| Entry point                            | Contents                                              | Node.js builtins |
| -------------------------------------- | ----------------------------------------------------- | ---------------- |
| `@sandlada/symbol-align`               | The aligner, the language profiles, the configuration | no               |
| `@sandlada/symbol-align/node`          | The helpers that read a configuration from disk       | yes              |

The main entry point is free of Node.js builtins, so it can be bundled for the
browser, a worker or any other JavaScript runtime. The helpers that touch the
filesystem live in the `/node` entry point — see [Configuration](#configuration).

## How it works

1. **Scan.** The snippet is scanned once with the rules of the language profile.
   The scanner knows the comment markers and the string delimiters of the
   language and reports the regions that hold *real code*. Everything else —
   string content, block comments, Python docstrings, Go raw strings — is
   invisible to the aligner.
2. **Find.** For every symbol you asked for, the finder locates its first
   occurrence inside those code regions. A match that is only a fragment of a
   longer operator (`=` inside `=>`, `==`, `:=`, `>=`) is discarded, and a word
   symbol must stand on its own (`readonly` never matches `readonlyThing`).
3. **Group.** The lines are split into groups. With `scope: 'block'` a group is
   a blank-line separated block, with `scope: 'indent'` it is a run of lines
   with the same indentation and with `scope: 'file'` it is the whole input.
   Only the lines of the same group are aligned with each other, so unrelated
   parts of a file never influence one another.
4. **Align.** The declaration columns are aligned first, then the configured
   token groups, and finally every symbol in the order of its first appearance.
   For each target the lines of a block are padded until the target starts at
   the same column — only spaces are ever inserted.

Because the scanner understands the language, the result is stable: running
the formatter twice never changes the snippet a second time.

## Options

### `AlignOptions`

| Option     | Type                 | Default              | Description                                                     |
| ---------- | -------------------- | -------------------- | --------------------------------------------------------------- |
| `symbols`  | `readonly string[]`  | language defaults    | Symbols to align (e.g. `['=', ':', '=>', '//', '#']`)           |
| `groups`   | `readonly string[][]` | `[]`                | Groups of alternative tokens that share one alignment column    |
| `language` | `LanguageId`         | `'generic'`          | Language profile that drives string and comment handling        |
| `scope`    | `'block' \| 'indent' \| 'file'` | `'block'`  | Which lines are aligned with each other                         |
| `range`    | `LineRange`          | the whole input      | The lines that are aligned                                      |
| `declarations` | `boolean`         | `true` when the profile has a declaration style | Whether the declaration columns are aligned |
| `declarationAnchor` | `'start' \| 'end'` | `'start'`     | Which edge of a declaration cell is aligned                     |
| `maxDeclarationPad` | `number`       | `12`                 | Largest start-column difference that still joins a declaration column |

Three grouping strategies are available:

- `block` — only the lines of the same blank-line separated block are aligned
  with each other, whatever their indentation is. This is the default.
- `indent` — only consecutive lines with the same indentation are aligned with
  each other, so every nesting level keeps its own column. Use this for code
  that is indented with tabs.
- `file` — every line of the input is aligned as a single group.

`range` limits the alignment to a part of the input. The rest of the text is
still scanned, so a string or a comment that reaches into the range is
recognised — that is what an editor needs when the user selects a few lines.

### `AlignResult`

| Field     | Type     | Description                        |
| --------- | -------- | ---------------------------------- |
| `code`    | `string` | The aligned code                   |
| `changes` | `number` | Number of distinct lines modified  |

## Declarations

Typed languages have a declaration column of their own. When the language
profile knows how a declaration is laid out, `symbol-align` splits a line into
three cells and pads the gaps between them:

```text
private const string Product = "value";
└ modifiers ┘ └type─┘ └name─┘
```

| Cell        | Contents                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| `modifiers` | `private`, `const`, `static`, `readonly`, `public`, …                         |
| `type`      | `string`, `int`, `MyApp.Order`, `Map<String, List<Integer>>`, `(int, string)` |
| `name`      | The declared identifier                                                      |

Only the *first code region* of a line is inspected, so a keyword or a symbol
inside a string or a comment never starts a declaration. The pass only adds
spaces between the cells — the indentation of a line never changes.

Lines are aligned with lines of the same indentation and the same cell shape.
A `private const string` declaration is therefore never lined up with a
two-cell `int x;` declaration.

### Declaration anchors

`declarationAnchor` decides which edge of a cell is aligned:

`start` (default) makes the content of every cell start on the same column:

```cs
private const string Product     = "value";
private const int    DefaultPort = 8080;
```

`end` pads the gap in front of the type cell, so the type contents end on the
same column:

```cs
private const string Product     = "value";
private const    int DefaultPort = 8080;
```

The first cell of a line is never padded — that would change the indentation —
so a two-cell declaration has nothing to align with `end`.

### `maxDeclarationPad`

A single long type must not drag every name of a block with it. The default
`maxDeclarationPad` is `12`: only start columns within a window of 12
characters join one declaration column, and the window that covers the most
lines wins. The outlier keeps its column:

```java
public static int  shortName;
public static long mediumName;
public static Map<String, List<Integer>> outlierName;
```

A larger `maxDeclarationPad` pulls the outlier into the same column:

```java
public static int                        shortName;
public static long                       mediumName;
public static Map<String, List<Integer>> outlierName;
```

In the API a value below `1` (or a non-finite value) means unlimited. The CLI
and the VS Code setting require a positive integer.

### No type dictionary

The locator does not know the types of your project. It tokenises the first
code region and treats the span between the modifiers and the name as one
*type* cell, balancing brackets while it goes. That is why custom types,
generics, arrays, nullable markers and tuples work without configuration:

| Declaration                                          | Type cell                          |
| ---------------------------------------------------- | ---------------------------------- |
| `Product item;`                                      | `Product`                          |
| `Dictionary<string, int> map;`                       | `Dictionary<string, int>`          |
| `Product[] items;`                                   | `Product[]`                        |
| `int? maybe;`                                        | `int?`                             |
| `(int, string) pair;`                                | `(int, string)`                    |
| `std::vector<std::pair<int, int>> values;`           | `std::vector<std::pair<int, int>>` |

A `*`, `&`, `^` or `?` that touches the name belongs to the *name* cell
(`char *name` declares a pointer, while `a * b` is a multiplication).

A line with two possible readings — a member access (`foo.bar = 1;`), a
statement (`x = 1;`) or a construct without a type — is not a declaration and
is left untouched. Under-aligning is always preferred over moving the wrong
cell.

### Language classification

Every language profile declares one of three styles:

| Style        | Languages                                                                   | Why                                                        |
| ------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `prefix`     | C#, C++, C, Java, Objective-C, PHP, Dart, Groovy                            | modifiers, then type, then name                            |
| `type-first` | Solidity                                                                    | the type comes first, visibility follows it                |
| `none`       | every other profile, including Go, Rust, Kotlin, Swift, Scala, F#, TypeScript | no fixed modifier/type/name prefix, or no type at all      |

`none` is not an omission. Name-first languages have no fixed prefix column,
data and markup languages (JSON, YAML, CSS, SQL) have no type segment, and
formatters such as gofmt or Prettier already own declaration spacing. Turning
declarations on there would guess, so the profile keeps the legacy output.

`declarations` defaults to `true` for a profile that has a style and is a no-op
for `none`. Set `declarations: false` to get exactly the output of the
previous versions.

## Custom groups

A custom group lines up alternative tokens in one column. Give the group its
members and the first occurrence of any member on a line is padded to the
group column:

```ts
// before
let status = MY_STATE1;
let longName = MY_STATE2;
```

```ts
// after — symbols: [], groups: [['MY_STATE1', 'MY_STATE2']]
let status =   MY_STATE1;
let longName = MY_STATE2;
```

The group is useful for enum-like constants, alternative keywords or any set of
tokens that should share a column. The interaction rules are:

- Every alignment pass runs the declaration columns first, then the groups in
  the order they are given, then the symbols; the whole sequence repeats to a
  fixpoint.
- A token that appears in a group is removed from the symbol list, so the two
  passes never pad the same target twice.
- Duplicate and empty members are ignored. The first occurrence of a member on
  a line defines the column; later occurrences move with the line but never
  set the target.
- The word boundary and operator rules apply to every member: `MY_STATE1` never
  matches `MY_STATE10`, and `->` never matches `->>`.
- A declaration line whose modifier, type or name cell contains a group member
  is left out of the declaration alignment, so the group owns that column. A
  member in the initializer, after the name, does not exclude the line.
- Groups run within the configured `scope` (`block`, `indent` or `file`) just
  like symbols.
- A group that alternates its order with another group can conflict with it;
  conflicting groups leave the input unchanged instead of returning a partial
  result.

In the API the option is `groups`; in the configuration file it is the
`groups` key. The CLI takes one group per `--group` / `-g` occurrence, with the
members separated by commas:

```bash
symbol-align --file input.ts --group MY_STATE1,MY_STATE2 --group OTHER1,OTHER2
```

## Supported languages

The alignment itself is language agnostic — any punctuation symbol can be
aligned. What the language profile adds is the *lexical* knowledge: which
sequences start a string, which start a comment, and which operators must not
be split apart. There are 57 built-in profiles:

| Language | Id | Default symbol | Notable handling |
| -------- | -- | -------------- | ---------------- |
| Generic | `generic` | `=` | `//`, `/*` `*/`, 3 string forms |
| JavaScript | `javascript` | `=` | `//`, `/*` `*/`, 3 string forms |
| TypeScript | `typescript` | `=` | `//`, `/*` `*/`, 3 string forms |
| Python | `python` | `=` | `#`, 4 string forms |
| Go | `go` | `=`, `:=` | `//`, `/*` `*/`, 3 string forms |
| Rust | `rust` | `=` | `//`, `/*` `*/`, 2 string forms |
| Java | `java` | `=` | `//`, `/*` `*/`, 2 string forms |
| Kotlin | `kotlin` | `=` | `//`, `/*` `*/`, 2 string forms |
| Swift | `swift` | `=` | `//`, `/*` `*/`, 2 string forms |
| C# | `csharp` | `=` | `//`, `/*` `*/`, 4 string forms |
| F# | `fsharp` | `=`, `->`, `:` | `//`, nested `(*` `*)`, 9 string forms, `'T` guard |
| C++ | `cpp` | `=` | `//`, `/*` `*/`, 2 string forms |
| C | `c` | `=` | `//`, `/*` `*/`, 2 string forms |
| Ruby | `ruby` | `=` | `#`, 2 string forms |
| PHP | `php` | `=` | `//` `#`, `/*` `*/`, 2 string forms |
| Dart | `dart` | `=` | `//`, `/*` `*/`, 2 string forms |
| Shell | `shell` | `=` | `#`, 2 string forms |
| SQL | `sql` | `=` | `--`, `/*` `*/`, 1 string form |
| YAML | `yaml` | `=` | `#`, 2 string forms |
| JSON | `json` | `:` | 1 string form |
| CSS | `css` | `:` | `/*` `*/`, 2 string forms |
| HTML | `html` | `=` | `<!--` `-->`, 2 string forms |
| XML | `xml` | `=` | `<!--` `-->`, 2 string forms |
| Markdown | `markdown` | `=` | plain text |
| Plain Text | `plaintext` | `=` | plain text |
| Elixir | `elixir` | `=` | `#`, 3 string forms |
| Haskell | `haskell` | `=` | `--`, `{-` `-}`, 2 string forms |
| Lua | `lua` | `=` | `--`, `--[[` `]]`, 3 string forms |
| Scala | `scala` | `=` | `//`, `/*` `*/`, 3 string forms |
| Objective-C | `objectivec` | `=` | `//`, `/*` `*/`, 2 string forms |
| Perl | `perl` | `=` | `#`, 2 string forms |
| Julia | `julia` | `=` | `#`, `#=` `=#`, 3 string forms |
| Zig | `zig` | `=` | `//`, 2 string forms |
| PowerShell | `powershell` | `=` | `#`, `<#` `#>`, 2 string forms |
| Clojure | `clojure` | `=` | `;`, 2 string forms |
| Erlang | `erlang` | `=` | `%%`, 2 string forms |
| R | `r` | `<-`, `=` | `#`, 3 string forms |
| Fortran | `fortran` | `=` | `!`, 2 string forms |
| Nim | `nim` | `=` | `#`, `#[` `]#`, 2 string forms |
| Crystal | `crystal` | `=` | `#`, 3 string forms |
| Gleam | `gleam` | `=` | `//`, 2 string forms |
| Odin | `odin` | `=` | `//`, `/*` `*/`, 2 string forms |
| Solidity | `solidity` | `=` | `//`, `/*` `*/`, 2 string forms |
| Groovy | `groovy` | `=` | `//`, `/*` `*/`, 4 string forms |
| Terraform | `terraform` | `=` | `#` `//`, `/*` `*/`, 2 string forms |
| TOML | `toml` | `=` | `#`, 3 string forms |
| INI | `ini` | `=` | `;` `#`, 2 string forms |
| Makefile | `makefile` | `=` | `#`, 2 string forms |
| Dockerfile | `dockerfile` | `=` | `#`, 2 string forms |
| GraphQL | `graphql` | `:` | `#`, 2 string forms |
| Visual Basic | `vb` | `=` | apostrophe comments, 1 string form |
| Delphi | `delphi` | `=` | `//`, `{` `}` `(*` `*)`, 1 string form |
| Vue | `vue` | `=` | `//`, `/*` `*/` `<!--` `-->`, 3 string forms |
| Svelte | `svelte` | `=` | `//`, `/*` `*/` `<!--` `-->`, 3 string forms |
| Astro | `astro` | `=` | `//`, `/*` `*/` `<!--` `-->`, 3 string forms |
| Protocol Buffers | `protobuf` | `=` | `//`, `/*` `*/`, 2 string forms |
| V | `v` | `=` | `//`, `/*` `*/`, 2 string forms |

The language is detected from the file extension. Pass `--language` to choose
one explicitly, or `--stdin-filepath` so the CLI can detect it from the path of
the piped file.

## Rules

- Symbols **inside strings** (`'`, `"`, `` ` ``, `"""`, …) are ignored
- Symbols **inside comments** (`//`, `#`, `/* */`, `<!-- -->`, `--`) are ignored
- Multi-line strings and block comments are tracked **across lines**
- A line comment marker (`//`, `#`, …) is alignable itself when requested
- A symbol that is only a fragment of a longer operator (`=` inside `=>` or
  `==`) is never aligned
- Lines that do not contain the symbol are left unchanged
- Multi-symbol alignment processes symbols in **order of first appearance**
- Declaration alignment only pads the gaps between the cells and never changes
  the indentation of a line
- A custom group aligns the first occurrence of any member and obeys the same
  word boundary and operator fragment rules as a symbol
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
const a = 1;   // short
const bb = 22; // longer
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
const x :  string;
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
       symbol-align [options] --file <path> [--file <path> ...]

Vertically align punctuation symbols in a code snippet.
Reads from stdin or from one or more files and writes to stdout.

Options:
  -f, --file <path>         Read from file instead of stdin (repeat it or list several paths)
  -o, --output <path>       Write to file instead of stdout
      --write               Write the aligned code back into the file that was read
      --diff                Print a unified diff of the input and the aligned result
  -s, --symbols <list>      Comma-separated symbols to align
  -g, --group <list>        Comma-separated tokens that share one column (repeatable)
  -l, --language <id>       Language profile to use
  -t, --stdin-filepath <p>  Path of the piped file (used for language detection)
  -c, --config <path>       Configuration file (default: nearest symbol-align.config.json)
      --scope <block|indent|file>  Grouping strategy (default: block)
      --declarations        Align the declaration columns of the language (default: on)
      --no-declarations     Do not align the declaration columns
      --declaration-anchor <start|end>  Which edge of a declaration cell is aligned (default: start)
      --max-declaration-pad <n>  Largest column difference that joins a declaration column (default: 12)
      --check               Exit 1 when the input is not already aligned
  -v, --version             Print the version
  -h, --help                Show this help

Notes:
  --write requires --file and cannot be combined with --output
  --write only inserts spaces, the line endings of the file are kept
  --output cannot be used with several files
  --diff cannot be combined with --check and never writes a file
  --check and --diff only report and cannot be combined with --write or --output

Examples:
  echo "a = 1\nbb = 2" | symbol-align
  cat file.ts | symbol-align --symbols =,:
  symbol-align --file input.ts --group MY_STATE1,MY_STATE2
  symbol-align --file input.ts --declarations --declaration-anchor start --max-declaration-pad 12
  symbol-align --file input.ts
  symbol-align -f input.ts -o output.ts
  symbol-align -f input.ts --write
  symbol-align -f input.ts -f other.ts --diff
  symbol-align -f input.ts --language python
  symbol-align -f input.ts --config symbol-align.config.json
```

## Migration

The `0.1` release reworked the API. The full list of changes is in the
[CHANGELOG](CHANGELOG.md).

```diff
- import { align } from '@sandlada/symbol-align';
+ import { align } from '@sandlada/symbol-align';

- const result = align(code, { symbols: ['=', ':'] });
+ const result = align(code)({ symbols: ['=', ':'] });
```

| before                              | now                                       |
| ----------------------------------- | ----------------------------------------- |
| `align(code, options)`              | `align(code)(options)`                    |
| —                                   | `alignWith(options)(code)`                |
| —                                   | `alignSymbols('=', ':')(code)`            |
| —                                   | `alignLanguage('python')(code)`           |
| strings/comments always skipped     | handled by the language profile           |
| `=` inside `=>` was aligned         | never aligned                             |
| every line was aligned with every other line | only lines of the same block   |
| `changes` counted padding operations | `changes` counts distinct modified lines |

## Configuration

Drop a `symbol-align.config.json` into your repository to control the
defaults. The CLI discovers the nearest file automatically; `--config` names a
specific one.

```json
{
    "$schema": "https://raw.githubusercontent.com/sandlada/symbol-align/main/packages/core/schemas/symbol-align.config.schema.json",
    "symbols": ["=", ":"],
    "groups": [["MY_STATE1", "MY_STATE2"]],
    "declarations": true,
    "declarationAnchor": "start",
    "maxDeclarationPad": 12,
    "scope": "block",
    "overrides": {
        "*.py": { "symbols": ["="] },
        "src/**/config.ts": { "symbols": ["=", ":", "=>"] }
    }
}
```

| Key         | Type                      | Description                                                     |
| ----------- | ------------------------- | --------------------------------------------------------------- |
| `symbols`   | `string[]`                | Symbols to align (an empty list aligns nothing)                 |
| `groups`    | `string[][]`              | Groups of alternative tokens that share one alignment column    |
| `language`  | `LanguageId`              | Language profile to use                                         |
| `scope`     | `'block'|'indent'|'file'` | Grouping strategy                                               |
| `declarations` | `boolean`              | Whether the declaration columns are aligned                     |
| `declarationAnchor` | `'start'|'end'`  | Which edge of a declaration cell is aligned                     |
| `maxDeclarationPad` | `number`         | Largest column difference that joins a declaration column       |
| `overrides` | `object`                  | Per file pattern overrides of `symbols`, `groups`, `language`, `scope`, `declarations`, `declarationAnchor` and `maxDeclarationPad` |

The patterns are matched against the file name and against the full path. `*`
does not cross a directory separator, `**` does, and a leading `**` also
matches files in the root directory. A later matching override wins.

The command line always wins over the configuration:

```bash
symbol-align --file input.ts --symbols '='   # overrides the configured symbols
```

The same configuration is available to the API. The filesystem helpers live in
the `@sandlada/symbol-align/node` entry point, so that the main entry point
stays free of Node.js builtins and can be bundled for the browser:

```ts
import { resolveConfig } from '@sandlada/symbol-align';
import { loadConfig } from '@sandlada/symbol-align/node';

const config = loadConfig(process.cwd());
const options = resolveConfig(config)('src/config.ts');
```

## Recipes

The CLI speaks the same protocol as Prettier — it reads from standard input,
writes to standard output and takes the path of the edited file in
`--stdin-filepath`. Every editor that can call an external formatter can
therefore use it.

### Neovim (conform.nvim)

```lua
require('conform').formatters['symbol_align'] = {
    command = 'npx',
    args = { 'symbol-align', '--stdin-filepath', function() return vim.fn.expand('%:p') end },
    stdin = { 'content' },
    exit_codes = { 0, 1 },
}
```

### Zed

```json
{
    "formatter": [
        {
            "code_actions": ["format_document"],
            "language_servers": ["language-server", "null-ls", "copilot"],
            "format_on_save": true,
            "formatter": [
                { "command": "npx", "args": ["symbol-align", "--stdin-filepath", "$ZED_FILENAME"] }
            ]
        }
    ]
}
```

### IntelliJ IDEA

Add the CLI as an *external formatter* under
`Settings → Tools → External Tools` and pick it as the formatter of your
language. Pass `--stdin-filepath $FilePath$` so the language is detected.

### Pre-commit (lint-staged)

```json
{
    "lint-staged": {
        "*.{ts,tsx,js,jsx,py,go,rs,java,cs,cpp,c,rb,php}": ["symbol-align --write --file"]
    }
}
```

### Continuous integration

`symbol-align --check` reports misalignment and exits with code `1` without
writing anything, so it can guard a repository:

```yaml
- name: Check the alignment
  run: |
    status=0
    while IFS= read -r file; do
      symbol-align --check --file "$file" || status=1
    done < <(git ls-files '*.ts')
    exit $status
```

## Limitations

- Regular expressions are not detected, except for Perl matches and
  substitutions — symbols inside a `/…/` literal of any other language may
  still be aligned
- Only the **first** occurrence of a symbol per line is used for alignment
- The aligner never removes spaces, so it cannot un-align a snippet
- The columns are counted in characters, not in grapheme clusters. A character
  that needs more than one code unit (an emoji for example) before the symbol
  shifts the visual column a little.
- Tab indented code lines up best with `scope: 'indent'`, because the `block`
  scope mixes the nesting levels of a file

## Repository structure

```
symbol-align/
├── packages/
│   ├── core/               # @sandlada/symbol-align — Rust core + wasm + TS wrapper + CLI
│   │   ├── rust/           # Rust crate (scanner, finder, declarations, aligner, wasm ABI)
│   │   ├── src/            # TypeScript API wrapper and platform adapters
│   │   ├── languages.json  # single source of truth for the 57 language profiles
│   │   └── package.json
│   ├── core-ts/            # @sandlada/symbol-align-ts — TypeScript reference implementation
│   │   ├── src/            # library + CLI sources
│   │   └── package.json
│   ├── vscode/             # Symbol Align — the VS Code extension
│   │   ├── src/            # extension sources
│   │   └── package.json
├── scripts/
│   └── sync-docs.mjs       # materializes / restores the linked doc files
├── biome.json              # lint + format configuration
├── pnpm-workspace.yaml     # workspace + shared dependency catalog
├── tsconfig.base.json      # shared compiler options
└── package.json            # workspace root (private)
```

Documentation files (`README.md`, `CHANGELOG.md`, `LICENSE`, `SECURITY.md`,
`CODE_OF_CONDUCT.md`) live in the repository root. Each package links them back
to the root copies so that a document is edited in exactly one place.
`scripts/sync-docs.mjs` turns the links into real files while packing
(`prepack`) and restores them afterwards (`postpack`), because `npm-packlist`
skips symlinked files.

## Development

Requires [pnpm](https://pnpm.io) 9+ (the repository pins the version in
`packageManager`) and a Rust toolchain with the `wasm32-unknown-unknown`
target:

```bash
rustup target add wasm32-unknown-unknown
```

```bash
pnpm install        # install workspace dependencies
pnpm build          # build every package (Rust wasm + tsc)
pnpm test           # run every package's test suite (vitest)
pnpm typecheck      # type-check every package including tests
pnpm lint           # lint every package
pnpm clean          # remove build output
pnpm bench          # write report1.md (baseline performance report)

pnpm --filter @sandlada/symbol-align build    # build the Rust core + wrapper
pnpm --filter @sandlada/symbol-align dev      # run the CLI from source (tsx)
pnpm --filter @sandlada/symbol-align-ts test  # run the TypeScript reference suite
pnpm dev:playground                          # run the Vite playground (localhost:5173)
```

The conformance suite of `packages/core` is a copy of the TypeScript reference
suite and exercises the wasm build exactly like a published consumer would.

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
