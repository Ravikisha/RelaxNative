import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  // koffi + native memory tests are not fork-safe in some environments.
  // Disable file-level parallelism for determinism.
  fileParallelism: false,
  pool: 'forks',
  maxWorkers: 1,
  // Some native/ffi tests can take a while to tear down child processes on
  // very new Node majors (e.g. Node 25). Give the pool more time so Vitest
  // doesn't report spurious "Worker exited unexpectedly".
  hookTimeout: 120_000,
  teardownTimeout: 120_000,
  testTimeout: 120_000,
  },
});
