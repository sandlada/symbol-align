//! Native benchmark harness for the Rust core.
//!
//! Usage: `bench <manifest.json>`
//!
//! The manifest is produced by `scripts/bench-corpus.mjs`; it contains the
//! corpus paths and the alignment options, so the native run measures exactly
//! the same bytes as the TypeScript and wasm harnesses.

use std::fs;
use std::hint::black_box;
use std::time::Instant;

use serde_json::{Value, json};
use symbol_align_core::{aligner, json as boundary};

/// Number of unmeasured warm-up runs.
const WARMUP: usize = 2;

/// Number of measured runs.
const RUNS: usize = 7;

fn main() {
    let Some(manifest_path) = std::env::args().nth(1) else {
        eprintln!("usage: bench <manifest.json>");
        std::process::exit(2);
    };

    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(&manifest_path).expect("read manifest"))
            .expect("parse manifest");
    let entries = manifest.as_array().expect("manifest is an array");
    let mut results = Vec::with_capacity(entries.len());

    for entry in entries {
        let name = entry["name"].as_str().expect("entry name");
        let path = entry["path"].as_str().expect("entry path");
        let code = fs::read_to_string(path).expect("read corpus");
        let options = boundary::parse_align_options(&entry["options"].to_string());
        let mut times = Vec::with_capacity(RUNS);
        let mut changes = 0;

        for index in 0..WARMUP + RUNS {
            let start = Instant::now();
            let result = aligner::align(&code, &options);
            let elapsed = start.elapsed().as_secs_f64() * 1_000.0;

            black_box(&result);

            if index >= WARMUP {
                times.push(elapsed);
                changes = result.changes;
            }
        }

        times.sort_by(|left, right| left.partial_cmp(right).expect("finite timing"));
        let median = times[times.len() / 2];

        results.push(json!({
            "name": name,
            "lines": code.lines().count(),
            "bytes": code.len(),
            "changes": changes,
            "medianMs": median,
            "runs": times,
        }));
    }

    println!("{}", Value::Array(results));
}
