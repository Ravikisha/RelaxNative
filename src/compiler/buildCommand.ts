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

  const flags = request.flags ?? [];

  let command: string[] = [];

  if (language === 'c' || language === 'cpp') {
    if (compiler.vendor === 'msvc') {
      command = [
        request.sourcePath,
        '/LD',
        `/Fe:${outputPath}`,
        ...flags,
      ];
    } else {
      command = [
        request.sourcePath,
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
