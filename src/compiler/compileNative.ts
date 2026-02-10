import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';

import type { CompilerInfo } from './compilerTypes.js';
import type { PlatformInfo } from './detectPlatform.js';
import type { CompileRequest, CompileResult } from './compileTypes.js';
import { buildCompileCommand } from './buildCommand.js';
import { logDebug } from '../dx/logger.js';

type CompilerDiagnostic = {
  file?: string;
  line?: number;
  col?: number;
  severity: 'error' | 'warning' | 'note';
  message: string;
  raw: string;
};

function parseDiagnostics(text: string): CompilerDiagnostic[] {
  // Common formats:
  // clang/gcc: path:line:col: error: message
  // rustc: error[E...]: message\n  --> path:line:col
  const out: CompilerDiagnostic[] = [];

  const lines = String(text ?? '').split(/\r?\n/);
  const ccRe = /^(.*?):(\d+):(\d+):\s*(warning|error|note):\s*(.*)$/;

  for (const l of lines) {
    const m = l.match(ccRe);
    if (m) {
      out.push({
        file: m[1],
        line: Number(m[2]),
        col: Number(m[3]),
        severity: m[4] as any,
        message: m[5],
        raw: l,
      });
      continue;
    }

    // rustc span line
    const m2 = l.match(/^\s*-->\s*(.*?):(\d+):(\d+)\s*$/);
    if (m2) {
      // attach span to the previous diagnostic if present
      const prev = out[out.length - 1];
      if (prev && !prev.file) {
        prev.file = m2[1];
        prev.line = Number(m2[2]);
        prev.col = Number(m2[3]);
        prev.raw += `\n${l}`;
      } else {
        out.push({ severity: 'error', file: m2[1], line: Number(m2[2]), col: Number(m2[3]), message: '', raw: l });
      }
      continue;
    }

    // rustc leading error line
    const m3 = l.match(/^(error|warning|note)(?:\[[^\]]+\])?:\s*(.*)$/);
    if (m3) {
      out.push({ severity: m3[1] as any, message: m3[2], raw: l });
      continue;
    }
  }

  return out;
}

function formatDiagnostics(diags: CompilerDiagnostic[]): string {
  if (!diags.length) return '';
  const lines: string[] = [];
  for (const d of diags) {
    const loc = d.file && d.line != null ? `${d.file}:${d.line}:${d.col ?? 0}` : d.file ?? '';
    const head = loc ? `${loc} - ${d.severity}` : d.severity;
    const msg = d.message ? `: ${d.message}` : '';
    lines.push(`${head}${msg}`);
  }
  return lines.join('\n');
}

export function compileNative(
  compiler: CompilerInfo,
  platform: PlatformInfo,
  request: CompileRequest,
): CompileResult {
  mkdirSync(request.outDir, { recursive: true });

  const result = buildCompileCommand(compiler, platform, request);

  try {
    logDebug('compile', { compiler: compiler.path, cmd: result.command, sourcePath: request.sourcePath });
    execFileSync(compiler.path, result.command, {
      stdio: 'inherit',
    });
  } catch (err) {
    // Re-run capturing output so errors can be mapped to native file/line/col.
    // This is only done on failure.
    try {
      const out = execFileSync(compiler.path, result.command, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as unknown as string;
      // If we got here, the second run surprisingly succeeded.
      logDebug('compile recovered on retry', { sourcePath: request.sourcePath, outLen: out?.length ?? 0 });
    } catch (err2: any) {
      const stdout = String(err2?.stdout ?? '');
      const stderr = String(err2?.stderr ?? '');
      const diags = parseDiagnostics([stderr, stdout].filter(Boolean).join('\n'));
      const formatted = formatDiagnostics(diags);

      const details = formatted
        ? `\n\n${formatted}`
        : stderr || stdout
          ? `\n\n${(stderr || stdout).trim()}`
          : '';
      throw new Error(`Native compilation failed for ${request.sourcePath}${details}`);
    }

    throw new Error(`Native compilation failed for ${request.sourcePath}`);
  }

  return result;
}
