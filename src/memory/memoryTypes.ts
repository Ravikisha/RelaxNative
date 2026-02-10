export type Ownership = 'js' | 'native' | 'borrowed';

export class MemoryError extends Error {
  override name = 'MemoryError';
}

export class UseAfterFreeError extends MemoryError {
  override name = 'UseAfterFreeError';
}

export class InvalidFreeError extends MemoryError {
  override name = 'InvalidFreeError';
}

export class NullPointerError extends MemoryError {
  override name = 'NullPointerError';
}
