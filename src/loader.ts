import { detectCompilers } from './compiler/detect.js';
import { compileWithCache } from './compiler/compileWithCache.js';
import { detectLanguage } from './compiler/detectLanguage.js';
import { parseNativeSource } from './parser/index.js';
import { loadFfi } from './ffi/index.js';

export async function loadNative(sourcePath: string) {
  const { c, rust, platform } = detectCompilers();
  const language = detectLanguage(sourcePath);

  const compiler = language === 'rust' ? rust : c;
  if (!compiler) {
    throw new Error(`No compiler available for ${language}`);
  }

  const compileResult = compileWithCache(compiler, platform, {
    sourcePath,
    outDir: '.cache/native',
  });

  const bindings = parseNativeSource(sourcePath, language);

  return loadFfi(compileResult.outputPath, bindings);
}
