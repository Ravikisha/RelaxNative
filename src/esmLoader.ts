// Node ESM Loader (Node >= 18)
// Supports:
//   import mod from './native/add.c'
//   import matrix from 'relaxnative/fast-matrix'
//
// This loader is intentionally stateless. All determinism/caching is delegated
// to the existing Relaxnative pipeline (compileWithCache -> computeHash -> cache).

import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, extname, join, resolve as resolvePath } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';

type ResolveContext = {
  parentURL?: string;
};

type LoadContext = {
  format?: string;
};

const NATIVE_EXTS = new Set(['.c', '.cpp', '.cc', '.cxx', '.rs']);

function isNativePath(p: string) {
  return NATIVE_EXTS.has(extname(p));
}

function encodeVirtual(fileUrl: string) {
  // Keep the URL scheme as file: so Node internals (package scope resolution)
  // don’t choke on unknown protocols.
  const u = new URL(fileUrl);
  u.searchParams.set('relaxnative', '1');
  return u.href;
}

function isVirtual(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'file:' && u.searchParams.get('relaxnative') === '1';
  } catch {
    return false;
  }
}

function findProjectRoot(fromDir: string): string {
  // deterministic upward search for nearest package.json
  let cur = fromDir;
  while (true) {
    if (existsSync(join(cur, 'package.json'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return fromDir;
    cur = parent;
  }
}

function resolveRegistrySpecifier(spec: string, parentURL?: string): string {
  const prefix = 'relaxnative/';
  const pkg = spec.slice(prefix.length);
  const parentPath = parentURL?.startsWith('file:')
    ? dirname(fileURLToPath(parentURL))
    : process.cwd();
  const root = findProjectRoot(parentPath);
  const pkgDir = join(root, 'native', 'registry', pkg);
  if (!existsSync(pkgDir)) {
    throw new Error(
      `RelaxRegistry package not found: ${pkg} (expected at ${pkgDir})`,
    );
  }

  const relaxJsonPath = join(pkgDir, 'relax.json');
  if (existsSync(relaxJsonPath)) {
  const raw = readFileSync(relaxJsonPath, 'utf8');
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid relax.json: ${relaxJsonPath}`);
    }

    const exp = parsed?.exports?.[0];
    if (!exp?.source) {
      throw new Error(`relax.json missing exports[0].source: ${relaxJsonPath}`);
    }
    const entry = join(pkgDir, exp.source);
    if (!existsSync(entry)) {
      throw new Error(`Registry entry not found: ${entry}`);
    }
    return entry;
  }

  // infer: single native file in pkgDir
  const candidates = readdirSync(pkgDir)
    .filter((f) => isNativePath(f))
    .map((f) => join(pkgDir, f));

  if (candidates.length !== 1) {
    throw new Error(
      `Cannot infer registry entry for ${spec}. Add relax.json or ensure exactly one native file exists in ${pkgDir}`,
    );
  }

  return candidates[0];
}

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: any,
) {
  // registry imports
  if (specifier.startsWith('relaxnative/')) {
    const entryPath = resolveRegistrySpecifier(specifier, context.parentURL);
    return {
      url: encodeVirtual(pathToFileURL(entryPath).href),
      shortCircuit: true,
    };
  }

  // local native imports
  if (isNativePath(specifier)) {
    // resolve to absolute file URL first (so relative specifiers work)
    const parentPath = context.parentURL?.startsWith('file:')
      ? dirname(fileURLToPath(context.parentURL))
      : process.cwd();
    const abs = resolvePath(parentPath, specifier);
    return {
      url: encodeVirtual(pathToFileURL(abs).href),
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: LoadContext,
  nextLoad: any,
) {
  if (isVirtual(url)) {
    const u = new URL(url);
    u.searchParams.delete('relaxnative');
    const sourcePath = fileURLToPath(u);

    // Virtual module strategy:
    // - only embed the native file path
    // - call existing loadNative() at module init
    // - export default the resolved API
    // Determinism: compilation caching is handled by compileWithCache.
  const loaderDir = dirname(fileURLToPath(import.meta.url));
  // When built, loader lives at dist/esmLoader.js, and runtime entry is dist/index.js.
  // When running from TS via tsx/ts-node, directory layout differs; tests use dist.
  const distEntry = pathToFileURL(join(loaderDir, 'index.js')).href;

  const source = `import { loadNative } from ${JSON.stringify(distEntry)};

const __api = await loadNative(${JSON.stringify(sourcePath)});
export default __api;
`;

    return {
      format: 'module',
      source,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
