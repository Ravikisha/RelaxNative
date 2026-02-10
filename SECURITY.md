# Security Policy

## Reporting a vulnerability

Please **do not** open public issues for security-sensitive reports.

Email: `security@replace-me.example` (update this before publishing)

Include:
- affected version
- OS / Node version
- minimal reproduction
- impact assessment

## Supply-chain trust levels (RelaxRegistry)

Relaxnative supports third-party native registry packages installed into `native/registry/`.

Trust levels:
- `local`: packages you built/installed locally
- `community`: third-party packages (requires confirmation on first install)
- `verified`: registry-signed packages (silent install)

Even with process isolation and runtime guards, **native code can be dangerous**.
Prefer `process` isolation for third-party packages.
