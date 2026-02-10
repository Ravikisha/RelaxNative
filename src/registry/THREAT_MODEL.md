# Native Safety Layer threat model

## Assets

- Host machine integrity (no arbitrary code execution beyond the intended native module)
- User data (filesystem)
- Credentials/secrets accessible to the Node process
- Network perimeter (no exfiltration, no unexpected network access)
- Availability (no crashes, no infinite loops)

## Trust levels

| Trust | Meaning | Default isolation | UX |
|---|---|---:|---|
| `local` | Developer-owned code in the repo | `worker` | silent |
| `community` | Third-party registry package | `process` | warn + consent when risky |
| `verified` | Audited/publisher-verified package | `process` | minimal/no warnings (unless explicitly risky) |

## Threats

- **T1: Process crash**: SIGSEGV / abort / illegal instruction
- **T2: Command execution**: `system()`, `exec*`, spawning shells
- **T3: Filesystem access**: read secrets, write persistence
- **T4: Network access**: exfiltration, lateral movement
- **T5: Raw syscalls / ROP**: bypass higher-level restrictions
- **T6: JIT / W^X violations**: allocating executable memory
- **T7: Resource exhaustion**: tight loops, memory bloat

## Mitigations in Relaxnative

- **Crash isolation**: `isolation: 'process'` runs native code in a helper process; parent survives and restarts helper on crash.
- **Static scan**: deterministic, conservative regex scan surfaces risky APIs pre-compile.
- **Runtime permission guards (best-effort)**: in process isolation mode, restrict common Node capabilities (fs/network/process/thread creation) in the helper.
- **Execution limits**:
  - per-call timeout (enforced by killing helper)
  - optional memory cap (best-effort; kill helper if exceeded)

## Non-goals (today)

- Kernel-enforced sandboxing (seccomp, containers, VMs)
- Perfect syscall-level mediation
- Preventing *all* side effects for in-process/worker-thread modes

For production-grade sandboxing we can add an optional hardened runtime later (seccomp-bpf on Linux, AppContainer on Windows, sandbox-exec on macOS).
