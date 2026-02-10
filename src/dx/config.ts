import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { IsolationMode, RelaxConfig } from '../loader.js';
import { logDebug } from './logger.js';

export type RelaxnativeRuntimeConfig = {
  /** Default isolation when not provided to loadNative() */
  defaultIsolation?: IsolationMode;
  /** Override cache root directory used by compile cache */
  cacheDir?: string;
  /** Enable debug logs without env var */
  debug?: boolean;
  /** Registry behavior hints (future-proof, non-breaking) */
  registry?: {
    autoVerify?: boolean;
    warnings?: boolean;
  };
  /** Loader config passthrough */
  loader?: RelaxConfig;
};

let cached:
  | { loaded: true; config: RelaxnativeRuntimeConfig | null }
  | { loaded: false } = { loaded: false };

function configPath(projectRoot: string) {
  return join(projectRoot, 'relaxnative.config.js');
}

/**
 * Loads optional `relaxnative.config.js` from the project root.
 *
 * - Optional: if missing, returns null
 * - Cached: reads at most once per process
 */
export async function loadOptionalConfig(
  projectRoot: string = process.cwd(),
): Promise<RelaxnativeRuntimeConfig | null> {
  if (cached.loaded) return cached.config;

  const p = configPath(projectRoot);
  if (!existsSync(p)) {
    cached = { loaded: true, config: null };
    return null;
  }

  // Dynamic import so there is zero cost when config isn't present.
  const url = pathToFileURL(resolve(p)).href;
  const mod: any = await import(url);
  const cfg = (mod?.default ?? mod) as RelaxnativeRuntimeConfig;
  cached = { loaded: true, config: cfg ?? null };
  logDebug('loaded config', { path: p });
  return cached.config;
}

/** For tests only. */
export function __resetConfigCacheForTests() {
  cached = { loaded: false };
}
