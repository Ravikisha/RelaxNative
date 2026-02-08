import type { PlatformInfo } from './detectPlatform.js';

export function getSharedLibName(
  baseName: string,
  platform: PlatformInfo,
): string {
  if (platform.isWindows) return `${baseName}.dll`;
  if (platform.isMac) return `lib${baseName}.dylib`;
  return `lib${baseName}.so`;
}
