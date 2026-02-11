import { basename } from 'path';

import type { CompilerInfo } from './compilerTypes.js';
import type { PlatformInfo } from './detectPlatform.js';
import type { CompileRequest, CompileResult } from './compileTypes.js';
import { detectLanguage } from './detectLanguage.js';
import { getSharedLibName } from './outputNaming.js';

export function buildCompileCommand(
  compiler: CompilerInfo,
  platform: PlatformInfo,
  request: CompileRequest,
): CompileResult {
  const language = detectLanguage(request.sourcePath);
  const baseName = basename(request.sourcePath).split('.')[0];
  const outputName = getSharedLibName(baseName, platform);
  const outputPath = `${request.outDir}/${outputName}`;

  const userFlags = request.flags ?? [];
  const sources = [request.sourcePath, ...(request.sources ?? [])];
  const includePaths = request.includePaths ?? [];
  const libraryPaths = request.libraryPaths ?? [];
  const libraries = request.libraries ?? [];

  // Translate higher-level options to compiler flags.
  // Note: We intentionally keep this conservative/portable. Users can always
  // drop to `flags` for advanced scenarios.
  const includeFlags =
    compiler.vendor === 'msvc'
      ? includePaths.map((p) => `/I${p}`)
      : includePaths.flatMap((p) => ['-I', p]);
  const libPathFlags =
    compiler.vendor === 'msvc'
      ? libraryPaths.map((p) => `/LIBPATH:${p}`)
      : libraryPaths.flatMap((p) => ['-L', p]);
  const libFlags =
    compiler.vendor === 'msvc'
      ? libraries.map((l) => `${l}.lib`)
      : libraries.flatMap((l) => ['-l', l]);

  const flags = [...includeFlags, ...libPathFlags, ...libFlags, ...userFlags];

  let command: string[] = [];

  if (language === 'c' || language === 'cpp') {
    if (compiler.vendor === 'msvc') {
      command = [
  ...sources,
        '/LD',
        `/Fe:${outputPath}`,
        ...flags,
      ];
    } else {
      command = [
  ...sources,
        '-shared',
        '-fPIC',
        '-o',
        outputPath,
        ...flags,
      ];
    }
  }

  if (language === 'rust') {
    command = [
      request.sourcePath,
      '--crate-type',
      'cdylib',
      '-O',
      '-o',
      outputPath,
      ...flags,
    ];
  }

  return {
    language,
    outputPath,
    command,
  };
}
