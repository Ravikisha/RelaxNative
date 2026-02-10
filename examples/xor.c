// Buffer ops: XOR two u8 buffers into an output buffer.
//
// Signature:
//   void xor_u8(const uint8_t* a, const uint8_t* b, uint8_t* out, int n)
//
// Notes:
// - We use int for simplicity/FFI friendliness.
// - `n` is the number of bytes to process.

#include <stdint.h>

// @sync
void xor_u8(const uint8_t* a, const uint8_t* b, uint8_t* out, int n) {
  for (int i = 0; i < n; i++) {
    out[i] = (uint8_t)(a[i] ^ b[i]);
  }
}
