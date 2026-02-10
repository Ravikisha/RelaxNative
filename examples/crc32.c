// CRC32 (IEEE 802.3) over a u8 buffer.
//
// Signature:
//   uint32_t crc32_u8(const uint8_t* data, int n)
//
// Notes:
// - Bitwise algorithm (no table) to keep the example tiny and portable.
// - For maximum speed, a table-based implementation is recommended.

#include <stdint.h>

// NOTE: This helper must be visible to the dynamic linker because Relaxnative
// may attempt to bind all functions it sees in the parsed source.
// (Static functions won't be exported from the shared library.)
uint32_t crc32_update(uint32_t crc, uint8_t data) {
  crc ^= data;
  for (int k = 0; k < 8; k++) {
    uint32_t mask = (uint32_t)-(int)(crc & 1u);
    crc = (crc >> 1) ^ (0xEDB88320u & mask);
  }
  return crc;
}

// @sync
uint32_t crc32_u8(const uint8_t* data, int n) {
  uint32_t crc = 0xFFFFFFFFu;
  for (int i = 0; i < n; i++) {
    crc = crc32_update(crc, data[i]);
  }
  return ~crc;
}
