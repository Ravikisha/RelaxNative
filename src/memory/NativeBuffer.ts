import koffi from 'koffi';

import type { Ownership } from './memoryTypes.ts';
import { InvalidFreeError, NullPointerError, UseAfterFreeError } from './memoryTypes.ts';

const kBrand = Symbol.for('relaxnative.NativeBuffer');

type FinalizeHeld = {
  handle: any;
  addr: number;
};

const finalizer =
  typeof FinalizationRegistry !== 'undefined'
    ? new FinalizationRegistry<FinalizeHeld>((held) => {
        try {
          koffi.free(held.handle);
        } catch {
          // best-effort finalization: never throw from GC
        }
      })
    : null;

export class NativeBuffer {
  readonly [kBrand] = true;

  private _handle: any;
  private _view: Uint8Array;
  private _freed = false;

  readonly ownership: Ownership;

  constructor(
    allocation: { handle: any; view: Uint8Array },
    opts?: { ownership?: Ownership; autoFree?: boolean },
  ) {
    if (!allocation?.handle || !allocation?.view) {
      throw new NullPointerError('NativeBuffer: missing allocation');
    }

    this._handle = allocation.handle;
    this._view = allocation.view;
    this.ownership = opts?.ownership ?? 'js';

    if (opts?.autoFree && this.ownership === 'js') {
      finalizer?.register(
        this,
        { handle: this._handle as any, addr: this.address },
        this,
      );
    }
  }

  get address(): number {
    this.assertAlive();
  const raw = koffi.address(this._handle as any) as unknown;
  const addr = typeof raw === 'bigint' ? Number(raw) : (raw as number);
    if (!Number.isFinite(addr) || addr === 0) {
      throw new NullPointerError(`NativeBuffer has null/invalid address: ${addr}`);
    }
    return addr;
  }

  get size(): number {
    this.assertAlive();
  return this._view.byteLength;
  }

  get freed(): boolean {
    return this._freed;
  }

  assertAlive() {
    if (this._freed) {
  throw new UseAfterFreeError('Use-after-free: NativeBuffer was freed');
    }
  }

  toUint8Array(): Uint8Array {
    this.assertAlive();
  return this._view;
  }

  /**
   * Create a bounds-checked DataView into this buffer.
   *
   * Tip: prefer the typed view helpers (u32(), f64(), etc.) when possible.
   */
  dataView(offset: number = 0, length?: number): DataView {
    this.assertAlive();
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError(`NativeBuffer.dataView: offset must be >= 0, got ${offset}`);
    }

    const size = this._view.byteLength;
    const len = length == null ? size - offset : length;

    if (!Number.isInteger(len) || len < 0) {
      throw new RangeError(`NativeBuffer.dataView: length must be >= 0, got ${len}`);
    }

    if (offset + len > size) {
      throw new RangeError(
        `NativeBuffer.dataView: out of bounds (offset=${offset}, length=${len}, size=${size})`,
      );
    }

    return new DataView(this._view.buffer, this._view.byteOffset + offset, len);
  }

  private _typed<T extends ArrayBufferView>(
    ctor: {
      new (ab: ArrayBufferLike, byteOffset: number, length: number): T;
      BYTES_PER_ELEMENT: number;
    },
    offset: number,
    length?: number,
  ): T {
    this.assertAlive();

    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError(`NativeBuffer view: offset must be >= 0, got ${offset}`);
    }

    const bpe = ctor.BYTES_PER_ELEMENT;
    if (offset % bpe !== 0) {
      throw new RangeError(`NativeBuffer view: offset must be aligned to ${bpe} bytes`);
    }

    const bytesAvail = this._view.byteLength - offset;
    if (bytesAvail < 0) {
      throw new RangeError('NativeBuffer view: offset out of bounds');
    }

    const maxLen = Math.floor(bytesAvail / bpe);
    const len = length == null ? maxLen : length;

    if (!Number.isInteger(len) || len < 0) {
      throw new RangeError(`NativeBuffer view: length must be >= 0, got ${len}`);
    }
    if (len > maxLen) {
      throw new RangeError(
        `NativeBuffer view: out of bounds (offset=${offset}, length=${len}, elementSize=${bpe}, maxLength=${maxLen})`,
      );
    }

    return new ctor(this._view.buffer, this._view.byteOffset + offset, len);
  }

  u8(offset: number = 0, length?: number) {
    return this._typed(Uint8Array, offset, length);
  }

  i8(offset: number = 0, length?: number) {
    return this._typed(Int8Array, offset, length);
  }

  u16(offset: number = 0, length?: number) {
    return this._typed(Uint16Array, offset, length);
  }

  i16(offset: number = 0, length?: number) {
    return this._typed(Int16Array, offset, length);
  }

  u32(offset: number = 0, length?: number) {
    return this._typed(Uint32Array, offset, length);
  }

  i32(offset: number = 0, length?: number) {
    return this._typed(Int32Array, offset, length);
  }

  f32(offset: number = 0, length?: number) {
    return this._typed(Float32Array, offset, length);
  }

  f64(offset: number = 0, length?: number) {
    return this._typed(Float64Array, offset, length);
  }

  write(src: Uint8Array, offset: number = 0) {
    this.assertAlive();
    if (!(src instanceof Uint8Array)) {
      throw new TypeError('NativeBuffer.write(src): src must be a Uint8Array');
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError(`NativeBuffer.write: offset must be >= 0, got ${offset}`);
    }

  if (offset + src.byteLength > this._view.byteLength) {
      throw new RangeError(
    `NativeBuffer.write: write out of bounds (offset=${offset}, len=${src.byteLength}, size=${this._view.byteLength})`,
      );
    }

  this._view.set(src, offset);
  }

  free() {
    if (this._freed) {
  throw new InvalidFreeError('Double-free: NativeBuffer already freed');
    }

    if (this.ownership !== 'js') {
      throw new InvalidFreeError(
  'Invalid free: NativeBuffer is native-owned',
      );
    }

    finalizer?.unregister(this);
  koffi.free(this._handle as any);
    this._freed = true;
  }

  toJSON() {
    return { address: this.address, size: this.size, ownership: this.ownership };
  }

  static isNativeBuffer(v: any): v is NativeBuffer {
    return !!v && v[kBrand] === true;
  }

  /**
   * Return the koffi allocation handle.
   *
   * Important: passing raw numeric addresses to koffi is not reliably supported
   * across platforms/Node versions and can segfault. The handle returned by
   * `koffi.alloc()` is the safe thing to pass back into FFI calls.
   */
  toKoffiPointer(): any {
    this.assertAlive();
    return this._handle;
  }
}
