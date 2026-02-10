// Naive matrix multiply (row-major): C[MxN] = A[MxK] * B[KxN]
// This is intentionally naive to keep it portable and predictable.
//
// Example benchmark:
//   npx relaxnative bench examples/matmul.c matmul_f32 --traditional --iterations 1 --warmup 1

// @sync
void matmul_f32(const float* A, const float* B, float* C, int M, int K, int N) {
  for (int i = 0; i < M; i++) {
    for (int j = 0; j < N; j++) {
      float acc = 0.0f;
      for (int k = 0; k < K; k++) {
        acc += A[i * K + k] * B[k * N + j];
      }
      C[i * N + j] = acc;
    }
  }
}
