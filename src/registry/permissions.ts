import type { RelaxPermissions } from './relaxJsonTypes.js';

export type PermissionDecision = {
  allowed: boolean;
  reasons: string[];
};

export function evaluatePermissions(
  requested: RelaxPermissions | undefined,
): PermissionDecision {
  // For now, we default to allow (DX) but return reasons so CLI can warn/prompt.
  // Later: enforce by policy + deny-by-default in CI.
  const reasons: string[] = [];
  if (!requested) return { allowed: true, reasons };

  if (requested.network?.outbound) reasons.push('requests network: outbound');
  if (requested.process?.spawn) reasons.push('requests process: spawn');
  if (requested.fs?.write?.length) reasons.push('requests filesystem: write');
  if (requested.fs?.read?.length) reasons.push('requests filesystem: read');

  return { allowed: true, reasons };
}
