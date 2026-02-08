import { detectPlatform } from './detectPlatform.js';
import { detectCCompiler } from './detectCCompiler.js';
import { detectRustCompiler } from './detectRustCompiler.js';
import { sanityCheckC } from './sanityCheck.js';

export function detectCompilers() {
  const platform = detectPlatform();
  const c = detectCCompiler();
  sanityCheckC(c);

  const rust = detectRustCompiler();

  return {
    platform,
    c,
    rust,
  };
}
