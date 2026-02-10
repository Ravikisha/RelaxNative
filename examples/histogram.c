// Histogram of u8 values.
//
// Signature:
//   void histogram_u8(const uint8_t* data, int n, uint32_t* out256)
//
// Notes:
// - `out256` must point to 256 uint32 values.
// - This is a common data-analytics / image-processing primitive.

#include <stdint.h>

// @sync
void histogram_u8(const uint8_t* data, int n, uint32_t* out256) {
  // caller can pass an already-zeroed buffer, but we'll zero it here for safety.
  for (int i = 0; i < 256; i++) out256[i] = 0;

  for (int i = 0; i < n; i++) {
    out256[data[i]]++;
  }
}
