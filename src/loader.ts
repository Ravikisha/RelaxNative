import { detectCompilers } from './compiler/detect.js';
import { compileWithCache } from './compiler/compileWithCache.js';
import { detectLanguage } from './compiler/detectLanguage.js';
import { parseNativeSource } from './parser/index.js';
import { loadFfi } from './ffi/index.js';
import { wrapFunctions } from './worker/wrapFunctions.js';
import { loadNativeDevHot } from './dev/hotReload.js';

export type ExecutionMode = 'sync' | 'async';

export type RelaxConfig = {
  /**
   * Force execution mode by function name (exact match).
   * Example: { heavy: 'async', add: 'sync' }
   */
  functionMode?: Record<string, ExecutionMode>;
  /**
   * Default mode when no annotation/config provided.
   * Keeping default as 'sync' for low-latency trivial calls.
   */
  defaultMode?: ExecutionMode;
};

export type IsolationMode = 'in-process' | 'worker' | 'process';

async function buildNative(
  sourcePath: string,
  options?: { config?: RelaxConfig },
): Promise<{ libPath: string; bindings: any; api: Record<string, Function> }> {
  const { c, rust, platform } = detectCompilers();
  const language = detectLanguage(sourcePath);
  const compiler = language === 'rust' ? rust : c;

  if (!compiler) {
    throw new Error(`No compiler for ${language}`);
  }

  const compileResult = compileWithCache(compiler, platform, {
    sourcePath,
    outDir: '.cache/native',
  });

  const bindings = parseNativeSource(sourcePath, language);

  // apply user overrides deterministically (before any execution)
  const config = options?.config;
  if (config?.functionMode) {
    for (const [name, mode] of Object.entries(config.functionMode)) {
      if (bindings.functions?.[name]) {
        bindings.functions[name] = {
          ...bindings.functions[name],
          mode,
        };
      }
    }
  }
  if (config?.defaultMode) {
    for (const [name, binding] of Object.entries(bindings.functions ?? {})) {
      if (!binding.mode) {
        bindings.functions[name] = { ...binding, mode: config.defaultMode };
      }
    }
  }

  // expose bindings to worker
  (globalThis as any).__bindings = bindings;

  const api = loadFfi(compileResult.outputPath, bindings);
  return { libPath: compileResult.outputPath, bindings, api };
}

export async function loadNative(
  sourcePath: string,
  options?: { config?: RelaxConfig; isolation?: IsolationMode },
) {
  // Dev-mode hot reload integration:
  // When explicitly enabled, return a stable proxy module that reloads on change.
  // Config overrides aren't currently supported through hot reload (kept explicit).
  if (process.env.RELAXNATIVE_DEV === '1') {
    if (options?.config) {
      throw new Error('RELAXNATIVE_DEV=1: loadNative() does not support config overrides yet');
    }
    const handle = await loadNativeDevHot(sourcePath, { isolation: options?.isolation });
    return handle.mod;
  }

  const { libPath, bindings, api } = await buildNative(sourcePath, options);
  const isolation = options?.isolation ?? 'worker';
  return wrapFunctions(api, libPath, bindings, { isolation });
}

/**
 * Advanced API: returns both the wrapped module and the computed bindings.
 * Useful for registry loaders to attach safety metadata.
 */
export async function loadNativeWithBindings(
  sourcePath: string,
  options?: {
    config?: RelaxConfig;
    isolation?: IsolationMode;
    mutateBindings?: (bindings: any) => void;
  },
): Promise<{ mod: any; bindings: any }> {
  const { libPath, bindings, api } = await buildNative(sourcePath, options);

  if (options?.mutateBindings) {
    options.mutateBindings(bindings);
  }

  const isolation = options?.isolation ?? 'worker';
  const mod = wrapFunctions(api, libPath, bindings, { isolation });
  return { mod, bindings };
}

/**
 * Advanced API: wrap a pre-built native lib + bindings pair.
 * Registry loaders can attach safety metadata to bindings before wrapping.
 */
// (kept for potential future use, but not exported for now)
