import { accessSync, constants } from 'fs';
import { delimiter } from 'path';

export function which(cmd: string): string | null {
  const paths = process.env.PATH?.split(delimiter) ?? [];
  for (const p of paths) {
    const full = `${p}/${cmd}`;
    try {
      accessSync(full, constants.X_OK);
      return full;
    } catch {}
  }
  return null;
}
