import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  // koffi + native memory tests are not fork-safe in some environments.
  // Disable file-level parallelism for determinism.
  fileParallelism: false,
  pool: 'forks',
  maxWorkers: 1,
  },
});
