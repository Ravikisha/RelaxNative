import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';

import type { CompilerInfo } from './compilerTypes.js';
import type { PlatformInfo } from './detectPlatform.js';
import type { CompileRequest, CompileResult } from './compileTypes.js';
import { buildCompileCommand } from './buildCommand.js';

export function compileNative(
  compiler: CompilerInfo,
  platform: PlatformInfo,
  request: CompileRequest,
): CompileResult {
  mkdirSync(request.outDir, { recursive: true });

  const result = buildCompileCommand(compiler, platform, request);

  try {
    execFileSync(
      compiler.kind === 'rust' ? compiler.path : compiler.path,
      result.command,
      { stdio: 'inherit' },
    );
  } catch (err) {
    throw new Error(
      `Native compilation failed for ${request.sourcePath}`,
    );
  }

  return result;
}
