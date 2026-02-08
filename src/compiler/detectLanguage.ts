export type NativeLanguage = 'c' | 'cpp' | 'rust';

export function detectLanguage(filePath: string): NativeLanguage {
  if (filePath.endsWith('.c')) return 'c';
  if (filePath.endsWith('.cpp') || filePath.endsWith('.cc') || filePath.endsWith('.cxx'))
    return 'cpp';
  if (filePath.endsWith('.rs')) return 'rust';

  throw new Error(`Unsupported native file: ${filePath}`);
}
