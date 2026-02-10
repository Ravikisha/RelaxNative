import { readFileSync } from 'fs';

export type StaticScanFinding = {
  rule: string;
  message: string;
  line?: number;
};

export function staticScanNativeSource(
  sourcePath: string,
): StaticScanFinding[] {
  const src = readFileSync(sourcePath, 'utf8');
  const lines = src.split(/\r?\n/);

  // This is intentionally simple and deterministic.
  // It’s not a sandbox. It’s an early warning mechanism.
  const rules: Array<{ rule: string; re: RegExp; message: string }> = [
    {
      rule: 'process-spawn',
      re: /\b(system|popen|fork|execv|execve|execvp|execvpe|execl|execlp|CreateProcessW|WinExec)\b/,
      message: 'Potential process execution API found',
    },
    {
      rule: 'raw-syscall',
      re: /\b(syscall|__syscall)\b/,
      message: 'Raw syscall usage found',
    },
    {
      rule: 'file-io',
      re: /\b(fopen|open|CreateFileW|unlink|remove|rename)\b/,
      message: 'Potential filesystem API found',
    },
    {
      rule: 'network',
      re: /\b(socket|connect|bind|listen|accept|recv|send|getaddrinfo)\b/,
      message: 'Potential network API found',
    },
    {
      rule: 'w-x-memory',
      re: /\b(mprotect|VirtualProtect|PROT_EXEC|PAGE_EXECUTE_READWRITE)\b/,
      message: 'Writable/executable memory pattern found',
    },
    {
      rule: 'dynamic-loader',
      re: /\b(dlopen|LoadLibraryA|LoadLibraryW)\b/,
      message: 'Dynamic loader API found',
    },
  ];

  const findings: StaticScanFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const r of rules) {
      if (r.re.test(line)) {
        findings.push({ rule: r.rule, message: r.message, line: i + 1 });
      }
    }
  }

  return findings;
}
