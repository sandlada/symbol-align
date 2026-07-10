# @sandlada/symbol-align

![npm version](https://img.shields.io/npm/v/@sandlada/symbol-align?label=NPM%20Version&labelColor=%2300531f&color=%23a3f5aa)
![GitHub License](https://img.shields.io/github/license/sandlada/symbol-align?label=License&labelColor=%2300531f&color=%23a3f5aa)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-%233178c6?labelColor=%232b2d2f)](https://www.typescriptlang.org/)

Vertically align code symbols such as `=`, `:`, `=>`, `//`, `#` — via CLI or API.

---

## Install

```bash
npm install -D @sandlada/symbol-align
```

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
cat file.ts | npx symbol-align --symbols =>
```

Any symbol can be aligned — just list it with `--symbols`.

Use `--file` / `-f` for direct file input, or pipe via stdin for streaming use.
Use `--output` / `-o` to write to a file instead of stdout.

### API

```ts
import { align } from '@sandlada/symbol-align';

const result = align(
  [
    'const backgroundColor = tokens.color.surface;',
    'const textColor       = tokens.color.text.primary;',
    'const borderColor     = tokens.color.border.default;',
  ].join('\n'),
);

console.log(result.code);
// Already aligned — no changes needed
console.log(result.changes); // 0
```

Multi-symbol alignment:

```ts
const code = [
  'const x: Type = 1;',
  'const yy: AnotherType = 22;',
].join('\n');

const { code: aligned } = align(code, { symbols: [':', '='] });
// → const x : Type        = 1;
// → const yy: AnotherType = 22;
```

## Options

### `AlignOptions`

| Option    | Type       | Default | Description                                           |
| --------- | ---------- | ------- | ----------------------------------------------------- |
| `symbols` | `string[]` | `['=']` | Symbols to align (e.g. `['=', ':', '=>', '//', '#']`) |

### `AlignResult`

| Field     | Type     | Description              |
| --------- | -------- | ------------------------ |
| `code`    | `string` | The aligned code         |
| `changes` | `number` | Number of lines modified |

## Rules

- Symbols **inside strings** (`'`, `"`, `` ` ``) are ignored
- Symbols **inside comments** (`//`, `/* */`) are ignored
- Lines that don't contain the symbol are left unchanged
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

## CLI Reference

```
Usage: symbol-align [options] [< file]
       symbol-align [options] --file <path>

Vertically align symbols in code. Reads from stdin or a file, writes to stdout.

Options:
  -f, --file <path>    Read from file instead of stdin
  -o, --output <path>  Write to file instead of stdout
  -s, --symbols <list> Comma-separated symbols to align (default: "=")
  --help               Show this help

Examples:
  echo "a = 1\nbb = 2" | symbol-align
  cat file.ts | symbol-align --symbols =,:
  symbol-align --file input.ts
  symbol-align -f input.ts --symbols =,:
  symbol-align --file input.ts -o output.ts
```

## Limitations

- Does **not** detect regex `/.../` — symbols inside regex may be aligned
- Single-pass alignment per symbol group

## License

MIT &mdash; see [LICENSE](LICENSE).
