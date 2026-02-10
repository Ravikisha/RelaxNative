import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type RegistrySignature = {
  /** algorithm identifier for forward compatibility */
  alg: 'sha256';
  /** expected sha256 digest (hex) */
  digest: string;
};

export function sha256FileHex(filePath: string): string {
  const buf = readFileSync(filePath);
  const hash = createHash('sha256').update(buf).digest('hex');
  return hash;
}

export function sha256RelaxJsonWithoutSignatureHex(jsonPath: string): { ok: true; digest: string } | { ok: false; reason: string } {
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'Invalid JSON' };
    // Remove signature field so the digest is stable.
    if ('registrySignature' in parsed) delete (parsed as any).registrySignature;
    const canonical = JSON.stringify(parsed, null, 2);
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
    return { ok: true, digest };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'Failed to hash relax.json' };
  }
}

export function verifyRegistrySignature(pkgDir: string, sig?: RegistrySignature): { ok: boolean; reason?: string } {
  // For now we implement a deterministic, offline signature:
  // - signature supplies sha256(relax.json bytes)
  // Later, a hosted registry can replace this with an actual public-key signature.
  if (!sig) return { ok: false, reason: 'Missing registrySignature' };
  if (sig.alg !== 'sha256') return { ok: false, reason: `Unsupported signature alg: ${sig.alg}` };

  const jsonPath = join(pkgDir, 'relax.json');
  if (!existsSync(jsonPath)) return { ok: false, reason: 'Missing relax.json' };

  const digestRes = sha256RelaxJsonWithoutSignatureHex(jsonPath);
  if (!digestRes.ok) return { ok: false, reason: digestRes.reason };
  const digest = digestRes.digest;
  try {
    const a = Buffer.from(digest, 'hex');
    const b = Buffer.from(sig.digest, 'hex');
    if (a.length !== b.length) return { ok: false, reason: 'Digest length mismatch' };
    if (!timingSafeEqual(a, b)) return { ok: false, reason: 'Digest mismatch' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Invalid digest encoding' };
  }
}
