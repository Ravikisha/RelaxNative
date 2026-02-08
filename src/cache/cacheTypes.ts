export type CacheEntry = {
  hash: string;
  sourcePath: string;
  outputPath: string;
  compilerPath: string;
  compilerVersion: string;
  flags: string[];
  platform: string;
  createdAt: number;
};
