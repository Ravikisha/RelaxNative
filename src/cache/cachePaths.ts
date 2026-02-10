import { homedir } from 'os';
import { join } from 'path';

function homeDir(): string {
  // Respect HOME when set (important for tests/sandboxes/containers).
  // Fallback to OS homedir() if HOME isn't present.
  return process.env.HOME ?? homedir();
}

export function getCacheRoot(): string {
  return join(homeDir(), '.relaxnative', 'cache');
}

export function getCacheEntry(hash: string): string {
  return join(getCacheRoot(), hash);
}
