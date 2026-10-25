//! Rust core of the `symbol-align` code-snippet formatter.
//!
//! The crate is platform independent: the scanner, finder, declaration locator
//! and aligner never touch the filesystem. The wasm ABI lives in [`abi`] and
//! the JSON adapters live in [`json`]; both are the only modules that know
//! about the boundary representation.

pub mod abi;
pub mod aligner;
pub mod declarations;
pub mod finder;
pub mod json;
pub mod language;
mod language_data;
pub mod line;
pub mod scanner;
pub mod types;
pub mod vocabulary;
