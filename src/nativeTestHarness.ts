import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { detectCompilers } from './compiler/detect.js';
import { compileWithCache } from './compiler/compileWithCache.js';
import { detectLanguage } from './compiler/detectLanguage.js';
import { parseNativeSource } from './parser/index.js';
import { loadFfi } from './ffi/index.js';
import { loadNativeWithBindings } from './loader.js';

export type NativeTestKind = 'int' | 'cstring';

export type NativeTestCase = {
  name: string; // e.g. test_add
  sourcePath: string;
  line?: number;
  kind: NativeTestKind;
};

export type NativeTestResult = {
  name: string;
  ok: boolean;
  message?: string;
  sourcePath: string;
  line?: number;
  durationMs: number;
};

const NATIVE_EXTS = new Set(['.c', '.cpp', '.cc', '.cxx', '.rs']);

function isNativeFile(p: string) {
  return NATIVE_EXTS.has(extname(p));
}

export function discoverNativeTestFiles(rootDir: string): string[] {
  const out: string[] = [];

  function walk(dir: string) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && isNativeFile(p)) out.push(p);
    }
  }

  if (!existsSync(rootDir)) return [];
  walk(rootDir);

  // Prefer *_test.* (but allow inline tests too)
  out.sort((a, b) => {
    const at = /_test\./.test(a) ? 0 : 1;
    const bt = /_test\./.test(b) ? 0 : 1;
    return at - bt || a.localeCompare(b);
  });

  return out;
}

export function discoverNativeTestsFromFile(sourcePath: string): NativeTestCase[] {
  // Primary discovery strategy: lightweight scan of the raw source.
  // This avoids relying on full type-mapping correctness in the parser.
  //
  // Supported forms (C/C++):
  //   int test_name(...)
  //   const char* test_name(...)
  //   const char * test_name(...)
  //
  // Rust isn't supported here yet (would need #[no_mangle] extern "C" and a different scan).
  const src = readFileSync(sourcePath, 'utf8');
  const lines = src.split(/\r?\n/);

  const out: NativeTestCase[] = [];
  const re = /^(?:\s*)(const\s+char\s*\*|int)\s+(test_[A-Za-z0-9_]+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const ret = m[1];
    const name = m[2];
    const kind: NativeTestKind = /^int\b/.test(ret) ? 'int' : 'cstring';
    out.push({ name, sourcePath, line: i + 1, kind });
  }

  // Secondary strategy: if regex found nothing, fall back to parser-based discovery.
  if (out.length) return out;

  const language = detectLanguage(sourcePath);
  const bindings = parseNativeSource(sourcePath, language);
  const tests: NativeTestCase[] = [];
  for (const [name, fn] of Object.entries(bindings.functions ?? {})) {
    if (!name.startsWith('test_')) continue;
    const ret = (fn as any).returns as string;
    const kind: NativeTestKind =
      ret === 'int' || ret === 'uint' || ret === 'long' || ret === 'size_t'
        ? 'int'
        : 'cstring';
    tests.push({
      name,
      sourcePath,
      line: (fn as any).sourceLine,
      kind,
    });
  }
  return tests;
}

export function discoverNativeTests(rootDir: string): NativeTestCase[] {
  const files = discoverNativeTestFiles(rootDir);
  const all: NativeTestCase[] = [];
  for (const f of files) {
    all.push(...discoverNativeTestsFromFile(f));
  }
  return all;
}

function formatLocation(sourcePath: string, line?: number) {
  if (!line) return sourcePath;
  return `${sourcePath}:${line}`;
}

export function formatNativeTestResults(results: NativeTestResult[]) {
  const lines: string[] = [];

  for (const r of results) {
    if (r.ok) {
      lines.push(`✓ ${r.name}`);
    } else {
      const loc = formatLocation(r.sourcePath, r.line);
      const msg = r.message ? ` (${r.message})` : '';
      lines.push(`✗ ${r.name}${msg}`);
      lines.push(`  at ${loc}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  lines.push('');
  lines.push(`${passed} passed, ${failed} failed`);

  return lines.join('\n');
}

export async function runNativeTests(
  rootDir: string,
  opts?: { isolation?: 'in-process' | 'worker' | 'process' },
): Promise<{ results: NativeTestResult[]; exitCode: number }> {
  const isolation = opts?.isolation ?? 'in-process';

  const tests = discoverNativeTests(rootDir);
  if (!tests.length) {
    return { results: [], exitCode: 0 };
  }

  const { c, rust, platform } = detectCompilers();

  // Group tests by source file; compile each once (caching handles repeat runs)
  const byFile = new Map<string, NativeTestCase[]>();
  for (const t of tests) {
    const arr = byFile.get(t.sourcePath) ?? [];
    arr.push(t);
    byFile.set(t.sourcePath, arr);
  }

  const results: NativeTestResult[] = [];

  for (const [sourcePath, cases] of byFile) {
    const language = detectLanguage(sourcePath);
    const compiler = language === 'rust' ? rust : c;
    if (!compiler) throw new Error(`No compiler for ${language}`);

    const compileRes = compileWithCache(compiler, platform, {
      sourcePath,
      outDir: '.cache/native',
    });

    // In-process uses loadFfi directly to keep it fast.
    // For worker/process isolation, we generate synthetic bindings for the discovered
    // test_* functions so return types marshal correctly and exports reliably exist.
    let api: any;
    if (isolation === 'in-process') {
      const bindings = parseNativeSource(sourcePath, language);
      api = loadFfi(compileRes.outputPath, bindings);
    } else {
      const synth = {
        functions: Object.fromEntries(
          cases.map((tc) => [
            tc.name,
            {
              name: tc.name,
              // Note: mapType supports "char*" (and "cstring" used to), but
              // some environments/version combos reject "cstring" when sent
              // across worker/process boundaries. Use a stable alias.
              returns: tc.kind === 'int' ? 'int' : 'char*',
              args: [],
              mode: 'sync',
              cost: 'low',
            },
          ]),
        ),
      };

      const { mod } = await loadNativeWithBindings(sourcePath, {
        isolation,
        mutateBindings(bindings) {
          // Replace bindings functions with our synthetic test bindings.
          // Keep any extra metadata (like __safety) intact.
          bindings.functions = synth.functions;
        },
      });
      api = mod;
    }

    for (const tc of cases) {
      const fn = (api as any)[tc.name];
      if (typeof fn !== 'function') {
        results.push({
          name: tc.name,
          ok: false,
          message: `Function not found: ${tc.name}`,
          sourcePath: tc.sourcePath,
          line: tc.line,
          durationMs: 0,
        });
        continue;
      }

      const start = process.hrtime.bigint();
      let ok = false;
      let message: string | undefined;

      try {
        const out = fn();
        const awaited = out instanceof Promise ? await out : out;
        if (tc.kind === 'int') {
          ok = Number(awaited) === 0;
          if (!ok) message = `returned ${String(awaited)}`;
        } else {
          // cstring: NULL => pass, else error message
          ok = awaited == null || String(awaited).length === 0;
          if (!ok) message = String(awaited);
        }
      } catch (err: any) {
        ok = false;
        message = err?.message ?? String(err);
      }

      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;

      results.push({
        name: tc.name,
        ok,
        message,
        sourcePath: tc.sourcePath,
        line: tc.line,
        durationMs,
      });
    }
  }

  const failed = results.some((r) => !r.ok);
  return { results, exitCode: failed ? 1 : 0 };
}

// Very small helper for printing an optional snippet around a failing line.
export function getSourceLine(sourcePath: string, line?: number): string | null {
  if (!line) return null;
  try {
    const src = readFileSync(sourcePath, 'utf8');
    const lines = src.split(/\r?\n/);
    return lines[line - 1] ?? null;
  } catch {
    return null;
  }
}
