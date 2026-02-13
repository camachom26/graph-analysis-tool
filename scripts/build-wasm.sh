#!/usr/bin/env bash
set -euo pipefail

# Build C++ -> WebAssembly using Emscripten.
# Prereq: emcc available (emsdk activated)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/public/wasm"

mkdir -p "${OUT_DIR}"

echo "Building WASM..."

emcc \
  "${ROOT}/cpp/Graph.cpp" \
  "${ROOT}/cpp/wasm_entry.cpp" \
  -O3 \
  -std=c++17 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  --bind \
  -o "${OUT_DIR}/kruskal_wasm.js"

echo "WASM built:"
ls -la "${OUT_DIR}/kruskal_wasm."*
