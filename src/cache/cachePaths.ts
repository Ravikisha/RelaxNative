import { homedir } from 'os';
import { join } from 'path';

export function getCacheRoot(): string {
  return join(homedir(), '.relaxnative', 'cache');
}

export function getCacheEntry(hash: string): string {
  return join(getCacheRoot(), hash);
}
