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
  const entry = JSON.parse(raw) as CacheEntry;

  // Update "last access" in metadata so UX doesn't depend on filesystem atime.
  // Best-effort: failure to write should never break normal loads.
  try {
    const next: CacheEntry = {
      ...entry,
      lastAccessAt: Date.now(),
    };
    writeFileSync(metaPath, JSON.stringify(next, null, 2));
    return next;
  } catch {
    return entry;
  }
}

export function saveCacheEntry(entry: CacheEntry): void {
  const dir = getCacheEntry(entry.hash);
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify(entry, null, 2),
  );
}
