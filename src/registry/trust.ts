export type TrustLevel = 'local' | 'community' | 'verified';

export type TrustPolicy = {
  /** Whether to prompt before installing (or refuse if non-interactive). */
  requireConfirm: boolean;
  /** Whether to show warnings even if installation proceeds. */
  warnOnInstall: boolean;
  /** Default isolation mode for *loading/executing* this package. */
  defaultIsolation: 'in-process' | 'worker' | 'process';
  /** Default execution mode for functions unless overridden by bindings/config. */
  defaultExecutionMode: 'sync' | 'async';
  /** Permissions policy: whether the installer should allow a package to request elevated permissions. */
  allowPermissions: boolean;
};

export function normalizeTrustLevel(value: any): TrustLevel {
  if (value === 'local' || value === 'community' || value === 'verified') return value;
  return 'community';
}

export function trustPolicy(level: TrustLevel): TrustPolicy {
  // Defaults are conservative and aligned with your existing registry stance:
  // - registry code should generally run in process isolation.
  // - community packages need an explicit acknowledge.
  // - local packages are trusted by author, but still default to safe isolation.
  if (level === 'verified') {
    return {
      requireConfirm: false,
      warnOnInstall: false,
      defaultIsolation: 'process',
      defaultExecutionMode: 'sync',
      allowPermissions: true,
    };
  }

  if (level === 'local') {
    return {
      requireConfirm: false,
      warnOnInstall: false,
      defaultIsolation: 'process',
      defaultExecutionMode: 'sync',
      allowPermissions: true,
    };
  }

  // community
  return {
    requireConfirm: true,
    warnOnInstall: true,
    defaultIsolation: 'process',
    defaultExecutionMode: 'async',
    allowPermissions: false,
  };
}
