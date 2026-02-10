// @sync
// @cost high

// Dot product of two float arrays.
// Note: uses `double*` so Relaxnative's current type mapping can safely
// pass raw addresses (pointer<void>) without buffer-type coercion.
double dot_f64(double* a, double* b, int n) {
  double acc = 0.0;
  for (int i = 0; i < n; i++) {
  acc += a[i] * b[i];
  }
  return acc;
}
