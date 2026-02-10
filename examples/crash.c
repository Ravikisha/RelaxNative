// @sync
// @cost low

// Intentionally crash the process (SIGSEGV).
void crash_segv() {
  volatile int* p = (int*)0;
  *p = 42;
}
