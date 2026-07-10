# @sandlada/symbol-align

![npm version](https://img.shields.io/npm/v/@sandlada/symbol-align?label=NPM%20Version&labelColor=%2300531f&color=%23a3f5aa)
![GitHub License](https://img.shields.io/github/license/sandlada/symbol-align?label=License&labelColor=%2300531f&color=%23a3f5aa)
![CI](https://img.shields.io/github/actions/workflow/status/sandlada/symbol-align/ci.yml?label=CI&labelColor=%2300531f&color=%23a3f5aa)

Vertically align code symbols such as `=`, `:`, `=>`, `//`, `#` — via CLI or API.

---

## Install

```bash
npm install -D @sandlada/symbol-align
```

## Usage

### CLI (stdin → stdout)

Pipe code through the CLI to align symbols:

```bash
# Align = signs (default)
cat file.ts | npx symbol-align

# Align : and = signs
cat file.ts | npx symbol-align --symbols =,:

# Align => arrows
cat file.ts | npx symbol-align --symbols =>
```

Input file (`input.ts`):

```ts
const foo        = 1;
const foobar     = 2;
const foobarbaz  = 3;
```

Any symbol can be aligned — just list it with `--symbols`.

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
//   const yy: AnotherType = 22;
```

## Options

### `AlignOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `symbols` | `string[]` | `['=']` | Symbols to align (e.g. `['=', ':', '=>', '//', '#']`) |

### `AlignResult`

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | The aligned code |
| `changes` | `number` | Number of lines modified |

## Rules

- Symbols **inside strings** (`'`, `"`, `` ` ``) are ignored
- Symbols **inside comments** (`//`, `/* */`) are ignored
- Lines that don't contain the symbol are left unchanged
- Multi-symbol alignment processes symbols in **order of first appearance**
- Only **adds** spaces — never removes existing spacing

## Examples

### Align `=` assignments

<table>
<tr><th>Before</th><th>After</th></tr>
<tr><td>

```ts
const a   = 1;
const bb  = 2;
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

<table>
<tr><th>Before</th><th>After</th></tr>
<tr><td>

```ts
const a = 1;     // short
const bb = 22;   // longer
```

</td><td>

```ts
const a = 1;     // short
const bb = 22;   // longer
```

</td></tr>
</table>

### Align `:` type annotations

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
Usage: symbol-align [options] < input

Vertically align symbols in code. Reads from stdin, writes to stdout.

Options:
  -s, --symbols <list>  Comma-separated symbols to align (default: "=")
  --help                Show this help

Examples:
  echo "a = 1\nbb = 2" | symbol-align
  cat file.ts | symbol-align --symbols =,:
```

## Limitations

- Does **not** detect regex `/.../` — symbols inside regex may be aligned
- Does **not** support file path arguments (stdin only)
- Single-pass alignment per symbol group

## License

MIT &mdash; see [LICENSE](LICENSE).
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-%233178c6?labelColor=%232b2d2f)](https://www.typescriptlang.org/)
