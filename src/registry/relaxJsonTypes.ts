export type RelaxPermissions = {
  fs?: {
    read?: string[];
    write?: string[];
  };
  network?: {
    outbound?: boolean;
  };
  process?: {
    spawn?: boolean;
  };
};

export type RelaxExport = {
  /** source file relative to the package root */
  source: string;
  /** optional name for JS default export (defaults to package name) */
  name?: string;
};

export type RelaxJson = {
  name: string;
  version: string;
  /** Trust level of the package (affects UX + defaults). */
  trust?: 'local' | 'community' | 'verified';
  /** Required for verified packages (provided by registry, validated at install). */
  registrySignature?: {
    alg: 'sha256';
    digest: string;
  };
  language?: 'c' | 'cpp' | 'rust';
  exports: RelaxExport[];
  /** compiler flags applied during compilation */
  flags?: string[];
  /** security permissions requested by this package */
  permissions?: RelaxPermissions;
  /** runtime limits (best-effort) */
  limits?: {
    /** max wall clock time per call in ms (process isolation enforces by killing helper) */
    timeoutMs?: number;
    /** best-effort soft cap for native heap in bytes (enforced only in process isolation) */
    memoryBytes?: number;
  };
  /** execution hints by function name */
  functionMode?: Record<string, 'sync' | 'async'>;
  /** Default isolation preference for this package (installer may enforce stricter). */
  defaultIsolation?: 'in-process' | 'worker' | 'process';
  /** Default execution mode for functions when not specified; most useful for async-only APIs. */
  defaultExecutionMode?: 'sync' | 'async';
};
