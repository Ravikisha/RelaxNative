export type CompilerKind = 'c' | 'cpp' | 'rust';

export type CompilerInfo = {
  kind: CompilerKind;
  path: string;
  version: string;
  vendor?: string;
};
