import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import type { CompilerInfo } from './compilerTypes.js';
import type { PlatformInfo } from './detectPlatform.js';
import type { CompileRequest, CompileResult } from './compileTypes.js';

import { computeHash } from '../cache/hash.js';
import {
  cacheExists,
  loadCacheEntry,
  saveCacheEntry,
} from '../cache/cacheManager.js';
import { compileNative } from './compileNative.js';
import { getCacheEntry } from '../cache/cachePaths.js';
import { logDebug } from '../dx/logger.js';

export function compileWithCache(
  compiler: CompilerInfo,
  platform: PlatformInfo,
  request: CompileRequest,
): CompileResult {
  const flags = request.flags ?? [];

  const hash = computeHash({
    sourcePath: request.sourcePath,
    compiler,
    flags,
    platform: `${platform.platform}-${platform.arch}`,
  });

  if (cacheExists(hash)) {
    logDebug('cache hit', { hash, sourcePath: request.sourcePath });
    const entry = loadCacheEntry(hash);
    return {
      language: compiler.kind === 'rust' ? 'rust' : 'c',
      outputPath: entry.outputPath,
      command: [],
    };
  }

  logDebug('cache miss', { hash, sourcePath: request.sourcePath });

  // Compile into cache directory
  const cacheDir = getCacheEntry(hash);
  mkdirSync(cacheDir, { recursive: true });

  const result = compileNative(compiler, platform, {
    ...request,
    outDir: cacheDir,
  });

  saveCacheEntry({
    hash,
    sourcePath: request.sourcePath,
    outputPath: result.outputPath,
    compilerPath: compiler.path,
    compilerVersion: compiler.version,
    flags,
    platform: `${platform.platform}-${platform.arch}`,
    createdAt: Date.now(),
  lastAccessAt: Date.now(),
  });

  return result;
}
