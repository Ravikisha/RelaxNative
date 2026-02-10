# RelaxRegistry

Registry packages live under `native/registry/<pkg>` in a consuming project.

## Package format

A registry package is a folder containing:

- `relax.json`
- one or more native sources (`.c`, `.cpp`, `.rs`) referenced by `relax.json.exports`

Example `relax.json`:

```json
{
  "name": "fast-matrix",
  "version": "0.1.0",
  "exports": [{ "source": "matrix.c" }],
  "flags": ["-O3"],
  "permissions": {
    "fs": { "read": ["."], "write": [] },
    "network": { "outbound": false },
    "process": { "spawn": false }
  },
  "functionMode": {
    "mul2": "sync"
  }
}
```

## Determinism

Initial implementation supports **offline deterministic installs** via `file:<path>`.
GitHub support will be added next with pinned refs + hash verification.

## Security

During install we run a static scan and surface warnings (no blocking yet).

## Native tests

If your package includes `test_*` functions (for example in a `*_test.c` file), you can run them via the built-in native test harness.

See the repo root `README.md` for the expected `test_*` return conventions and isolation modes.

Debug tips:

- `RELAXNATIVE_DEBUG_FFI=1` prints FFI binding operations
- `VITEST_DEBUG_HARNESS=1` prints native harness results in the Vitest suite

