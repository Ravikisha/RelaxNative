// @sync
// @cost low

// Fill a byte buffer with a value.
void fill_u8(char* out, int n, int value) {
  for (int i = 0; i < n; i++) {
    out[i] = (unsigned char)value;
  }
}

// Sum n bytes.
int sum_u8(char* buf, int n) {
  int s = 0;
  for (int i = 0; i < n; i++) s += (unsigned char)buf[i];
  return s;
}
