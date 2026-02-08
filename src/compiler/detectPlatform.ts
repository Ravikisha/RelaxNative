export type PlatformInfo = {
  platform: NodeJS.Platform;
  arch: string;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
};

export function detectPlatform(): PlatformInfo {
  const platform = process.platform;
  const arch = process.arch;

  return {
    platform,
    arch,
    isWindows: platform === 'win32',
    isMac: platform === 'darwin',
    isLinux: platform === 'linux',
  };
}
