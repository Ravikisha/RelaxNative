import type { NativeLanguage } from './detectLanguage.js';

export type CompileRequest = {
  sourcePath: string;
  outDir: string;
  flags?: string[];
};

export type CompileResult = {
  language: NativeLanguage;
  outputPath: string;
  command: string[];
};
