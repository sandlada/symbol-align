# Porting contract

The Rust crate is a faithful port of the TypeScript reference implementation in
`packages/core-ts/src`. Behaviour parity is the acceptance criterion: the
copied Vitest suite must pass unchanged against the wasm build.

## String model

- `Line` stores `Vec<char>` plus a UTF-16 column table. JavaScript strings are
  indexed by UTF-16 code unit, so `😀` occupies two columns while `あ` occupies
  one. **All internal positions are character indices**; use `Line::column`
  whenever a visual column is needed and `Line::char_index_at_column` at a
  boundary.
- Whitespace follows JavaScript: `is_js_whitespace` adds U+FEFF to
  `char::is_whitespace`.
- `split_lines` / `join_lines` mirror `String.prototype.split('\n')` and
  `Array.prototype.join('\n')`.

## Module contracts

```rust
// scanner.rs
pub fn scan_source(code: &str, profile: &LanguageProfile) -> ScanResult;
// ScanResult.code_regions / line_comments are indexed by line and use char indices.

// finder.rs
pub struct FindOptions<'a> {
    pub regions: &'a [CodeRegion],
    pub symbols: &'a [String],
    pub operators: &'a [String],
    pub comment: Option<&'a LineComment>,
}
pub fn find_symbol_positions(line: &Line, options: &FindOptions<'_>) -> Vec<(String, Vec<usize>)>;
// One entry per distinct symbol, in first-seen order. Positions are char indices.

// declarations.rs
pub struct DeclarationOptions<'a> { pub regions: &'a [CodeRegion], pub style: DeclarationStyle }
pub fn find_declaration_cells(line: &Line, options: &DeclarationOptions<'_>) -> Option<Vec<DeclarationCell>>;
// Cells use char indices.

// aligner.rs
pub fn align(code: &str, options: &AlignOptions) -> AlignResult;
// Baseline: port the current fixpoint pipeline one-to-one. Do not optimize yet.
```

## Rules

- Standard library only. `abi.rs` is the only module allowed to use `unsafe`.
- No filesystem, no process, no environment access in the core modules.
- Preserve the exact TypeScript semantics, including operator fragments,
  word boundaries, code regions, declaration heuristics, group conflicts,
  prefix padding, scope/range behaviour and the five-iteration fixpoint with
  its leading-symbol fallback.
- Do not run tests, `cargo check`, `cargo build` or Vitest. Write the code and
  return; the orchestrator compiles and runs the conformance suite once.
