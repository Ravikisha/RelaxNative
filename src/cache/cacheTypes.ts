export type CacheEntry = {
  hash: string;
  sourcePath: string;
  outputPath: string;
  compilerPath: string;
  compilerVersion: string;
  flags: string[];
  platform: string;
  createdAt: number;
  /**
   * Monotonic-ish timestamp (ms since epoch) updated whenever this cache entry is used.
   * This is tracked in metadata to avoid relying on filesystem atime.
   */
  lastAccessAt?: number;
};
