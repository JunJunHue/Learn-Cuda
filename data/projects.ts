export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type Category =
  | "Memory"
  | "Parallelism"
  | "Optimization"
  | "Algorithms"
  | "Multi-GPU"
  | "Interoperability";

export interface ProjectPhase {
  title: string;
  description: string;
}

export interface TutorialStep {
  title: string;
  /** Plain-text instruction shown above the editor. Markdown supported. */
  instruction: string;
  /** Optional hint revealed on demand. */
  hint?: string;
  /** Starter code for this step — contains TODOs for the learner to fill in. */
  starterCode: string;
  /** Reference output used to verify the learner's solution. */
  expectedOutput?: string;
}

export interface ProjectData {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  category: Category;
  estimatedMinutes: number;
  prerequisites: string[];
  tags: string[];
  phases: ProjectPhase[];
  /** Step-by-step tutorial mode. When present, replaces the single starterCode. */
  steps?: TutorialStep[];
  /** Fallback single-file starter (used in standalone sandbox and when steps is absent). */
  starterCode: string;
  expectedOutput?: string;
}

export const PROJECTS: ProjectData[] = [
  // ─── Beginner ──────────────────────────────────────────────────────────────
  {
    slug: "vector-add",
    title: "Vector Addition",
    description:
      "The 'Hello World' of GPU programming. Add two arrays element-wise on the GPU, then measure memory bandwidth to understand the roofline model.",
    difficulty: "Beginner",
    category: "Parallelism",
    estimatedMinutes: 20,
    prerequisites: [],
    tags: ["vector", "cudaMalloc", "cudaMemcpy", "bandwidth", "roofline"],
    phases: [
      { title: "Allocate and transfer", description: "Allocate GPU buffers with cudaMalloc and copy host data with cudaMemcpy." },
      { title: "Write the kernel", description: "Each thread adds one element: C[i] = A[i] + B[i]." },
      { title: "Measure bandwidth", description: "Use cudaEvent_t to time the kernel and compute GB/s." },
    ],
    steps: [
      {
        title: "Step 1 — Write the addition kernel",
        instruction:
`Vector addition is the simplest GPU program: add two arrays element-by-element.

Each thread is responsible for exactly **one index** \`i\`:
\`\`\`c
C[i] = A[i] + B[i];
\`\`\`

The global index formula you learned in Hello CUDA applies here too:
\`\`\`c
int i = blockIdx.x * blockDim.x + threadIdx.x;
\`\`\`

**Task:** Complete the kernel body, then launch it and verify the result on the CPU.`,
        hint: "```c\n__global__ void vecAdd(const float *A, const float *B, float *C, int n) {\n    int i = blockIdx.x * blockDim.x + threadIdx.x;\n    if (i < n) C[i] = A[i] + B[i];\n}\n```",
        starterCode:
`#include <stdio.h>
#include <math.h>

// Each thread adds one element: C[i] = A[i] + B[i]
__global__ void vecAdd(const float *A, const float *B, float *C, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    // TODO: bounds guard and addition
}

int main() {
    const int N = 1 << 20;  // 1M elements
    const size_t bytes = N * sizeof(float);

    // Allocate host arrays
    float *h_A = (float *)malloc(bytes);
    float *h_B = (float *)malloc(bytes);
    float *h_C = (float *)malloc(bytes);
    for (int i = 0; i < N; i++) { h_A[i] = 1.0f; h_B[i] = 2.0f; }

    // Allocate device arrays
    float *d_A, *d_B, *d_C;
    cudaMalloc(&d_A, bytes);
    cudaMalloc(&d_B, bytes);
    cudaMalloc(&d_C, bytes);

    // Copy input data to GPU
    cudaMemcpy(d_A, h_A, bytes, cudaMemcpyHostToDevice);
    cudaMemcpy(d_B, h_B, bytes, cudaMemcpyHostToDevice);

    // TODO: launch vecAdd with 256 threads per block
    // int threadsPerBlock = 256;
    // int blocks = (N + threadsPerBlock - 1) / threadsPerBlock;
    // vecAdd<<<blocks, threadsPerBlock>>>(d_A, d_B, d_C, N);
    cudaDeviceSynchronize();

    // Copy result back and verify
    cudaMemcpy(h_C, d_C, bytes, cudaMemcpyDeviceToHost);
    bool ok = true;
    for (int i = 0; i < N; i++) if (fabsf(h_C[i] - 3.0f) > 1e-5f) { ok = false; break; }
    printf("Result: %s\\n", ok ? "CORRECT" : "WRONG");

    free(h_A); free(h_B); free(h_C);
    cudaFree(d_A); cudaFree(d_B); cudaFree(d_C);
    return 0;
}`,
        expectedOutput: "Result: CORRECT\n",
      },
      {
        title: "Step 2 — Measure memory bandwidth",
        instruction:
`Vector addition is **memory-bound**: for every float added, the GPU reads 2 floats (A and B) and writes 1 (C).

**Theoretical bandwidth** for an A100 is ~2 TB/s. A T4 is ~300 GB/s.

**Formula:**
\`\`\`
bandwidth (GB/s) = bytes_transferred / time_seconds / 1e9
bytes_transferred = 3 * N * sizeof(float)   // 2 reads + 1 write
\`\`\`

Use \`cudaEvent_t\` to time the kernel precisely (GPU-side timer, avoids CPU/GPU sync overhead).

**Task:** Add timing with \`cudaEventRecord\` and print the achieved bandwidth.`,
        hint: "```c\ncudaEvent_t t0, t1;\ncudaEventCreate(&t0); cudaEventCreate(&t1);\ncudaEventRecord(t0);\nvecAdd<<<blocks, tpb>>>(d_A, d_B, d_C, N);\ncudaEventRecord(t1);\ncudaEventSynchronize(t1);\nfloat ms; cudaEventElapsedTime(&ms, t0, t1);\nprintf(\"%.1f GB/s\\n\", 3.0 * bytes / ms / 1e6);\n```",
        starterCode:
`#include <stdio.h>

__global__ void vecAdd(const float *A, const float *B, float *C, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) C[i] = A[i] + B[i];
}

int main() {
    const int N = 1 << 24;  // 16M elements — large enough to measure bandwidth
    const size_t bytes = (size_t)N * sizeof(float);

    float *d_A, *d_B, *d_C;
    cudaMalloc(&d_A, bytes); cudaMalloc(&d_B, bytes); cudaMalloc(&d_C, bytes);

    // Fill with 1.0f via cudaMemset isn't straightforward for floats,
    // so use a simple init kernel (or just proceed to timing)

    int tpb = 256, blocks = (N + tpb - 1) / tpb;

    // TODO: create cudaEvent_t t0, t1 and record them around vecAdd
    // TODO: cudaEventElapsedTime(&ms, t0, t1);
    // TODO: printf("Bandwidth: %.1f GB/s\\n", 3.0 * bytes / ms / 1e6);

    // Run once without timing first (warm up the GPU)
    vecAdd<<<blocks, tpb>>>(d_A, d_B, d_C, N);
    cudaDeviceSynchronize();

    // TODO: add the timed version here
    printf("(add timing code above to measure bandwidth)\\n");

    cudaFree(d_A); cudaFree(d_B); cudaFree(d_C);
    return 0;
}`,
        expectedOutput: "Bandwidth: 285.3 GB/s\n",
      },
    ],
    starterCode: `#include <stdio.h>

__global__ void vecAdd(const float *A, const float *B, float *C, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) C[i] = A[i] + B[i];
}

int main() {
    const int N = 1 << 20;
    const size_t bytes = N * sizeof(float);
    float *d_A, *d_B, *d_C;
    cudaMalloc(&d_A, bytes); cudaMalloc(&d_B, bytes); cudaMalloc(&d_C, bytes);
    int tpb = 256, blocks = (N + tpb - 1) / tpb;
    vecAdd<<<blocks, tpb>>>(d_A, d_B, d_C, N);
    cudaDeviceSynchronize();
    printf("Done\\n");
    cudaFree(d_A); cudaFree(d_B); cudaFree(d_C);
    return 0;
}`,
    expectedOutput: "Bandwidth: ~285 GB/s (T4)",
  },
  {
    slug: "hello-cuda",
    title: "Hello CUDA",
    description:
      "Write your first GPU kernel and understand the CUDA execution model: thread indexing, kernel launch syntax, and GPU/CPU synchronization.",
    difficulty: "Beginner",
    category: "Parallelism",
    estimatedMinutes: 30,
    prerequisites: [],
    tags: ["kernel", "threadIdx", "blockIdx", "blockDim", "cudaDeviceSynchronize"],
    phases: [
      { title: "Write a hello kernel", description: "Define a __global__ kernel that prints from the GPU using printf()." },
      { title: "Launch with multiple threads", description: "Change the launch config to spawn 8 threads and print each thread's ID." },
      { title: "Add multiple blocks", description: "Launch with 3 blocks × 4 threads and compute the global thread ID." },
      { title: "Compute something", description: "Pass device memory to a kernel and have each thread compute i²." },
    ],
    steps: [
      {
        title: "Step 1 — Your first kernel",
        instruction:
`A \`__global__\` function is a **CUDA kernel** — code that runs on the GPU, not the CPU.

Launch it with \`<<<blocks, threads>>>\`:
- \`<<<1, 1>>>\` = 1 block, 1 thread
- The kernel runs **asynchronously**, so call \`cudaDeviceSynchronize()\` before exiting.

**Task:** Add a \`printf("Hello from the GPU!\\n")\` call inside \`helloKernel\`.
\`printf\` works inside GPU kernels (CUDA 2.0+).`,
        hint: "Just add `printf(\"Hello from the GPU!\\n\");` inside the kernel body. Don't forget the semicolon.",
        starterCode:
`#include <stdio.h>

// A __global__ function is a CUDA kernel — it runs on the GPU.
// <<<1, 1>>> = 1 block, 1 thread.
__global__ void helloKernel() {
    // TODO: print "Hello from the GPU!\\n"
    // printf() works inside GPU kernels, just like in C.
}

int main() {
    helloKernel<<<1, 1>>>();   // launch: 1 block, 1 thread
    cudaDeviceSynchronize();   // wait for GPU to finish
    return 0;
}`,
        expectedOutput: "Hello from the GPU!\n",
      },
      {
        title: "Step 2 — Many threads: threadIdx",
        instruction:
`Change the launch from \`<<<1, 1>>>\` to \`<<<1, 8>>>\` to create **8 parallel threads**.

Each thread has its own \`threadIdx.x\` value: 0, 1, 2, … 7.
All 8 threads run the kernel **simultaneously**.

**Task:** Print \`"Hello from thread %d\\n"\` using \`threadIdx.x\`.

Notice: the output order may not be 0,1,2,3… — GPU threads don't have a guaranteed execution order.`,
        hint: "Use `int tid = threadIdx.x;` then `printf(\"Hello from thread %d\\n\", tid);`",
        starterCode:
`#include <stdio.h>

// <<<1, 8>>> launches 1 block with 8 threads.
// Each thread has its own threadIdx.x in [0, 7].
__global__ void helloKernel() {
    int tid = threadIdx.x;  // this thread's index within the block
    // TODO: printf("Hello from thread %d\\n", tid);
    // Run it — the output order may surprise you!
}

int main() {
    helloKernel<<<1, 8>>>();   // 1 block, 8 threads
    cudaDeviceSynchronize();
    return 0;
}`,
        expectedOutput: "Hello from thread 0\nHello from thread 1\nHello from thread 2\nHello from thread 3\nHello from thread 4\nHello from thread 5\nHello from thread 6\nHello from thread 7\n",
      },
      {
        title: "Step 3 — Multiple blocks: blockIdx",
        instruction:
`\`<<<3, 4>>>\` launches **3 blocks × 4 threads = 12 threads** total.

Within a block, threads use \`threadIdx.x\` (0–3).
Across blocks, blocks use \`blockIdx.x\` (0–2).

The formula for a unique **global thread ID** is:
\`\`\`
globalId = blockIdx.x * blockDim.x + threadIdx.x
\`\`\`
\`blockDim.x\` is the number of threads per block (4 in this case).

**Task:** Compute \`globalId\` and print it alongside the block and thread indices.`,
        hint: "```c\nint globalId = blockIdx.x * blockDim.x + threadIdx.x;\nprintf(\"Block %d  Thread %d  →  Global ID %d\\n\", blockIdx.x, threadIdx.x, globalId);\n```",
        starterCode:
`#include <stdio.h>

// <<<3, 4>>> = 3 blocks × 4 threads = 12 threads total.
// Global ID formula: blockIdx.x * blockDim.x + threadIdx.x
__global__ void helloKernel() {
    // TODO: compute globalId = blockIdx.x * blockDim.x + threadIdx.x
    // TODO: printf("Block %d  Thread %d  →  Global ID %d\\n",
    //              blockIdx.x, threadIdx.x, globalId)
}

int main() {
    helloKernel<<<3, 4>>>();   // 3 blocks × 4 threads = 12 total
    cudaDeviceSynchronize();
    return 0;
}`,
        expectedOutput: "Block 0  Thread 0  →  Global ID 0\nBlock 0  Thread 1  →  Global ID 1\nBlock 0  Thread 2  →  Global ID 2\nBlock 0  Thread 3  →  Global ID 3\nBlock 1  Thread 0  →  Global ID 4\n(order may vary between blocks)\n",
      },
      {
        title: "Step 4 — Real work: squares kernel",
        instruction:
`Time to compute something! Each thread will compute **i²** for its global ID.

New concepts in this step:
- \`cudaMalloc\` — allocate memory on the GPU
- \`cudaMemcpy\` — transfer data between CPU ↔ GPU
- \`cudaFree\` — release GPU memory

The launch config uses **ceiling division** so we never under-provision threads:
\`\`\`c
int blocks = (N + threadsPerBlock - 1) / threadsPerBlock;
\`\`\`

**Task:** Fill in the bounds guard and the output assignment inside \`squaresKernel\`, then launch it.`,
        hint: "Inside the kernel: `if (i >= n) return;` then `out[i] = i * i;`. For the launch: `squaresKernel<<<blocks, threadsPerBlock>>>(N, d_out);`",
        starterCode:
`#include <stdio.h>

// Each thread computes i² for its global ID.
__global__ void squaresKernel(int n, int *out) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    // TODO: if (i >= n) return;   ← bounds guard: don't go past the array
    // TODO: out[i] = i * i;
}

int main() {
    const int N = 10;
    int *d_out;
    cudaMalloc(&d_out, N * sizeof(int));

    int threadsPerBlock = 8;
    int blocks = (N + threadsPerBlock - 1) / threadsPerBlock;  // = 2
    // TODO: squaresKernel<<<blocks, threadsPerBlock>>>(N, d_out);
    cudaDeviceSynchronize();

    int h_out[N];
    cudaMemcpy(h_out, d_out, N * sizeof(int), cudaMemcpyDeviceToHost);
    for (int i = 0; i < N; i++) printf("%d^2 = %d\\n", i, h_out[i]);

    cudaFree(d_out);
    return 0;
}`,
        expectedOutput: "0^2 = 0\n1^2 = 1\n2^2 = 4\n3^2 = 9\n4^2 = 16\n5^2 = 25\n6^2 = 36\n7^2 = 49\n8^2 = 64\n9^2 = 81\n",
      },
    ],
    starterCode: `#include <stdio.h>
#include <cuda_runtime.h>

__global__ void helloKernel(int totalThreads) {
    int id = blockIdx.x * blockDim.x + threadIdx.x;
    if (id < totalThreads)
        printf("Block %d, Thread %d -> Global ID %d\\n", blockIdx.x, threadIdx.x, id);
}

int main() {
    helloKernel<<<3, 8>>>(24);
    cudaDeviceSynchronize();
    return 0;
}`,
    expectedOutput: "Block 0, Thread 0 -> Global ID 0\n(output order may vary between blocks)",
  },

  {
    slug: "matrix-transpose",
    title: "Matrix Transpose — Three Ways",
    description:
      "Implement matrix transpose three times — naive, shared memory, and bank-conflict-free — and benchmark each version. This project exposes why memory access patterns dominate GPU performance.",
    difficulty: "Beginner",
    category: "Memory",
    estimatedMinutes: 60,
    prerequisites: ["hello-cuda"],
    tags: ["global-memory", "shared-memory", "bank-conflicts", "coalescing", "cudaEvent"],
    phases: [
      { title: "Naive transpose", description: "Write a kernel where each thread reads A[row][col] and writes A[col][row]. Identify which access is non-coalesced." },
      { title: "Shared memory tile", description: "Load a TILE×TILE block into shared memory coalesced, sync, then write coalesced." },
      { title: "Eliminate bank conflicts", description: "Pad the shared memory array to [TILE][TILE+1]." },
      { title: "Benchmark all three", description: "Use cudaEvent_t to time all three kernels and compare bandwidth." },
    ],
    steps: [
      {
        title: "Step 1 — Naive transpose",
        instruction:
`In a matrix transpose, element at \`(row, col)\` moves to \`(col, row)\`.

Each thread handles one element: it reads \`A[row * N + col]\` and writes \`B[col * N + row]\`.

**Access pattern analysis:**
- The read \`A[row * N + col]\` — threads in a warp have consecutive \`col\` → **coalesced ✓**
- The write \`B[col * N + row]\` — threads in a warp have consecutive \`row\` in the output → **non-coalesced ✗**

This non-coalesced write is the performance bottleneck you'll fix in Step 2.

**Task:** Implement the naive transpose kernel, allocate GPU memory, and verify correctness against the CPU reference.`,
        hint: "The kernel body is just one line: `B[col * n + row] = A[row * n + col];`\nFor memory: `cudaMalloc(&d_A, bytes); cudaMemcpy(d_A, h_A, bytes, cudaMemcpyHostToDevice);`",
        starterCode:
`#include <stdio.h>
#include <cuda_runtime.h>

#define N    1024   // matrix is N × N
#define TILE 32

// Naive transpose: thread (row, col) reads A[row][col], writes B[col][row].
// Read is coalesced; write is not — this is the perf bottleneck.
__global__ void transposeNaive(const float *A, float *B, int n) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (col < n && row < n) {
        // TODO: B[col * n + row] = A[row * n + col];
    }
}

void cpuTranspose(const float *A, float *B, int n) {
    for (int r = 0; r < n; r++)
        for (int c = 0; c < n; c++)
            B[c * n + r] = A[r * n + c];
}

int main() {
    const size_t bytes = (size_t)N * N * sizeof(float);
    float *h_A   = (float *)malloc(bytes);
    float *h_B   = (float *)malloc(bytes);
    float *h_ref = (float *)malloc(bytes);
    for (int i = 0; i < N * N; i++) h_A[i] = (float)i;
    cpuTranspose(h_A, h_ref, N);

    float *d_A, *d_B;
    // TODO: cudaMalloc(&d_A, bytes);  cudaMalloc(&d_B, bytes);
    // TODO: cudaMemcpy(d_A, h_A, bytes, cudaMemcpyHostToDevice);

    dim3 block(TILE, TILE);
    dim3 grid(N / TILE, N / TILE);
    // TODO: transposeNaive<<<grid, block>>>(d_A, d_B, N);
    // TODO: cudaDeviceSynchronize();
    // TODO: cudaMemcpy(h_B, d_B, bytes, cudaMemcpyDeviceToHost);

    bool ok = true;
    for (int i = 0; i < N * N; i++) if (h_B[i] != h_ref[i]) { ok = false; break; }
    printf("Naive transpose: %s\\n", ok ? "CORRECT" : "WRONG");

    free(h_A); free(h_B); free(h_ref);
    // TODO: cudaFree(d_A); cudaFree(d_B);
    return 0;
}`,
        expectedOutput: "Naive transpose: CORRECT\n",
      },
      {
        title: "Step 2 — Shared memory tile",
        instruction:
`The fix for non-coalesced writes: use **shared memory as a staging area**.

**Algorithm (one block handles a TILE×TILE sub-matrix):**
1. **Coalesced read** — each thread loads \`A[row][col]\` into \`tile[threadIdx.y][threadIdx.x]\`
2. **\`__syncthreads()\`** — wait for all threads to finish loading
3. **Coalesced write** — each thread writes \`tile[threadIdx.x][threadIdx.y]\` to \`B[transposed position]\`
   *(swap x and y to flip the tile before writing)*

The output block starts at \`(blockIdx.y * TILE, blockIdx.x * TILE)\` in B (note the swap).

**Task:** Implement \`transposeShared\` and verify it produces the same result as the naive version.`,
        hint:
`Load: \`tile[threadIdx.y][threadIdx.x] = A[row * n + col];\`
After sync, compute transposed output position:
\`int out_col = blockIdx.y * TILE + threadIdx.x;\`
\`int out_row = blockIdx.x * TILE + threadIdx.y;\`
Write: \`B[out_row * n + out_col] = tile[threadIdx.x][threadIdx.y];\``,
        starterCode:
`#include <stdio.h>
#include <cuda_runtime.h>

#define N    1024
#define TILE 32

__global__ void transposeNaive(const float *A, float *B, int n) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (col < n && row < n)
        B[col * n + row] = A[row * n + col];
}

// Shared memory transpose: both reads and writes are coalesced.
__global__ void transposeShared(const float *A, float *B, int n) {
    __shared__ float tile[TILE][TILE];

    int col = blockIdx.x * TILE + threadIdx.x;
    int row = blockIdx.y * TILE + threadIdx.y;

    // Step 1: coalesced read into shared memory
    // TODO: if (col < n && row < n) tile[threadIdx.y][threadIdx.x] = A[row * n + col];

    // TODO: __syncthreads();

    // Step 2: compute transposed output coordinates
    int out_col = blockIdx.y * TILE + threadIdx.x;
    int out_row = blockIdx.x * TILE + threadIdx.y;

    // Step 3: coalesced write from shared memory (with axes swapped)
    // TODO: if (out_col < n && out_row < n) B[out_row * n + out_col] = tile[threadIdx.x][threadIdx.y];
}

void cpuTranspose(const float *A, float *B, int n) {
    for (int r = 0; r < n; r++)
        for (int c = 0; c < n; c++)
            B[c * n + r] = A[r * n + c];
}

int main() {
    const size_t bytes = (size_t)N * N * sizeof(float);
    float *h_A = (float *)malloc(bytes);
    float *h_B = (float *)malloc(bytes);
    float *h_ref = (float *)malloc(bytes);
    for (int i = 0; i < N * N; i++) h_A[i] = (float)i;
    cpuTranspose(h_A, h_ref, N);

    float *d_A, *d_B;
    cudaMalloc(&d_A, bytes); cudaMalloc(&d_B, bytes);
    cudaMemcpy(d_A, h_A, bytes, cudaMemcpyHostToDevice);

    dim3 block(TILE, TILE), grid(N / TILE, N / TILE);
    transposeNaive<<<grid, block>>>(d_A, d_B, N);
    cudaDeviceSynchronize();
    cudaMemcpy(h_B, d_B, bytes, cudaMemcpyDeviceToHost);
    bool naive_ok = true;
    for (int i = 0; i < N * N; i++) if (h_B[i] != h_ref[i]) { naive_ok = false; break; }

    // TODO: run transposeShared and check correctness the same way
    printf("Naive:         %s\\n", naive_ok ? "CORRECT" : "WRONG");
    printf("Shared memory: %s\\n", false ? "CORRECT" : "TODO");  // change false after implementing

    free(h_A); free(h_B); free(h_ref);
    cudaFree(d_A); cudaFree(d_B);
    return 0;
}`,
        expectedOutput: "Naive:         CORRECT\nShared memory: CORRECT\n",
      },
      {
        title: "Step 3 — Bank conflicts & benchmarking",
        instruction:
`The shared memory tile in Step 2 has a hidden problem: **bank conflicts**.

Shared memory is divided into 32 **banks**. When 32 threads in a warp all access the same bank simultaneously, those accesses are serialized — 32× slower.

In Step 2, writing \`tile[threadIdx.x][threadIdx.y]\` means 32 threads each read from a different **row** of the same **column** → all hit the same bank → 32-way conflict.

**Fix:** Pad the inner dimension by 1:
\`\`\`c
__shared__ float tile[TILE][TILE + 1];  // +1 shifts each row's bank mapping
\`\`\`
This offsets each row by one element, so accesses spread across different banks.

**Task:** Implement \`transposeNoBankConflict\` (copy Step 2, change the tile declaration), then benchmark all three versions with \`cudaEvent_t\`.`,
        hint:
`For timing:
\`\`\`c
cudaEvent_t t0, t1;
cudaEventCreate(&t0); cudaEventCreate(&t1);
cudaEventRecord(t0);
kernel<<<grid, block>>>(...);
cudaEventRecord(t1);
cudaEventSynchronize(t1);
float ms; cudaEventElapsedTime(&ms, t0, t1);
printf("Time: %.2f ms  BW: %.1f GB/s\\n", ms, 2.0 * bytes / ms / 1e6);
\`\`\``,
        starterCode:
`#include <stdio.h>
#include <cuda_runtime.h>

#define N    1024
#define TILE 32

__global__ void transposeNaive(const float *A, float *B, int n) {
    int col = blockIdx.x * TILE + threadIdx.x;
    int row = blockIdx.y * TILE + threadIdx.y;
    if (col < n && row < n) B[col * n + row] = A[row * n + col];
}

__global__ void transposeShared(const float *A, float *B, int n) {
    __shared__ float tile[TILE][TILE];
    int col = blockIdx.x * TILE + threadIdx.x, row = blockIdx.y * TILE + threadIdx.y;
    if (col < n && row < n) tile[threadIdx.y][threadIdx.x] = A[row * n + col];
    __syncthreads();
    int oc = blockIdx.y * TILE + threadIdx.x, or_ = blockIdx.x * TILE + threadIdx.y;
    if (oc < n && or_ < n) B[or_ * n + oc] = tile[threadIdx.x][threadIdx.y];
}

// Bank-conflict-free: pad inner dim by 1
__global__ void transposeNoBankConflict(const float *A, float *B, int n) {
    __shared__ float tile[TILE][TILE + 1];  // <-- the only change from Step 2
    // TODO: same logic as transposeShared above
}

float benchKernel(void (*kernel)(const float *, float *, int),
                  const float *d_A, float *d_B, int n,
                  dim3 grid, dim3 block, int reps) {
    cudaEvent_t t0, t1;
    cudaEventCreate(&t0); cudaEventCreate(&t1);
    // Warm up
    kernel<<<grid, block>>>(d_A, d_B, n);
    cudaDeviceSynchronize();
    cudaEventRecord(t0);
    for (int i = 0; i < reps; i++) kernel<<<grid, block>>>(d_A, d_B, n);
    cudaEventRecord(t1);
    cudaEventSynchronize(t1);
    float ms; cudaEventElapsedTime(&ms, t0, t1);
    return ms / reps;
}

int main() {
    const size_t bytes = (size_t)N * N * sizeof(float);
    float *d_A, *d_B;
    cudaMalloc(&d_A, bytes); cudaMalloc(&d_B, bytes);
    // Fill d_A with sequential values via a temp host array
    float *h_tmp = (float *)malloc(bytes);
    for (int i = 0; i < N * N; i++) h_tmp[i] = (float)i;
    cudaMemcpy(d_A, h_tmp, bytes, cudaMemcpyHostToDevice);
    free(h_tmp);

    dim3 block(TILE, TILE), grid(N / TILE, N / TILE);
    const int REPS = 20;

    // TODO: call benchKernel for each version and print timing + bandwidth
    // float ms_naive  = benchKernel(transposeNaive, ...);
    // float ms_shared = benchKernel(transposeShared, ...);
    // float ms_nobank = benchKernel(transposeNoBankConflict, ...);
    // printf("Naive:            %.1f ms  (~%.0f GB/s)\\n", ms_naive,  2.0 * bytes / ms_naive  / 1e6);
    // printf("Shared memory:    %.1f ms  (~%.0f GB/s)\\n", ms_shared, 2.0 * bytes / ms_shared / 1e6);
    // printf("No bank conflicts:%.1f ms  (~%.0f GB/s)\\n", ms_nobank, 2.0 * bytes / ms_nobank / 1e6);
    printf("(implement the benchmark calls above to see timing)\\n");

    cudaFree(d_A); cudaFree(d_B);
    return 0;
}`,
        expectedOutput: "Naive:            14.2 ms  (~142 GB/s)\nShared memory:     4.8 ms  (~419 GB/s)\nNo bank conflicts: 3.6 ms  (~558 GB/s)\nAll results correct: YES\n",
      },
    ],
    starterCode: `#include <stdio.h>
#include <cuda_runtime.h>

#define TILE 32
#define N    1024

__global__ void transposeNaive(float *A, float *B, int n) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (col < n && row < n)
        B[col * n + row] = A[row * n + col];
}

__global__ void transposeShared(float *A, float *B, int n) {
    __shared__ float tile[TILE][TILE];
    // TODO
}

__global__ void transposeNoBankConflict(float *A, float *B, int n) {
    __shared__ float tile[TILE][TILE + 1];
    // TODO
}

int main() {
    // TODO: allocate, fill, benchmark all three kernels
    return 0;
}`,
    expectedOutput:
      "Naive:              ~14 ms,  ~142 GB/s\nShared memory:       ~5 ms,  ~419 GB/s\nNo bank conflicts:   ~4 ms,  ~558 GB/s\nAll results correct: YES",
  },

  // ─── Intermediate ──────────────────────────────────────────────────────────
  {
    slug: "image-processing-pipeline",
    title: "GPU Image Processing Pipeline",
    description:
      "Build a complete image processing pipeline: grayscale conversion → Gaussian blur → Sobel edge detection. Each stage is a separate CUDA kernel; chain them with CUDA streams and benchmark every step.",
    difficulty: "Intermediate",
    category: "Memory",
    estimatedMinutes: 90,
    prerequisites: ["matrix-transpose"],
    tags: ["convolution", "shared-memory", "cudaStreams", "image", "sobel", "gaussian"],
    phases: [
      { title: "RGB → Grayscale", description: "One thread per pixel: luminance = 0.299R + 0.587G + 0.114B." },
      { title: "Gaussian blur (3×3)", description: "Implement a separable 2D Gaussian blur with a shared-memory halo." },
      { title: "Sobel edge detection", description: "Apply 3×3 Sobel kernels Gx and Gy; output magnitude clamped to [0,255]." },
      { title: "Pipeline with streams", description: "Overlap H2D transfer of frame N+1 with processing of frame N." },
    ],
    steps: [
      {
        title: "Step 1 — RGB to Grayscale",
        instruction:
`A classic first GPU kernel: one thread per pixel, perfectly parallel with no data dependencies.

**Luminance formula:**
\`\`\`
gray = 0.299f * R + 0.587f * G + 0.114f * B
\`\`\`
These weights match human eye sensitivity (green appears brightest).

**Task:** Implement \`rgbToGray\`. Each thread computes its 2D pixel index from \`blockIdx\` and \`threadIdx\`, applies the formula, and writes to \`gray[]\`.`,
        hint: "```c\nint x = blockIdx.x * blockDim.x + threadIdx.x;\nint y = blockIdx.y * blockDim.y + threadIdx.y;\nif (x >= width || y >= height) return;\nint idx = y * width + x;\nuchar3 p = rgb[idx];\ngray[idx] = 0.299f * p.x + 0.587f * p.y + 0.114f * p.z;\n```",
        starterCode:
`#include <stdio.h>
#include <math.h>
#include <cuda_runtime.h>

#define WIDTH  512
#define HEIGHT 512
#define TILE   16

// Each thread converts one pixel from RGB to grayscale.
// uchar3 is a CUDA built-in: .x=R, .y=G, .z=B (each 0-255).
__global__ void rgbToGray(const uchar3 *rgb, float *gray, int width, int height) {
    // TODO: compute 2D pixel (x, y) from blockIdx and threadIdx
    // TODO: bounds guard: if (x >= width || y >= height) return;
    // TODO: idx = y * width + x
    // TODO: gray[idx] = 0.299f * rgb[idx].x + 0.587f * rgb[idx].y + 0.114f * rgb[idx].z;
}

int main() {
    const size_t rgbBytes  = WIDTH * HEIGHT * sizeof(uchar3);
    const size_t grayBytes = WIDTH * HEIGHT * sizeof(float);

    // Allocate and fill host image (fake gradient for testing)
    uchar3 *h_rgb = (uchar3 *)malloc(rgbBytes);
    for (int i = 0; i < WIDTH * HEIGHT; i++) {
        h_rgb[i] = { (unsigned char)(i % 256),
                     (unsigned char)((i / 256) % 256),
                     128 };
    }

    uchar3 *d_rgb; float *d_gray;
    cudaMalloc(&d_rgb,  rgbBytes);
    cudaMalloc(&d_gray, grayBytes);
    cudaMemcpy(d_rgb, h_rgb, rgbBytes, cudaMemcpyHostToDevice);

    dim3 block(TILE, TILE);
    dim3 grid((WIDTH + TILE - 1) / TILE, (HEIGHT + TILE - 1) / TILE);

    cudaEvent_t t0, t1;
    cudaEventCreate(&t0); cudaEventCreate(&t1);
    cudaEventRecord(t0);
    // TODO: rgbToGray<<<grid, block>>>(d_rgb, d_gray, WIDTH, HEIGHT);
    cudaEventRecord(t1);
    cudaEventSynchronize(t1);

    float ms; cudaEventElapsedTime(&ms, t0, t1);
    printf("Grayscale: %.2f ms\\n", ms);

    // Verify: copy back and spot-check a pixel
    float *h_gray = (float *)malloc(grayBytes);
    cudaMemcpy(h_gray, d_gray, grayBytes, cudaMemcpyDeviceToHost);
    float expected = 0.299f * h_rgb[0].x + 0.587f * h_rgb[0].y + 0.114f * h_rgb[0].z;
    printf("Pixel[0] expected=%.2f got=%.2f %s\\n",
           expected, h_gray[0], fabsf(h_gray[0] - expected) < 0.01f ? "OK" : "MISMATCH");

    free(h_rgb); free(h_gray);
    cudaFree(d_rgb); cudaFree(d_gray);
    return 0;
}`,
        expectedOutput: "Grayscale: 0.12 ms\nPixel[0] expected=87.81 got=87.81 OK\n",
      },
      {
        title: "Step 2 — Gaussian Blur with halo",
        instruction:
`A Gaussian blur is a 2D convolution with kernel \`[1 2 1] / 4\` (separable).

**The halo problem:** Each output pixel reads a 3×3 neighbourhood. Naively, each of the 9 reads goes to global memory. Instead, load a \`(TILE+2) × (TILE+2)\` region into shared memory — the 2-pixel **halo** around the tile — so each global read is reused by multiple threads.

**Strategy:**
1. Load center pixels: \`tile[ty+1][tx+1] = in[...]\`
2. Load edges and corners (handle boundary with clamping)
3. \`__syncthreads()\`
4. Apply the 3×3 weighted sum using shared memory

**Task:** Implement \`gaussianBlur\` using the provided \`__shared__ float tile[TILE+2][TILE+2]\` scaffold.`,
        hint: "After loading the tile, the convolution is:\n```c\nfloat sum = tile[ty][tx]     + 2*tile[ty][tx+1]   + tile[ty][tx+2]\n          + 2*tile[ty+1][tx] + 4*tile[ty+1][tx+1] + 2*tile[ty+1][tx+2]\n          + tile[ty+2][tx]   + 2*tile[ty+2][tx+1]   + tile[ty+2][tx+2];\nout[y * width + x] = sum / 16.0f;\n```",
        starterCode:
`#include <stdio.h>
#include <math.h>
#include <cuda_runtime.h>

#define WIDTH  512
#define HEIGHT 512
#define TILE   16

__global__ void rgbToGray(const uchar3 *rgb, float *gray, int w, int h) {
    int x = blockIdx.x*TILE + threadIdx.x, y = blockIdx.y*TILE + threadIdx.y;
    if (x < w && y < h) gray[y*w+x] = 0.299f*rgb[y*w+x].x + 0.587f*rgb[y*w+x].y + 0.114f*rgb[y*w+x].z;
}

// Gaussian blur with (TILE+2)×(TILE+2) shared memory halo.
__global__ void gaussianBlur(const float *in, float *out, int width, int height) {
    __shared__ float tile[TILE + 2][TILE + 2];

    int tx = threadIdx.x, ty = threadIdx.y;
    int x  = blockIdx.x * TILE + tx;
    int y  = blockIdx.y * TILE + ty;

    // Helper: clamp coordinate to [0, max-1]
    auto clamp = [](int v, int maxv) { return v < 0 ? 0 : (v >= maxv ? maxv - 1 : v); };

    // TODO: Load center: tile[ty+1][tx+1] = in[clamp(y, height) * width + clamp(x, width)];
    // TODO: Load left column if tx == 0:    tile[ty+1][0]       = in[...clamp(x-1,...)]
    // TODO: Load right column if tx == TILE-1
    // TODO: Load top row if ty == 0
    // TODO: Load bottom row if ty == TILE-1
    // TODO: Load corners (if tx==0 && ty==0, etc.)
    // TODO: __syncthreads();

    if (x < width && y < height) {
        // TODO: apply 3×3 Gaussian weights from tile[ty..ty+2][tx..tx+2] and write to out
    }
}

int main() {
    const size_t rgbBytes  = WIDTH * HEIGHT * sizeof(uchar3);
    const size_t grayBytes = WIDTH * HEIGHT * sizeof(float);

    uchar3 *h_rgb = (uchar3 *)malloc(rgbBytes);
    for (int i = 0; i < WIDTH * HEIGHT; i++)
        h_rgb[i] = {(unsigned char)(i%256), (unsigned char)((i/256)%256), 128};

    uchar3 *d_rgb; float *d_gray, *d_blur;
    cudaMalloc(&d_rgb, rgbBytes); cudaMalloc(&d_gray, grayBytes); cudaMalloc(&d_blur, grayBytes);
    cudaMemcpy(d_rgb, h_rgb, rgbBytes, cudaMemcpyHostToDevice);

    dim3 block(TILE, TILE), grid((WIDTH+TILE-1)/TILE, (HEIGHT+TILE-1)/TILE);
    rgbToGray<<<grid, block>>>(d_rgb, d_gray, WIDTH, HEIGHT);

    cudaEvent_t t0, t1; cudaEventCreate(&t0); cudaEventCreate(&t1);
    cudaEventRecord(t0);
    // TODO: gaussianBlur<<<grid, block>>>(d_gray, d_blur, WIDTH, HEIGHT);
    cudaEventRecord(t1); cudaEventSynchronize(t1);
    float ms; cudaEventElapsedTime(&ms, t0, t1);
    printf("Gaussian blur: %.2f ms\\n", ms);

    free(h_rgb);
    cudaFree(d_rgb); cudaFree(d_gray); cudaFree(d_blur);
    return 0;
}`,
        expectedOutput: "Gaussian blur: 0.28 ms\n",
      },
    ],
    starterCode: `#include <stdio.h>
#include <math.h>
#include <cuda_runtime.h>

#define WIDTH  512
#define HEIGHT 512
#define TILE   16

__global__ void rgbToGray(uchar3 *rgb, float *gray, int width, int height) {
    // TODO
}

__global__ void gaussianBlur(float *in, float *out, int width, int height) {
    __shared__ float tile[TILE + 2][TILE + 2];
    // TODO
}

__global__ void sobelEdge(float *in, float *out, int width, int height) {
    // TODO
}

int main() {
    // TODO
    return 0;
}`,
    expectedOutput: "Grayscale: 1.2 ms\nGaussian: 2.8 ms\nSobel: 1.9 ms\n",
  },
  {
    slug: "parallel-scan",
    title: "Parallel Prefix Scan",
    description:
      "Implement the fundamental parallel scan primitive — first a work-inefficient Hillis-Steele scan, then a work-efficient Blelloch scan, then scale to multi-block arrays.",
    difficulty: "Intermediate",
    category: "Algorithms",
    estimatedMinutes: 75,
    prerequisites: ["hello-cuda"],
    tags: ["scan", "prefix-sum", "Blelloch", "shared-memory", "atomics", "reduction"],
    phases: [
      { title: "Hillis-Steele scan (single block)", description: "Inclusive scan using log₂(N) parallel steps." },
      { title: "Blelloch scan (single block)", description: "Work-efficient two-phase (reduce + downsweep) exclusive scan." },
      { title: "Multi-block scan", description: "Scan blocks independently, collect per-block sums, then add prefix back." },
      { title: "Stream compaction", description: "Use your scan to implement stream compaction." },
    ],
    starterCode: `#include <stdio.h>
#include <cuda_runtime.h>

__global__ void scanHillisSteele(int *in, int *out, int n) {
    extern __shared__ int buf[];
    // TODO: load, iterate strides, write
}

__global__ void scanBlelloch(int *in, int *out, int n) {
    extern __shared__ int s[];
    // TODO: upsweep + downsweep
}

int main() {
    const int N = 1024;
    int *h_in = (int*)malloc(N * sizeof(int));
    for (int i = 0; i < N; i++) h_in[i] = i + 1;
    // TODO: allocate, run both scans, verify
    free(h_in);
    return 0;
}`,
    expectedOutput: "Hillis-Steele: PASS\nBlelloch: PASS\n",
  },
  {
    slug: "histogram",
    title: "GPU Histogram with Privatization",
    description:
      "Compute an 8-bit grayscale histogram three ways: global atomics, per-warp privatization, and per-block shared-memory privatization.",
    difficulty: "Intermediate",
    category: "Algorithms",
    estimatedMinutes: 60,
    prerequisites: ["hello-cuda"],
    tags: ["atomics", "atomicAdd", "shared-memory", "privatization", "histogram"],
    phases: [
      { title: "Global-memory atomics", description: "atomicAdd directly into a 256-bin global histogram." },
      { title: "Shared-memory privatization", description: "Each block maintains its own histogram in shared memory." },
      { title: "Warp-level privatization", description: "Each warp maintains separate bins." },
      { title: "Benchmark", description: "Measure atomic contention at different input sizes." },
    ],
    starterCode: `#include <stdio.h>
#include <cuda_runtime.h>

#define NUM_BINS 256

__global__ void histGlobal(unsigned char *img, unsigned int *hist, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) atomicAdd(&hist[img[idx]], 1);
}

__global__ void histShared(unsigned char *img, unsigned int *hist, int n) {
    __shared__ unsigned int local[NUM_BINS];
    // TODO: zero local, accumulate, merge to global
}

int main() {
    const int N = 1 << 24;
    // TODO: allocate, fill, run, verify, benchmark
    return 0;
}`,
    expectedOutput: "Global atomics:  48 ms  (~330 Mpix/s)\nShared memory:   12 ms  (~1.3 Gpix/s)\n",
  },
  {
    slug: "reduction-variants",
    title: "Parallel Reduction — Six Optimizations",
    description:
      "Follow the classic NVIDIA reduction progression. Start with a naive implementation and apply six successive optimizations — from divergent warps to warp shuffle intrinsics.",
    difficulty: "Intermediate",
    category: "Algorithms",
    estimatedMinutes: 75,
    prerequisites: ["parallel-scan"],
    tags: ["reduction", "warp-shuffle", "__shfl_down_sync", "unrolling", "shared-memory"],
    phases: [
      { title: "Divergent reduction (baseline)", description: "Tree reduction with warp divergence." },
      { title: "Bank-conflict-free reduction", description: "Contiguous active threads." },
      { title: "Idle first-step elimination", description: "Load two elements per thread." },
      { title: "Unrolled last warp", description: "Avoid syncthreads when < 32 threads." },
      { title: "Full loop unroll", description: "Template parameter for blockSize." },
      { title: "Warp shuffle reduction", description: "__shfl_down_sync replaces shared memory." },
    ],
    starterCode: `#include <stdio.h>
#include <cuda_runtime.h>

__global__ void reduce0(float *in, float *out, int n) {
    extern __shared__ float sdata[];
    int tid = threadIdx.x;
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    sdata[tid] = (idx < n) ? in[idx] : 0.f;
    __syncthreads();
    for (int s = 1; s < blockDim.x; s *= 2) {
        if (tid % (2 * s) == 0) sdata[tid] += sdata[tid + s];
        __syncthreads();
    }
    if (tid == 0) out[blockIdx.x] = sdata[0];
}

// TODO: reduce1 through reduce5

int main() {
    const int N = 1 << 22;
    float *h_in = (float*)malloc(N * sizeof(float));
    for (int i = 0; i < N; i++) h_in[i] = 1.f;
    // TODO: benchmark all 6 variants
    free(h_in);
    return 0;
}`,
    expectedOutput: "Reduce0 (divergent):   18.4 ms  22.9 GB/s\nReduce5 (shuffle):      2.5 ms 168.4 GB/s\n",
  },

  // ─── Advanced ──────────────────────────────────────────────────────────────
  {
    slug: "tiled-sgemm",
    title: "Tiled SGEMM — Building a Mini cuBLAS",
    description:
      "Implement single-precision general matrix multiply (SGEMM) from scratch. Progress through naive, tiled, and register-file micro-tiled kernels. Benchmark against cuBLAS.",
    difficulty: "Advanced",
    category: "Optimization",
    estimatedMinutes: 120,
    prerequisites: ["reduction-variants"],
    tags: ["GEMM", "SGEMM", "tiling", "register-cache", "cuBLAS", "occupancy"],
    phases: [
      { title: "Naive SGEMM", description: "Each thread computes one output element." },
      { title: "Shared memory tiling", description: "Tile A and B into shared memory." },
      { title: "Register micro-tiling", description: "Each thread computes a TM×TN sub-block." },
      { title: "Benchmark vs cuBLAS", description: "Compare TFLOP/s across matrix sizes." },
    ],
    starterCode: `#include <stdio.h>
#include <cuda_runtime.h>
#include <cublas_v2.h>

__global__ void gemmNaive(float *A, float *B, float *C, int M, int N, int K) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < M && col < N) {
        float sum = 0.f;
        for (int k = 0; k < K; k++) sum += A[row * K + k] * B[k * N + col];
        C[row * N + col] = sum;
    }
}

#define BM 64
#define BN 64
#define BK 8

__global__ void gemmTiled(float *A, float *B, float *C, int M, int N, int K) {
    __shared__ float sA[BM][BK];
    __shared__ float sB[BK][BN];
    // TODO
}

int main() {
    for (int sz : {512, 1024, 2048}) {
        printf("\\n=== %dx%d ===\\n", sz, sz);
        // TODO: benchmark gemmNaive, gemmTiled, cuBLAS
    }
    return 0;
}`,
    expectedOutput: "=== 1024x1024 ===\nNaive:  0.41 TFLOP/s\nTiled:  4.2  TFLOP/s\n",
  },
  {
    slug: "nbody-simulation",
    title: "N-Body Gravitational Simulation",
    description:
      "Simulate gravitational N-body dynamics on the GPU. Build the naive all-pairs force kernel, tile it with shared memory, implement leapfrog time integration, and track energy conservation.",
    difficulty: "Advanced",
    category: "Algorithms",
    estimatedMinutes: 120,
    prerequisites: ["tiled-sgemm"],
    tags: ["N-body", "shared-memory", "tiling", "physics", "leapfrog", "AoS-SoA"],
    phases: [
      { title: "Data layout and force kernel", description: "AoS vs SoA layout. Write naive all-pairs force kernel." },
      { title: "Shared memory tiling", description: "Load TILE bodies at a time into shared memory." },
      { title: "Leapfrog integrator", description: "Symplectic velocity-Verlet time integration." },
      { title: "Energy conservation check", description: "Verify KE+PE is conserved across timesteps." },
    ],
    starterCode: `#include <stdio.h>
#include <math.h>
#include <cuda_runtime.h>

#define SOFTENING 1e-9f

__global__ void forceNaive(float4 *pos, float4 *acc, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;
    float ax = 0, ay = 0, az = 0;
    float4 pi = pos[i];
    for (int j = 0; j < n; j++) {
        float4 pj = pos[j];
        float dx = pj.x - pi.x, dy = pj.y - pi.y, dz = pj.z - pi.z;
        float dist2 = dx*dx + dy*dy + dz*dz + SOFTENING;
        float inv3 = rsqrtf(dist2) / dist2;
        ax += pj.w * dx * inv3; ay += pj.w * dy * inv3; az += pj.w * dz * inv3;
    }
    acc[i] = {ax, ay, az, 0};
}

#define TILE_SIZE 256
__global__ void forceTiled(float4 *pos, float4 *acc, int n) {
    __shared__ float4 shPos[TILE_SIZE];
    // TODO
}

__global__ void integrateLeapfrog(float4 *pos, float4 *vel, float4 *acc, int n, float dt) {
    // TODO: vel[i].xyz += acc[i].xyz * dt;  pos[i].xyz += vel[i].xyz * dt;
}

int main() {
    const int N = 4096, STEPS = 100;
    const float DT = 0.01f;
    // TODO: allocate, randomize, simulate, check energy
    return 0;
}`,
    expectedOutput: "Step   0: E = -1234.56 (baseline)\nStep 100: E = -1234.59 (drift: 0.02%)\n",
  },
  {
    slug: "gpu-radix-sort",
    title: "GPU Radix Sort",
    description:
      "Build a fully parallel LSD radix sort on the GPU. Implement digit histogram, exclusive scan for scatter addresses, and the scatter kernel.",
    difficulty: "Advanced",
    category: "Algorithms",
    estimatedMinutes: 120,
    prerequisites: ["parallel-scan", "histogram"],
    tags: ["radix-sort", "scan", "scatter", "histogram", "thrust"],
    phases: [
      { title: "Single-bit split", description: "Sort by one bit at a time." },
      { title: "4-bit digit histogram and scan", description: "16-bucket histogram per block." },
      { title: "Scatter pass", description: "Write keys to their sorted positions." },
      { title: "Full 32-bit sort (8 passes)", description: "Chain 8 passes, ping-pong buffers." },
    ],
    starterCode: `#include <stdio.h>
#include <cuda_runtime.h>
#include <thrust/sort.h>
#include <thrust/device_vector.h>

#define BITS_PER_PASS 4
#define NUM_BUCKETS   (1 << BITS_PER_PASS)
#define NUM_PASSES    (32 / BITS_PER_PASS)

__global__ void digitHistogram(unsigned int *keys, unsigned int *globalHist, int n, int shift) {
    __shared__ unsigned int local[NUM_BUCKETS];
    // TODO: zero local, accumulate, write to globalHist
}

__global__ void scatterKeys(unsigned int *in, unsigned int *out,
                             unsigned int *scan, int n, int shift) {
    // TODO
}

void radixSort(unsigned int *d_keys, unsigned int *d_tmp, int n) {
    // TODO: 8-pass loop
}

int main() {
    const int N = 1 << 20;
    unsigned int *h = (unsigned int*)malloc(N * sizeof(unsigned int));
    for (int i = 0; i < N; i++) h[i] = rand();
    // TODO: run radixSort, verify, compare to thrust
    free(h);
    return 0;
}`,
    expectedOutput: "Radix sort (1M keys):   4.2 ms\nResult sorted correctly: YES\n",
  },
];

export function getProjectBySlug(slug: string): ProjectData | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export function getProjectsByCategory(category: Category): ProjectData[] {
  return PROJECTS.filter((p) => p.category === category);
}

export function getProjectsByDifficulty(difficulty: Difficulty): ProjectData[] {
  return PROJECTS.filter((p) => p.difficulty === difficulty);
}

export function searchProjects(query: string): ProjectData[] {
  const q = query.toLowerCase();
  return PROJECTS.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export const CATEGORIES: Category[] = [
  "Memory",
  "Parallelism",
  "Optimization",
  "Algorithms",
  "Multi-GPU",
  "Interoperability",
];

export const DIFFICULTIES: Difficulty[] = ["Beginner", "Intermediate", "Advanced"];
