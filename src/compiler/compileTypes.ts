import type { NativeLanguage } from './detectLanguage.js';

export type CompileRequest = {
  /**
   * Primary entry source file.
   *
   * For multi-file builds, `sourcePath` is used as the "entry" for:
   * - language detection (C vs C++)
   * - output library naming
   *
   * The full compilation inputs are `sourcePath` + `sources`.
   */
  sourcePath: string;
  /** Additional source files to compile and link into the same shared library. */
  sources?: string[];
  outDir: string;
  /** Additional raw compiler/linker flags (advanced escape hatch). */
  flags?: string[];
  /** Header search paths (translated to -I). */
  includePaths?: string[];
  /** Library search paths (translated to -L). */
  libraryPaths?: string[];
  /** Libraries to link (translated to -l<name>). Example: ['m', 'pthread'] */
  libraries?: string[];
};

export type CompileResult = {
  language: NativeLanguage;
  outputPath: string;
  command: string[];
};
