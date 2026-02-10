// A simple vector kernel often used in ML/DSP: y[i] = a*x[i] + y[i]
//
// Example benchmark:
//   npx relaxnative bench examples/saxpy.c saxpy_f64 --traditional --iterations 2 --warmup 1

// @sync
void saxpy_f64(double a, double* x, double* y, int n) {
  for (int i = 0; i < n; i++) {
    y[i] = a * x[i] + y[i];
  }
}
