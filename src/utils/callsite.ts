export function captureCallsite(): string | undefined {
  const err = new Error();
  if (!err.stack) return undefined;
  // Drop the first two frames (captureCallsite + wrapper) for clarity.
  const parts = err.stack.split('\n');
  if (parts.length <= 2) return err.stack;
  return parts.slice(2).join('\n');
}
