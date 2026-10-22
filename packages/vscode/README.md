# Symbol Align — VS Code extension

Vertically aligns the punctuation symbols of your code so that they line up in
one column.

```ts
const name    = 'symbol-align';
const version = '0.0.1';
```

The extension is powered by [`@sandlada/symbol-align`](https://github.com/sandlada/symbol-align).
It only ever **inserts spaces** — it never reorders, rewraps or rewrites your
code, and it never touches symbols that live inside a string or a comment.

## Commands

| Command                        | Title                          | Description                                     |
| ------------------------------ | ------------------------------ | ----------------------------------------------- |
| `symbolAlign.alignDocument`    | Symbol Align: Align Document   | Aligns the whole document of the active editor. |
| `symbolAlign.alignSelection`   | Symbol Align: Align Selection  | Aligns the lines that are selected.             |

The extension also registers a document formatter, so *Format Document* aligns
the file as well.

## Settings

| Setting                 | Type       | Default   | Description                                                                                     |
| ----------------------- | ---------- | --------- | ----------------------------------------------------------------------------------------------- |
| `symbolAlign.enabled`   | `boolean`  | `true`    | Align the document when it is formatted.                                                         |
| `symbolAlign.symbols`   | `string[]` | `[]`      | The symbols to align, e.g. `["=", ":"]`. An empty list uses the symbols of the language.          |
| `symbolAlign.language`  | `string`   | `"auto"`  | The language profile to use. `"auto"` detects it from the language of the document.                |
| `symbolAlign.scope`     | `string`   | `"block"` | `"block"` aligns the lines of a blank-line separated block, `"file"` aligns every line of the file. |

The `symbolAlign.enabled` setting only controls the formatter. The two commands
always align, because they are an explicit request.

## Supported languages

The language of the document is detected from its VS Code language id. The
extension maps the following ids to a profile of the core library: `javascript`,
`typescript`, `python`, `go`, `rust`, `java`, `kotlin`, `swift`, `csharp`,
`cpp`, `c`, `objectivec`, `ruby`, `php`, `dart`, `shell`, `powershell`, `sql`,
`yaml`, `json`, `css`, `html`, `xml`, `markdown`, `plaintext`, `elixir`,
`haskell`, `lua`, `scala`, `perl`, `julia`, `zig`, `clojure`, `erlang`, `r`,
`fortran`, `nim`, `crystal`, `gleam`, `odin`, `solidity`, `groovy`,
`terraform`, `toml`, `ini`, `makefile`, `dockerfile`, `graphql`, `delphi`,
`vue`, `svelte`, `astro`, `protobuf` and `v`.

A document whose language is unknown — or whose profile the core library does
not know — is left untouched.

## Development

```bash
pnpm --filter @sandlada/symbol-align build   # build the core library
pnpm --filter symbol-align build             # bundle the extension
pnpm --filter symbol-align typecheck         # type-check the extension
pnpm --filter symbol-align test              # run the unit tests
pnpm --filter symbol-align package           # package the extension with vsce
```

The bundle is written to `dist/extension.js` and is loaded by VS Code as a
CommonJS module.
