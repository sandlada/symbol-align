# Symbol Align — VS Code extension

Vertically aligns the punctuation symbols of your code so that they line up in
one column.

```ts
const name    = 'symbol-align';
const version = '0.0.1';
```

The extension is powered by [`@sandlada/symbol-align-ts`](https://github.com/sandlada/symbol-align).
It only ever **inserts spaces** — it never reorders, rewraps or rewrites your
code, and it never touches symbols that live inside a string or a comment.

## Commands

| Command                        | Title                          | Description                                     |
| ------------------------------ | ------------------------------ | ----------------------------------------------- |
| `symbolAlign.alignDocument`    | Symbol Align: Align Document   | Aligns the whole document of the active editor. |
| `symbolAlign.alignSelection`   | Symbol Align: Align Selection  | Aligns the lines that are selected.             |

The extension also registers a document formatter, so *Format Document* aligns
the file as well.

`Align Selection` only changes the selected lines, but the whole document is
scanned. A string or a comment that reaches into the selection is therefore
recognised and the symbols inside it are left alone.

## Settings

| Setting                         | Type         | Default   | Description                                                                                                                                                 |
| ------------------------------- | ------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `symbolAlign.enabled`           | `boolean`    | `true`    | Align the document when it is formatted.                                                                                                                    |
| `symbolAlign.symbols`           | `string[]`   | `[]`      | The symbols to align, e.g. `["=", ":"]`. An empty list uses the symbols of the language.                                                                    |
| `symbolAlign.language`          | `string`     | `"auto"`  | The language profile to use. `"auto"` detects it from the language of the document.                                                                         |
| `symbolAlign.scope`             | `string`     | `"block"` | `"block"` aligns the lines of a blank-line separated block, `"indent"` keeps every nesting level on its own column, `"file"` aligns every line of the file. |
| `symbolAlign.declarations`      | `boolean`    | `true`    | Align the declaration columns — the modifiers, the type and the name of a declaration.                                                                      |
| `symbolAlign.declarationAnchor` | `string`     | `"start"` | `"start"` aligns the start of every declaration cell, `"end"` pads in front of the type so the type contents end on one column.                             |
| `symbolAlign.maxDeclarationPad` | `number`     | `12`      | The largest column difference that still joins a declaration column. A type outside the window keeps its column.                                            |
| `symbolAlign.groups`            | `string[][]` | `[]`      | Groups of alternative tokens that share one column, e.g. `[["A", "B"]]`. Members are aligned before the symbols.                                            |

The `symbolAlign.enabled` setting only controls the formatter. The two commands
always align, because they are an explicit request.

## Supported languages

The language of the document is detected from its VS Code language id. The
extension maps the following ids to a profile of the core library: `javascript`,
`javascriptreact`, `typescript`, `typescriptreact`, `python`, `go`, `rust`,
`java`, `kotlin`, `swift`, `csharp`, `fsharp`, `f#`, `cpp`, `c`, `objectivec`,
`objective-c`, `ruby`, `php`, `dart`, `shellscript`, `powershell`, `sql`,
`yaml`, `toml`, `ini`, `json`, `jsonc`, `css`, `scss`, `less`, `html`, `xml`,
`markdown`, `plaintext`, `elixir`, `haskell`, `lua`, `scala`, `perl`, `julia`,
`zig`, `clojure`, `erlang`, `r`, `fortran`, `fortran-free-form`, `nim`,
`crystal`, `gleam`, `odin`, `solidity`, `groovy`, `terraform`, `makefile`,
`dockerfile`, `graphql`, `delphi`, `pascal`, `protobuf`, `proto`, `v`, `vb`,
`vue`, `svelte` and `astro`.

A document whose language is unknown — or whose profile the core library does
not know — is left untouched.

## Development

```bash
pnpm --filter @sandlada/symbol-align-ts build   # build the core library
pnpm --filter symbol-align build             # bundle the extension
pnpm --filter symbol-align typecheck         # type-check the extension
pnpm --filter symbol-align test              # run the unit tests
pnpm --filter symbol-align package           # package the extension with vsce
```

The bundle is written to `dist/extension.js` and is loaded by VS Code as a
CommonJS module.
