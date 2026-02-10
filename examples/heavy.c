// @async
// @cost high
double heavy(double x) {
  for (long i = 0; i < 100000000; i++) {
    x += 0.0000001;
  }
  return x;
}
