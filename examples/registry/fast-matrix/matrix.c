// @sync
// @cost low

// Multiply 2x2 matrices: out = a*b
// a,b,out are pointers to 4 doubles each.
void mul2(double* out, double* a, double* b) {
  out[0] = a[0] * b[0] + a[1] * b[2];
  out[1] = a[0] * b[1] + a[1] * b[3];
  out[2] = a[2] * b[0] + a[3] * b[2];
  out[3] = a[2] * b[1] + a[3] * b[3];
}

// Simple scalar function for smoke testing loader/FFI wiring.
// Avoids passing pointers from JS.
int version() {
  return 1;
}
