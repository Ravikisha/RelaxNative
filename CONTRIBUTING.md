# Contributing to Relaxnative

Thanks for your interest in contributing!

## Development setup

1. Install Node.js (recommended: Node 20+).
2. Install a C compiler (clang or gcc). Optional but recommended: Rust toolchain (rustc + cargo).
3. Install dependencies:

```bash
npm ci
```

## Common scripts

```bash
npm run build
npm test
npm run test:inband
npm run lint
npm run format
```

## Project structure (high level)

- `src/loader.ts`: compile + parse + bind + wrap (main entry)
- `src/worker/*`: worker & process isolation transports
- `src/compiler/*`: C/Rust compiler detection + compilation + deterministic cache
- `src/parser/*`: Tree-sitter parsing + annotation extraction
- `src/ffi/*`: koffi bindings generation and type mapping
- `src/registry/*`: RelaxRegistry package install + trust enforcement

## Running tests reliably

Native + process isolation tests can be sensitive to parallelism in some environments.
Use the in-band runner:

```bash
npm run test:inband
```

## Coding guidelines

- Keep behavior deterministic and offline-friendly.
- Prefer small, composable modules.
- Add tests for any behavior change.
