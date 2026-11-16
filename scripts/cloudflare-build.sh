#!/usr/bin/env bash
#
# Builds the static site for Cloudflare Workers Builds.
#
# The Workers build image ships Node.js and pnpm but no Rust toolchain, while
# the site bundles the Rust core compiled to wasm32-unknown-unknown. The
# payload is generated (and gitignored) by `build:wasm`, so the deploy builds it
# here, installing a minimal Rust toolchain only when cargo is missing.
#
# Local builds do not use this script: `pnpm build` builds the core first.

set -euo pipefail

cargo_home="${CARGO_HOME:-$HOME/.cargo}"

if ! command -v cargo >/dev/null 2>&1; then
    echo "cargo not found - installing a minimal Rust toolchain"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --target wasm32-unknown-unknown

    # shellcheck disable=SC1094,SC1090
    . "$cargo_home/env"
fi

if command -v rustup >/dev/null 2>&1; then
    rustup target add wasm32-unknown-unknown
fi

cargo --version
pnpm --filter @sandlada/symbol-align build:wasm
pnpm --filter @sandlada/site build
