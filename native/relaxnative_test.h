#pragma once

// Relaxnative native test helpers.
//
// Convention:
// - A native test is any function named: test_<name>
// - It may return:
//    - int: 0 pass, non-zero fail
//    - const char*: NULL pass, non-NULL => failure message
//
// For convenience, use RN_ASSERT(...) to return a descriptive failure.

#ifdef __cplusplus
extern "C" {
#endif

// Best-effort location capture. The harness will print (file:line).
// Note: returning a string literal is safe.

#define RN_ASSERT(expr) \
  do { \
    if (!(expr)) { \
      return "ASSERT(" #expr ")"; \
    } \
  } while (0)

#define RN_ASSERT_MSG(expr, msg_literal) \
  do { \
    if (!(expr)) { \
      return (msg_literal); \
    } \
  } while (0)

#ifdef __cplusplus
}
#endif
