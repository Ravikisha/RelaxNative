#include "../relaxnative_test.h"

// Tiny native tests for the harness.

int add(int a, int b) {
  return a + b;
}

const char* test_add_basic() {
  RN_ASSERT(add(2, 3) == 5);
  return 0;
}

const char* test_add_negative() {
  RN_ASSERT(add(-2, -3) == -5);
  return 0;
}

const char* test_add_failure_example() {
  // Example failing assertion (kept passing by default)
  RN_ASSERT_MSG(1 == 1, "should not fail");
  return 0;
}
