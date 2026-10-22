# Changelog

All notable changes to `@sandlada/symbol-align` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-22

### Added

- **Language profiles.** A profile per language describes its comment markers,
  string delimiters and operator tokens. The scanner uses it to tell code from
  strings and comments, and the finder uses it to avoid splitting an operator.
  Supported today: Astro, C, C++, C#, Crystal, CSS, Dart, Delphi, Dockerfile,
  Elixir, Erlang, Fortran, Generic, Go, GraphQL, Groovy, Haskell, HTML, INI,
  Java, JavaScript, JSON, Julia, Kotlin, Lua, Makefile, Markdown, Nim,
  Objective-C, PHP, Plain Text, PowerShell, Protobuf, Python, R, Ruby, Rust,
  Scala, Shell, Solidity, SQL, Svelte, Swift, Terraform, TOML, TypeScript, VB,
  V, Vue, XML, YAML, Zig.
- **Multi-line awareness.** Strings and block comments that span several lines
  are tracked across line boundaries, so Python docstrings, Go raw strings,
  JavaScript template literals and C# verbatim strings are never aligned.
- **Operator aware matching.** A symbol that is only a fragment of a longer
  operator is never aligned — the `=` of `=>`, `==`, `:=`, `>=` or `+=` stays
  where it is.
- **`--language` CLI flag** to pick a language profile and **`--stdin-filepath`**
  to detect the language from the path of the piped file.
- **`--scope` CLI flag** to choose between `block` (default), `indent` and
  `file` grouping.
- **`--check` CLI flag** that reports misalignment and exits with code `1`
  without writing any output.
- **`--version` CLI flag.**
- **`--write`** rewrites the file that was read instead of writing to stdout,
  and **`--file`** may be given more than once so that several files are
  aligned in one run.
- **`--diff`** prints a unified diff of the input and the aligned result, which
  is what a pre-commit hook needs to show what would change.
- A `generic` profile that recognises `'`, `"` and `` ` `` strings and `//` /
  `/* */` comments. It is the default when no language is given.
- **A project configuration file** (`symbol-align.config.json`) with per file
  pattern overrides. The CLI discovers the nearest file automatically and
  `--config` names a specific one; the command line always wins over it.
- **A JSON schema** for the configuration file
  (`packages/core/schemas/symbol-align.config.schema.json`) so editors can
  validate and complete it.
- **An `indent` scope** that aligns only the lines of the same nesting level
  with each other, which keeps tab indented code lined up.
- **A `range` option** that aligns a part of a document while the rest of the
  text is still scanned — that is what an editor needs when the user selects
  a few lines.
- **Recipes** for Neovim, Zed, IntelliJ, lint-staged and CI.
- A GitHub Actions workflow that lints, checks the formatting, type-checks,
  builds and tests the workspace.
- Biome 2 for linting and formatting.

### Changed

- **The API is curried.** The configuration is now the trailing argument:
  - `align(code, options)` → `align(code)(options)`
  - `alignWith(options)(code)`, `alignSymbols(...symbols)(code)` and
    `alignLanguage(id)(code)` are new helpers for reusable aligners.
- **`AlignOptions.language`** replaces the implicit string and comment handling
  and defaults to `generic`.
- **`AlignOptions.scope`** controls which lines are aligned with each other.
  The default `block` scope only aligns lines of the same blank-line separated
  block; the previous behaviour is available as `scope: 'file'`.
- **`AlignResult.changes`** now counts the *distinct* lines that were modified.
  It used to count every padding operation, so a line that received two symbols
  was counted twice.
- The CLI no longer silently ignores unknown options — it reports them and
  exits with code `1`.
- The CLI implementation (`cli.ts`) is free of side effects; the executable
  entry point moved to `bin.ts`.
- The package now requires Node.js 24 or newer.
- The repository is linted and formatted with Biome instead of an ad-hoc style.

### Fixed

- Symbols inside a string or a comment are no longer aligned when the snippet
  contains a multi-line string or block comment.
- A word that merely starts with a symbol (`exportedValue` for `export`) is no
  longer treated as that symbol.
- The prefix keyword padding (`readonly `, `export `, …) now aligns the content
  of the lines that miss the keyword.

[0.1.0]: https://github.com/sandlada/symbol-align/compare/v0.0.1-20260710.a...v0.1.0
