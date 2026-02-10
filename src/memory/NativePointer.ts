
import koffi from 'koffi';

import type { Ownership } from './memoryTypes.ts';
import { NullPointerError, UseAfterFreeError } from './memoryTypes.ts';

// Brand symbol so userland can't fake it easily.
const kBrand = Symbol.for('relaxnative.NativePointer');

export class NativePointer {
  readonly [kBrand] = true;

  /** Opaque native address (number). */
  readonly address: number;
  /** Size in bytes when known (0 means unknown). */
  readonly size: number;
  /** Ownership of the pointee memory. */
  readonly ownership: Ownership;

  private _freed = false;

  constructor(opts: { address: number; size?: number; ownership?: Ownership }) {
    const address = opts.address;
    if (!Number.isFinite(address) || address === 0) {
      throw new NullPointerError(`Null/invalid native pointer address: ${address}`);
    }

    this.address = address;
    this.size = opts.size ?? 0;
    this.ownership = opts.ownership ?? 'native';
  }

  get freed() {
    return this._freed;
  }

  /**
   * Marks this pointer as freed (used internally by NativeBuffer).
   * This does *not* free underlying memory.
   */
  _markFreed() {
    this._freed = true;
  }

  assertAlive() {
    if (this._freed) {
      throw new UseAfterFreeError(
        `Use-after-free: pointer 0x${this.address.toString(16)} was freed`,
      );
    }
  }

  /**
   * Convert to the koffi pointer value.
   *
  * Note: numeric-address pointers are inherently less safe than passing a
  * koffi External handle (like NativeBuffer does). Use NativePointer for
  * borrowed/opaque pointers returned by native code.
   */
  toKoffiPointer(): number {
    this.assertAlive();
  return this.address;
  }

  static isNativePointer(v: any): v is NativePointer {
    return !!v && v[kBrand] === true;
  }

  /**
   * Convenience for koffi type declarations.
   * Example: lib.func('foo', 'int', [NativePointer.koffiType()])
   */
  static koffiType() {
  return (koffi as any).pointer('void');
  }
}
