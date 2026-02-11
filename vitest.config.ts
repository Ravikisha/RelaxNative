import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  // koffi + native memory tests are not fork-safe in some environments.
  // Disable file-level parallelism for determinism.
  fileParallelism: false,
  // Forks has been flaky on newer Node majors in this repo ("Worker exited unexpectedly").
  // Threads is more stable for our workload, and we already keep maxWorkers=1.
  pool: 'threads',
  maxWorkers: 1,
  // Some native/ffi tests can take a while to tear down child processes on
  // very new Node majors (e.g. Node 25). Give the pool more time so Vitest
  // doesn't report spurious "Worker exited unexpectedly".
  hookTimeout: 120_000,
  teardownTimeout: 120_000,
  testTimeout: 120_000,
  },
});
