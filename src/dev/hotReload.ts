import { watch } from 'node:fs';
import { dirname } from 'node:path';

import { detectCompilers } from '../compiler/detect.js';
import { compileWithCache } from '../compiler/compileWithCache.js';
import { detectLanguage } from '../compiler/detectLanguage.js';
import { parseNativeSource } from '../parser/index.js';
import { loadFfi } from '../ffi/index.js';
import { wrapFunctions } from '../worker/wrapFunctions.js';

export type HotReloadOptions = {
  isolation?: 'in-process' | 'worker' | 'process';
  onReload?: (info: { sourcePath: string; durationMs: number }) => void;
};

export type HotReloadHandle = {
  /** current module; stable identity, updated on reload */
  mod: any;
  close(): void;
};

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fingerprintBindings(bindings: any): string {
  // ABI-ish fingerprint: names + returns + args types.
  const entries = Object.entries(bindings?.functions ?? {}).map(([k, v]: any) => {
    return `${k}:${v.returns}(${(v.args ?? []).join(',')})`;
  });
  entries.sort();
  return entries.join('|');
}

export async function loadNativeDevHot(
  sourcePath: string,
  opts?: HotReloadOptions,
): Promise<HotReloadHandle> {
  const enabled = process.env.RELAXNATIVE_DEV === '1';
  if (!enabled) {
    throw new Error('Hot reload is only available when RELAXNATIVE_DEV=1');
  }

  const { c, rust, platform } = detectCompilers();

  const isolation = opts?.isolation ?? 'worker';

  let current: { libPath: string; bindings: any; abi: string; api: any; mod: any } | null = null;

  const buildOnce = () => {
    const language = detectLanguage(sourcePath);
    const compiler = language === 'rust' ? rust : c;
    if (!compiler) throw new Error(`No compiler for ${language}`);

    const t0 = process.hrtime.bigint();
    const compileRes = compileWithCache(compiler, platform, {
      sourcePath,
      outDir: '.cache/native',
    });
    const bindings = parseNativeSource(sourcePath, language);
    const api = loadFfi(compileRes.outputPath, bindings);
    const mod = wrapFunctions(api, compileRes.outputPath, bindings, { isolation });
    const abi = fingerprintBindings(bindings);
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1e6;

    return { libPath: compileRes.outputPath, bindings, abi, api, mod, durationMs };
  };

  const first = buildOnce();
  current = { ...first, mod: first.mod };

  // Stable proxy: keeps object identity for imports.
  const stable = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === '__isHotReloadProxy') return true;
        if (prop === 'then') return undefined;
        const target = current?.mod;
        if (!target) return undefined;
        return (target as any)[prop as any];
      },
      ownKeys() {
        return Reflect.ownKeys(current?.mod ?? {});
      },
      getOwnPropertyDescriptor(_t, prop) {
        return Object.getOwnPropertyDescriptor(current?.mod ?? {}, prop);
      },
    },
  );

  const watcher = watch(dirname(sourcePath), { persistent: false }, (event, filename) => {
    if (!filename) return;
    if (!String(filename).endsWith(sourcePath.split('/').pop() ?? '')) return;

    try {
      const next = buildOnce();
      if (current && next.abi !== current.abi) {
        log(`[relaxnative] ABI change detected in ${sourcePath}; reload requires restart`);
        return;
      }

      current = { ...next, mod: next.mod };
      const ms = next.durationMs;
      log(`[relaxnative] Recompiled ${sourcePath} (${ms.toFixed(0)}ms)`);
      opts?.onReload?.({ sourcePath, durationMs: ms });
    } catch (err: any) {
      log(`[relaxnative] Hot reload failed for ${sourcePath}: ${err?.message ?? String(err)}`);
    }
  });

  return {
    mod: stable,
    close() {
      watcher.close();
    },
  };
}
