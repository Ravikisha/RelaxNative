import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

import type { CacheEntry } from './cacheTypes.js';
import { getCacheEntry } from './cachePaths.js';

export function cacheExists(hash: string): boolean {
  return existsSync(getCacheEntry(hash));
}

export function loadCacheEntry(hash: string): CacheEntry {
  const metaPath = join(getCacheEntry(hash), 'meta.json');
  const raw = readFileSync(metaPath, 'utf8');
  return JSON.parse(raw);
}

export function saveCacheEntry(entry: CacheEntry): void {
  const dir = getCacheEntry(entry.hash);
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify(entry, null, 2),
  );
}
