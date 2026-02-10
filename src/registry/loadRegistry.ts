import { join } from 'path';

import { readRelaxJson } from './relaxJson.js';
import { getInstalledPackageDir } from './registryPaths.js';
import { loadNativeWithBindings } from '../loader.js';
import { normalizeTrustLevel, trustPolicy } from './trust.js';

export async function loadRegistry(
  pkg: string,
  projectRoot: string = process.cwd(),
) {
  const pkgDir = getInstalledPackageDir(pkg, projectRoot);
  const manifest = readRelaxJson(pkgDir);
  const entry = manifest.exports[0];
  if (!entry?.source) throw new Error(`No exports[0].source for ${pkg}`);

  const trust = normalizeTrustLevel(manifest.trust);
  const policy = trustPolicy(trust);

  // Trust policy affects:
  // - permissions: community cannot request elevated perms by default
  // - isolation: default to crash-safe process isolation
  // - default execution mode
  const safety = {
    trust,
    permissions: manifest.permissions,
    limits: manifest.limits,
  };

  const sourcePath = join(pkgDir, entry.source);

  const { mod } = await loadNativeWithBindings(sourcePath, {
    isolation: manifest.defaultIsolation ?? policy.defaultIsolation,
    config: {
      functionMode: manifest.functionMode,
      defaultMode: manifest.defaultExecutionMode ?? policy.defaultExecutionMode,
    },
    mutateBindings(bindings) {
      bindings.__safety = safety;
    },
  });

  // Expose internal test hooks only for tests.
  if (process.env.VITEST) {
    (mod as any).__test_forbidden_fs = () => (mod as any).__call('__test_forbidden_fs');
    (mod as any).__test_forbidden_net = () => (mod as any).__call('__test_forbidden_net');
    (mod as any).__test_forbidden_spawn = () => (mod as any).__call('__test_forbidden_spawn');
  }

  return mod;
}
