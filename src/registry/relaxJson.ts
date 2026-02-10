import { readFileSync } from 'fs';
import { join } from 'path';

import type { RelaxJson } from './relaxJsonTypes.js';
import { normalizeTrustLevel } from './trust.js';

export function readRelaxJson(pkgDir: string): RelaxJson {
  const jsonPath = join(pkgDir, 'relax.json');
  const raw = readFileSync(jsonPath, 'utf8');
  const parsed = JSON.parse(raw);

  // minimal validation
  if (!parsed?.name || !parsed?.version || !Array.isArray(parsed?.exports)) {
    throw new Error(`Invalid relax.json at ${jsonPath}`);
  }

  // normalize + light validation
  parsed.trust = normalizeTrustLevel(parsed.trust);

  if (parsed.trust === 'verified') {
    const sig = parsed.registrySignature;
    if (
      !sig ||
      sig.alg !== 'sha256' ||
      typeof sig.digest !== 'string' ||
      sig.digest.length < 32
    ) {
      // Don't throw here (installer will provide a clearer error);
      // but keep manifest in a consistent shape.
      parsed.registrySignature = sig;
    }
  }

  return parsed as RelaxJson;
}
