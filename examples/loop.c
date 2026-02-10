// @sync
// @cost high

// A simple integer loop that is intentionally CPU-bound.
// Returns a deterministic result so the call can't be optimized away.
long loop_sum(long n) {
  long acc = 0;
  for (long i = 0; i < n; i++) {
    acc += (i ^ 0x9e3779b97f4a7c15ULL) & 0xffff;
  }
  return acc;
}
