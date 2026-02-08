import koffi from 'koffi';

export function loadLibrary(libPath: string) {
  try {
    return koffi.load(libPath);
  } catch (err) {
    throw new Error(`Failed to load native library: ${libPath}`);
  }
}
