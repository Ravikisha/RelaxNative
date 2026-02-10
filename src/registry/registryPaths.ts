import { join, resolve } from 'path';

export function getProjectRoot(cwd: string = process.cwd()): string {
  return cwd;
}

export function getRegistryRoot(projectRoot: string = getProjectRoot()): string {
  return join(projectRoot, 'native', 'registry');
}

export function getInstalledPackageDir(
  pkg: string,
  projectRoot: string = getProjectRoot(),
): string {
  return join(getRegistryRoot(projectRoot), pkg);
}

export function resolveRegistryImport(
  specifier: string,
  projectRoot: string = getProjectRoot(),
): string | null {
  // specifier should be: relaxnative/<pkg>
  const prefix = 'relaxnative/';
  if (!specifier.startsWith(prefix)) return null;
  const pkg = specifier.slice(prefix.length);
  return resolve(getInstalledPackageDir(pkg, projectRoot));
}
