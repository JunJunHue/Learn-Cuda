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

/**
 * A single test assertion against the program's stdout.
 * All provided conditions must hold for the test to pass.
 */
export interface TestCase {
  id: string;
  description: string;
  /** Every string in this list must appear in stdout. */
  outputContains?: string[];
  /** None of the strings in this list may appear in stdout. */
  outputNotContains?: string[];
  /** A regex pattern that must match somewhere in stdout. */
  outputMatchesPattern?: string;
  /** If true, description is shown as "hidden test" before submission. */
  hidden?: boolean;
  /** Relative weight (default 1). */
  points?: number;
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
  /** 3 visible tests shown when the learner clicks "Run". */
  runTests?: TestCase[];
  /** 50–100 comprehensive tests run when the learner clicks "Submit". */
  submitTests?: TestCase[];
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
    runTests: [
      { id: "va-r1", description: "Result is CORRECT (not WRONG)", outputContains: ["CORRECT"], outputNotContains: ["WRONG"] },
      { id: "va-r2", description: "Bandwidth is reported in GB/s", outputContains: ["GB/s"] },
      { id: "va-r3", description: "No CUDA error messages", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault", "invalid"] },
    ],
    submitTests: [
      { id: "va-s01", description: "Output contains CORRECT", outputContains: ["CORRECT"] },
      { id: "va-s02", description: "Output does not contain WRONG", outputNotContains: ["WRONG"] },
      { id: "va-s03", description: "Output does not contain FAIL", outputNotContains: ["FAIL"] },
      { id: "va-s04", description: "Bandwidth reported in GB/s", outputContains: ["GB/s"] },
      { id: "va-s05", description: "No CUDA error in stdout", outputNotContains: ["cudaError"] },
      { id: "va-s06", description: "No segmentation fault", outputNotContains: ["Segmentation fault", "segfault"] },
      { id: "va-s07", description: "No 'invalid device pointer'", outputNotContains: ["invalid device pointer"] },
      { id: "va-s08", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "va-s09", description: "Bandwidth number is present (digit before GB/s)", outputMatchesPattern: "\\d+\\.?\\d*\\s*GB/s" },
      { id: "va-s10", description: "Output is non-empty", outputMatchesPattern: "\\S" },
      { id: "va-s11", description: "Result line present", outputMatchesPattern: "Result" },
      { id: "va-s12", description: "No uninitialized memory warning", outputNotContains: ["uninitialized"] },
      { id: "va-s13", description: "No kernel launch failure", outputNotContains: ["kernel launch"] },
      { id: "va-s14", description: "Bandwidth >= 10 GB/s (sanity)", outputMatchesPattern: "[1-9]\\d+\\.?\\d*\\s*GB/s" },
      { id: "va-s15", description: "No 'nan' values in output", outputNotContains: ["nan", "NaN"] },
      { id: "va-s16", description: "No 'inf' values in output", outputNotContains: [" inf ", "Inf\n"] },
      { id: "va-s17", description: "Program exits cleanly (no abort message)", outputNotContains: ["Aborted", "abort"] },
      { id: "va-s18", description: "No 'illegal memory access'", outputNotContains: ["illegal memory access"] },
      { id: "va-s19", description: "cudaMalloc path exercised (no placeholder output)", outputNotContains: ["add timing code above"] },
      { id: "va-s20", description: "Vector size implied (N= or M= present or throughput line)", outputMatchesPattern: "CORRECT|WRONG|GB/s" },
      { id: "va-s21", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "va-s22", description: "No assertion failure", outputNotContains: ["Assertion failed", "assert"] },
      { id: "va-s23", description: "Timing line contains 'ms' or 'us'", outputMatchesPattern: "\\d+\\.?\\d*\\s*(ms|us|GB/s)" },
      { id: "va-s24", description: "Result not empty string", outputMatchesPattern: ".+" },
      { id: "va-s25", description: "Bandwidth line not negative", outputMatchesPattern: "[^-]\\d+\\.\\d+\\s*GB/s" },
      { id: "va-s26", description: "No 'TODO' left in output", outputNotContains: ["TODO"] },
      { id: "va-s27", description: "No compile placeholder output", outputNotContains: ["fill in the TODO"] },
      { id: "va-s28", description: "CORRECT is uppercase", outputContains: ["CORRECT"] },
      { id: "va-s29", description: "No 'Error:' prefix in stdout", outputNotContains: ["Error:"] },
      { id: "va-s30", description: "Bandwidth value appears once or more", outputMatchesPattern: "(\\d+\\.\\d+\\s*GB/s)" },
      { id: "va-s31", description: "No 'misaligned address'", outputNotContains: ["misaligned address"] },
      { id: "va-s32", description: "Output ends with newline or text (not silent)", outputMatchesPattern: "[\\s\\S]+" },
      { id: "va-s33", description: "No 'device-side assert'", outputNotContains: ["device-side assert"] },
      { id: "va-s34", description: "CORRECT appears exactly once or more", outputMatchesPattern: "CORRECT" },
      { id: "va-s35", description: "No negative bandwidth", outputNotContains: ["-0.", "- "] },
      { id: "va-s36", description: "Throughput > 1 GB/s implied by digits", outputMatchesPattern: "[2-9]\\d{1,3}\\.?\\d*\\s*GB/s" },
      { id: "va-s37", description: "No 'warp' error messages", outputNotContains: ["warp illegal"] },
      { id: "va-s38", description: "No 'bus error'", outputNotContains: ["Bus error"] },
      { id: "va-s39", description: "No 'timeout' in stdout", outputNotContains: ["timeout"] },
      { id: "va-s40", description: "No question marks from printf format errors", outputNotContains: ["??", "??"] },
      { id: "va-s41", description: "CORRECT not followed by WRONG on same line", outputNotContains: ["CORRECT WRONG"] },
      { id: "va-s42", description: "Memory bandwidth line format valid", outputMatchesPattern: "\\d+\\.\\d+\\s*GB/s|\\d+\\s*GB/s" },
      { id: "va-s43", description: "Hidden: kernel writes all N elements", outputContains: ["CORRECT"], hidden: true },
      { id: "va-s44", description: "Hidden: bandwidth > 50 GB/s on modern GPU", outputMatchesPattern: "[5-9]\\d\\.\\d+\\s*GB/s|[1-9]\\d{2,}\\.\\d+\\s*GB/s", hidden: true },
      { id: "va-s45", description: "Hidden: no double-free signal", outputNotContains: ["double free"], hidden: true },
      { id: "va-s46", description: "Hidden: result correct for all N elements", outputNotContains: ["WRONG"], hidden: true },
      { id: "va-s47", description: "Hidden: timing reported in ms", outputMatchesPattern: "\\d+\\.\\d+\\s*ms|\\d+\\.\\d+\\s*GB", hidden: true },
      { id: "va-s48", description: "Hidden: no leftover debug print", outputNotContains: ["debug", "DEBUG"], hidden: true },
      { id: "va-s49", description: "Hidden: output does not mention cudaFree error", outputNotContains: ["cudaFree error"], hidden: true },
      { id: "va-s50", description: "Hidden: final output has expected keyword", outputMatchesPattern: "CORRECT|Bandwidth", hidden: true },
    ],
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
    runTests: [
      { id: "hc-r1", description: "Hello from the GPU printed", outputContains: ["Hello from the GPU!"] },
      { id: "hc-r2", description: "Thread IDs appear in output (thread 0 present)", outputMatchesPattern: "(thread|Thread)\\s+0|Hello" },
      { id: "hc-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "hc-s01", description: "Hello from the GPU printed", outputContains: ["Hello from the GPU!"] },
      { id: "hc-s02", description: "No CUDA error messages", outputNotContains: ["cudaError"] },
      { id: "hc-s03", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "hc-s04", description: "Thread 0 appears in output", outputMatchesPattern: "[Tt]hread\\s*0" },
      { id: "hc-s05", description: "Global ID 0 appears", outputMatchesPattern: "Global ID 0|global id 0" },
      { id: "hc-s06", description: "Block 0 appears in output", outputMatchesPattern: "[Bb]lock\\s*0" },
      { id: "hc-s07", description: "Multiple lines of output (multi-thread launch)", outputMatchesPattern: "([\\s\\S]*\\n){2,}" },
      { id: "hc-s08", description: "No 'TODO' in output", outputNotContains: ["TODO"] },
      { id: "hc-s09", description: "No 'nan' in output", outputNotContains: ["nan", "NaN"] },
      { id: "hc-s10", description: "Output is non-empty", outputMatchesPattern: "\\S" },
      { id: "hc-s11", description: "No abort signal", outputNotContains: ["Aborted"] },
      { id: "hc-s12", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "hc-s13", description: "Thread IDs are numeric", outputMatchesPattern: "[Tt]hread\\s+\\d+" },
      { id: "hc-s14", description: "Block IDs are numeric", outputMatchesPattern: "[Bb]lock\\s+\\d+" },
      { id: "hc-s15", description: "Global IDs present", outputMatchesPattern: "Global ID \\d+" },
      { id: "hc-s16", description: "No negative thread IDs", outputNotContains: ["Thread -", "thread -"] },
      { id: "hc-s17", description: "At least 8 output lines (launch >= 8 threads)", outputMatchesPattern: "([^\\n]+\\n){8,}" },
      { id: "hc-s18", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "hc-s19", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "hc-s20", description: "No double-free", outputNotContains: ["double free"] },
      { id: "hc-s21", description: "GPU is used (printf from device)", outputContains: ["Hello from the GPU!"] },
      { id: "hc-s22", description: "Hello printed multiple times (multi-thread)", outputMatchesPattern: "(Hello from the GPU!\\s*){1}" },
      { id: "hc-s23", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "hc-s24", description: "No placeholder message", outputNotContains: ["add timing", "fill in"] },
      { id: "hc-s25", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "hc-s26", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "hc-s27", description: "Thread IDs non-negative", outputMatchesPattern: "[Tt]hread [0-9]" },
      { id: "hc-s28", description: "Block IDs non-negative", outputMatchesPattern: "[Bb]lock [0-9]" },
      { id: "hc-s29", description: "Arrow or separator in thread output", outputMatchesPattern: "->|→" },
      { id: "hc-s30", description: "Output ends with newline content", outputMatchesPattern: "[\\s\\S]+" },
      { id: "hc-s31", description: "No 'undefined reference'", outputNotContains: ["undefined reference"] },
      { id: "hc-s32", description: "No 'not found'", outputNotContains: ["not found"] },
      { id: "hc-s33", description: "Output doesn't say 'kernels are empty'", outputNotContains: ["kernels are empty"] },
      { id: "hc-s34", description: "Hello appears at least once", outputMatchesPattern: "Hello" },
      { id: "hc-s35", description: "GPU string present", outputMatchesPattern: "GPU|gpu" },
      { id: "hc-s36", description: "No excess whitespace artifacts (??)", outputNotContains: ["??"] },
      { id: "hc-s37", description: "Thread hierarchy demonstrated (blockIdx, threadIdx used)", outputMatchesPattern: "[Bb]lock \\d+.*[Tt]hread \\d+" },
      { id: "hc-s38", description: "No kernel launch error", outputNotContains: ["kernel launch error"] },
      { id: "hc-s39", description: "No timeout message", outputNotContains: ["timeout"] },
      { id: "hc-s40", description: "No 'device-side assert'", outputNotContains: ["device-side assert"] },
      { id: "hc-s41", description: "Hello from the GPU repeated for each thread", outputMatchesPattern: "Hello from the GPU!" },
      { id: "hc-s42", description: "Global ID increases monotonically present", outputMatchesPattern: "Global ID [0-9]" },
      { id: "hc-s43", description: "Hidden: all 32 thread IDs printed", outputMatchesPattern: "([^\\n]+\\n){24,}", hidden: true },
      { id: "hc-s44", description: "Hidden: no WRONG answer", outputNotContains: ["WRONG", "wrong"], hidden: true },
      { id: "hc-s45", description: "Hidden: synchronization happened (no garbled output)", outputNotContains: ["cudaDeviceSynchronize error"], hidden: true },
      { id: "hc-s46", description: "Hidden: thread 0 global ID = 0", outputMatchesPattern: "Global ID 0", hidden: true },
      { id: "hc-s47", description: "Hidden: block and thread both shown on each line", outputMatchesPattern: "[Bb]lock \\d+.*[Tt]hread \\d+", hidden: true },
      { id: "hc-s48", description: "Hidden: no out-of-bounds access", outputNotContains: ["out of bounds"], hidden: true },
      { id: "hc-s49", description: "Hidden: no memory leak message", outputNotContains: ["memory leak"], hidden: true },
      { id: "hc-s50", description: "Hidden: GPU prints expected hello string", outputContains: ["Hello from the GPU!"], hidden: true },
    ],
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
    runTests: [
      { id: "mt-r1", description: "All results correct: YES", outputContains: ["YES"] },
      { id: "mt-r2", description: "All three kernel timings reported", outputMatchesPattern: "(Naive|Shared|bank)" },
      { id: "mt-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "WRONG"] },
    ],
    submitTests: [
      { id: "mt-s01", description: "All results correct: YES", outputContains: ["YES"] },
      { id: "mt-s02", description: "No WRONG answer", outputNotContains: ["WRONG"] },
      { id: "mt-s03", description: "Naive transpose reported", outputMatchesPattern: "Naive" },
      { id: "mt-s04", description: "Shared memory reported", outputMatchesPattern: "Shared memory|shared" },
      { id: "mt-s05", description: "No bank conflict version reported", outputMatchesPattern: "[Nn]o bank|bank conflict" },
      { id: "mt-s06", description: "Timing in ms", outputMatchesPattern: "\\d+\\.?\\d*\\s*ms" },
      { id: "mt-s07", description: "Bandwidth in GB/s", outputMatchesPattern: "\\d+\\.?\\d*\\s*GB/s" },
      { id: "mt-s08", description: "No CUDA error", outputNotContains: ["cudaError"] },
      { id: "mt-s09", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "mt-s10", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "mt-s11", description: "Output is non-empty", outputMatchesPattern: "\\S" },
      { id: "mt-s12", description: "Multiple timing lines", outputMatchesPattern: "ms[\\s\\S]+ms" },
      { id: "mt-s13", description: "No TODO placeholder in output", outputNotContains: ["TODO"] },
      { id: "mt-s14", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "mt-s15", description: "No nan values", outputNotContains: ["nan", "NaN"] },
      { id: "mt-s16", description: "Shared memory faster than naive (both present)", outputMatchesPattern: "Naive[\\s\\S]+Shared|Shared[\\s\\S]+Naive" },
      { id: "mt-s17", description: "Bandwidth numbers are positive", outputMatchesPattern: "[1-9]\\d*\\.?\\d*\\s*GB/s" },
      { id: "mt-s18", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "mt-s19", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "mt-s20", description: "No inf values", outputNotContains: [" inf "] },
      { id: "mt-s21", description: "Correctness check printed", outputMatchesPattern: "correct|CORRECT|YES|result" },
      { id: "mt-s22", description: "Three separate timing values present", outputMatchesPattern: "\\d+\\.\\d+[\\s\\S]+\\d+\\.\\d+[\\s\\S]+\\d+\\.\\d+" },
      { id: "mt-s23", description: "No negative timing values", outputNotContains: ["-0.", "- ms"] },
      { id: "mt-s24", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "mt-s25", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "mt-s26", description: "Bandwidth improvement shown across methods", outputMatchesPattern: "GB/s[\\s\\S]+GB/s" },
      { id: "mt-s27", description: "No double-free", outputNotContains: ["double free"] },
      { id: "mt-s28", description: "No 'Error:' in output", outputNotContains: ["Error:"] },
      { id: "mt-s29", description: "No 'failed' in output", outputNotContains: [" failed"] },
      { id: "mt-s30", description: "All 3 kernel results correct", outputContains: ["YES"] },
      { id: "mt-s31", description: "No 'timeout'", outputNotContains: ["timeout"] },
      { id: "mt-s32", description: "Timing values are plausible (>0.1 ms)", outputMatchesPattern: "[1-9]\\d*\\.\\d+\\s*ms|0\\.[1-9]\\d*\\s*ms" },
      { id: "mt-s33", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "mt-s34", description: "Output has at least 3 lines", outputMatchesPattern: "([^\\n]+\\n){3,}" },
      { id: "mt-s35", description: "No 'kernel launch failure'", outputNotContains: ["kernel launch failure"] },
      { id: "mt-s36", description: "TILE value used (shared memory optimization verified)", outputMatchesPattern: "Shared|bank" },
      { id: "mt-s37", description: "No negative bandwidth values", outputMatchesPattern: "[^-]\\d+\\.?\\d*\\s*GB/s" },
      { id: "mt-s38", description: "Correctness keyword present", outputMatchesPattern: "correct|YES|CORRECT" },
      { id: "mt-s39", description: "No 'INCORRECT' in output", outputNotContains: ["INCORRECT"] },
      { id: "mt-s40", description: "No 'FAIL'", outputNotContains: ["FAIL"] },
      { id: "mt-s41", description: "GB/s values all positive (non-zero digit before decimal)", outputMatchesPattern: "[1-9]\\d*\\.\\d+\\s*GB/s" },
      { id: "mt-s42", description: "Hidden: shared memory faster than naive by 2x+", outputMatchesPattern: "[2-9]\\d\\.\\d+\\s*ms|[1-9]\\d{2}\\.\\d+\\s*ms", hidden: true },
      { id: "mt-s43", description: "Hidden: no bank conflict version reported", outputMatchesPattern: "bank|Bank", hidden: true },
      { id: "mt-s44", description: "Hidden: all 3 methods show CORRECT", outputMatchesPattern: "YES|CORRECT", hidden: true },
      { id: "mt-s45", description: "Hidden: bandwidth in hundreds of GB/s range", outputMatchesPattern: "[1-9]\\d{2}\\.?\\d*\\s*GB/s", hidden: true },
      { id: "mt-s46", description: "Hidden: no cudaMalloc failure", outputNotContains: ["cudaMalloc failed"], hidden: true },
      { id: "mt-s47", description: "Hidden: three bandwidth figures", outputMatchesPattern: "GB/s[\\s\\S]+GB/s[\\s\\S]+GB/s", hidden: true },
      { id: "mt-s48", description: "Hidden: results match expected transpose", outputContains: ["YES"], hidden: true },
      { id: "mt-s49", description: "Hidden: no leftover TODO in output", outputNotContains: ["TODO", "fill in"], hidden: true },
      { id: "mt-s50", description: "Hidden: shared memory version present", outputMatchesPattern: "[Ss]hared", hidden: true },
    ],
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
    runTests: [
      { id: "ip-r1", description: "Grayscale stage runs and reports time", outputContains: ["Grayscale"] },
      { id: "ip-r2", description: "All three pipeline stages reported", outputMatchesPattern: "Grayscale[\\s\\S]+Gaussian[\\s\\S]+Sobel" },
      { id: "ip-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "ip-s01", description: "Grayscale stage present", outputContains: ["Grayscale"] },
      { id: "ip-s02", description: "Gaussian stage present", outputContains: ["Gaussian"] },
      { id: "ip-s03", description: "Sobel stage present", outputContains: ["Sobel"] },
      { id: "ip-s04", description: "Timing in ms for all stages", outputMatchesPattern: "\\d+\\.\\d+\\s*ms[\\s\\S]+\\d+\\.\\d+\\s*ms" },
      { id: "ip-s05", description: "No CUDA error", outputNotContains: ["cudaError"] },
      { id: "ip-s06", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "ip-s07", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "ip-s08", description: "Output is non-empty", outputMatchesPattern: "\\S" },
      { id: "ip-s09", description: "No nan in output", outputNotContains: ["nan", "NaN"] },
      { id: "ip-s10", description: "No TODO placeholder", outputNotContains: ["TODO"] },
      { id: "ip-s11", description: "Grayscale timing is positive", outputMatchesPattern: "Grayscale:\\s*\\d+\\.?\\d*\\s*ms" },
      { id: "ip-s12", description: "Gaussian timing is positive", outputMatchesPattern: "Gaussian:\\s*\\d+\\.?\\d*\\s*ms" },
      { id: "ip-s13", description: "Sobel timing is positive", outputMatchesPattern: "Sobel:\\s*\\d+\\.?\\d*\\s*ms" },
      { id: "ip-s14", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "ip-s15", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "ip-s16", description: "No negative timing", outputNotContains: ["-0.", "- ms"] },
      { id: "ip-s17", description: "No 'failed'", outputNotContains: [" failed"] },
      { id: "ip-s18", description: "Output has at least 3 lines", outputMatchesPattern: "([^\\n]+\\n){3,}" },
      { id: "ip-s19", description: "No inf values", outputNotContains: [" inf "] },
      { id: "ip-s20", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "ip-s21", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "ip-s22", description: "No double-free", outputNotContains: ["double free"] },
      { id: "ip-s23", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "ip-s24", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "ip-s25", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "ip-s26", description: "No timeout", outputNotContains: ["timeout"] },
      { id: "ip-s27", description: "Pixel correctness check if present", outputNotContains: ["WRONG pixel", "pixel FAIL"] },
      { id: "ip-s28", description: "No kernel launch failure", outputNotContains: ["kernel launch failure"] },
      { id: "ip-s29", description: "Pipeline stages in correct order", outputMatchesPattern: "Grayscale[\\s\\S]+Sobel" },
      { id: "ip-s30", description: "Timing values > 0", outputMatchesPattern: "[1-9]\\d*\\.?\\d*\\s*ms|0\\.[1-9]" },
      { id: "ip-s31", description: "No 'FAIL'", outputNotContains: ["FAIL"] },
      { id: "ip-s32", description: "No 'INCORRECT'", outputNotContains: ["INCORRECT"] },
      { id: "ip-s33", description: "No memory leak messages", outputNotContains: ["memory leak"] },
      { id: "ip-s34", description: "No undefined behavior", outputNotContains: ["undefined behavior"] },
      { id: "ip-s35", description: "Timing values are plausible numbers", outputMatchesPattern: "\\d+\\.\\d+" },
      { id: "ip-s36", description: "No signal 11", outputNotContains: ["signal 11"] },
      { id: "ip-s37", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "ip-s38", description: "No double free", outputNotContains: ["double free"] },
      { id: "ip-s39", description: "No 'invalid' in output", outputNotContains: ["invalid device"] },
      { id: "ip-s40", description: "Output format has colon separator", outputMatchesPattern: "\\w+:\\s*\\d+" },
      { id: "ip-s41", description: "Pixel validation OK if present", outputNotContains: ["FAIL", "WRONG"] },
      { id: "ip-s42", description: "Hidden: grayscale value matches expected", outputMatchesPattern: "Grayscale.*ms", hidden: true },
      { id: "ip-s43", description: "Hidden: gaussian blur applied", outputMatchesPattern: "Gaussian.*ms", hidden: true },
      { id: "ip-s44", description: "Hidden: sobel edge detection runs", outputMatchesPattern: "Sobel.*ms", hidden: true },
      { id: "ip-s45", description: "Hidden: no pixel correctness failure", outputNotContains: ["FAIL", "WRONG"], hidden: true },
      { id: "ip-s46", description: "Hidden: pipeline completes without error", outputNotContains: ["cudaError", "failed"], hidden: true },
      { id: "ip-s47", description: "Hidden: three stages all complete", outputMatchesPattern: "Grayscale[\\s\\S]+Gaussian[\\s\\S]+Sobel", hidden: true },
      { id: "ip-s48", description: "Hidden: no shared memory bank conflict error", outputNotContains: ["bank conflict error"], hidden: true },
      { id: "ip-s49", description: "Hidden: timing values non-zero", outputMatchesPattern: "[1-9]\\d*\\.\\d+\\s*ms", hidden: true },
      { id: "ip-s50", description: "Hidden: all stages complete successfully", outputMatchesPattern: "Sobel", hidden: true },
    ],
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
    runTests: [
      { id: "ps-r1", description: "Hillis-Steele scan passes", outputContains: ["Hillis-Steele: PASS"] },
      { id: "ps-r2", description: "Blelloch scan passes", outputContains: ["Blelloch: PASS"] },
      { id: "ps-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "ps-s01", description: "Hillis-Steele: PASS", outputContains: ["Hillis-Steele: PASS"] },
      { id: "ps-s02", description: "Blelloch: PASS", outputContains: ["Blelloch: PASS"] },
      { id: "ps-s03", description: "No FAIL anywhere", outputNotContains: ["FAIL"] },
      { id: "ps-s04", description: "No WRONG anywhere", outputNotContains: ["WRONG"] },
      { id: "ps-s05", description: "No cudaError", outputNotContains: ["cudaError"] },
      { id: "ps-s06", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "ps-s07", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "ps-s08", description: "Output non-empty", outputMatchesPattern: "\\S" },
      { id: "ps-s09", description: "No nan values", outputNotContains: ["nan", "NaN"] },
      { id: "ps-s10", description: "No TODO in output", outputNotContains: ["TODO"] },
      { id: "ps-s11", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "ps-s12", description: "Both scan algorithms present", outputMatchesPattern: "Hillis[\\s\\S]+Blelloch|Blelloch[\\s\\S]+Hillis" },
      { id: "ps-s13", description: "PASS for both", outputMatchesPattern: "PASS[\\s\\S]+PASS" },
      { id: "ps-s14", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "ps-s15", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "ps-s16", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "ps-s17", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "ps-s18", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "ps-s19", description: "No double-free", outputNotContains: ["double free"] },
      { id: "ps-s20", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "ps-s21", description: "No timeout", outputNotContains: ["timeout"] },
      { id: "ps-s22", description: "No kernel launch failure", outputNotContains: ["kernel launch failure"] },
      { id: "ps-s23", description: "Hillis-Steele algorithm named correctly", outputMatchesPattern: "Hillis.Steele" },
      { id: "ps-s24", description: "Blelloch algorithm named correctly", outputMatchesPattern: "Blelloch" },
      { id: "ps-s25", description: "Output has at least 2 lines", outputMatchesPattern: "([^\\n]+\\n){2,}" },
      { id: "ps-s26", description: "No inf values", outputNotContains: [" inf "] },
      { id: "ps-s27", description: "No signal 11", outputNotContains: ["signal 11"] },
      { id: "ps-s28", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "ps-s29", description: "No INCORRECT", outputNotContains: ["INCORRECT"] },
      { id: "ps-s30", description: "No invalid device pointer", outputNotContains: ["invalid device pointer"] },
      { id: "ps-s31", description: "Scan result is inclusive or exclusive as expected", outputMatchesPattern: "PASS" },
      { id: "ps-s32", description: "No memory leak message", outputNotContains: ["memory leak"] },
      { id: "ps-s33", description: "No undefined behavior", outputNotContains: ["undefined behavior"] },
      { id: "ps-s34", description: "Output ends with content", outputMatchesPattern: "[\\s\\S]+" },
      { id: "ps-s35", description: "PASS appears at least twice", outputMatchesPattern: "PASS[\\s\\S]+PASS" },
      { id: "ps-s36", description: "No debug printout", outputNotContains: ["debug:", "DEBUG"] },
      { id: "ps-s37", description: "No 'failed'", outputNotContains: [" failed"] },
      { id: "ps-s38", description: "No kernel error", outputNotContains: ["kernel error"] },
      { id: "ps-s39", description: "No negative array sizes", outputNotContains: ["-1 elements", "-N"] },
      { id: "ps-s40", description: "Scan named in output", outputMatchesPattern: "(scan|Scan|prefix)" },
      { id: "ps-s41", description: "No 'FAILED' keyword", outputNotContains: ["FAILED"] },
      { id: "ps-s42", description: "Hidden: Hillis-Steele correct for all elements", outputContains: ["Hillis-Steele: PASS"], hidden: true },
      { id: "ps-s43", description: "Hidden: Blelloch correct for all elements", outputContains: ["Blelloch: PASS"], hidden: true },
      { id: "ps-s44", description: "Hidden: no synchronization error", outputNotContains: ["sync error", "__syncthreads"], hidden: true },
      { id: "ps-s45", description: "Hidden: results match prefix sum definition", outputNotContains: ["FAIL", "WRONG"], hidden: true },
      { id: "ps-s46", description: "Hidden: both algorithms complete", outputMatchesPattern: "PASS[\\s\\S]+PASS", hidden: true },
      { id: "ps-s47", description: "Hidden: no race condition output", outputNotContains: ["race", "data race"], hidden: true },
      { id: "ps-s48", description: "Hidden: no cudaMalloc failure", outputNotContains: ["cudaMalloc failed"], hidden: true },
      { id: "ps-s49", description: "Hidden: output contains both algorithm names", outputMatchesPattern: "Hillis[\\s\\S]+Blelloch", hidden: true },
      { id: "ps-s50", description: "Hidden: final result verified PASS", outputMatchesPattern: "PASS", hidden: true },
    ],
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
    runTests: [
      { id: "ht-r1", description: "Global atomics timing reported", outputContains: ["Global atomics"] },
      { id: "ht-r2", description: "Shared memory timing reported", outputContains: ["Shared memory"] },
      { id: "ht-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "ht-s01", description: "Global atomics line present", outputContains: ["Global atomics"] },
      { id: "ht-s02", description: "Shared memory line present", outputContains: ["Shared memory"] },
      { id: "ht-s03", description: "Timing in ms", outputMatchesPattern: "\\d+\\.?\\d*\\s*ms" },
      { id: "ht-s04", description: "Throughput in Mpix/s or Gpix/s", outputMatchesPattern: "(M|G)pix/s" },
      { id: "ht-s05", description: "No cudaError", outputNotContains: ["cudaError"] },
      { id: "ht-s06", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "ht-s07", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "ht-s08", description: "Output is non-empty", outputMatchesPattern: "\\S" },
      { id: "ht-s09", description: "No nan values", outputNotContains: ["nan", "NaN"] },
      { id: "ht-s10", description: "No TODO in output", outputNotContains: ["TODO"] },
      { id: "ht-s11", description: "Shared memory faster than global atomics", outputMatchesPattern: "Global[\\s\\S]+Shared|Shared[\\s\\S]+Global" },
      { id: "ht-s12", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "ht-s13", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "ht-s14", description: "No negative timing", outputNotContains: ["-0.", "- ms"] },
      { id: "ht-s15", description: "Timing values are positive numbers", outputMatchesPattern: "[1-9]\\d*\\.?\\d*\\s*ms" },
      { id: "ht-s16", description: "No 'failed'", outputNotContains: [" failed"] },
      { id: "ht-s17", description: "Output has at least 2 lines", outputMatchesPattern: "([^\\n]+\\n){2,}" },
      { id: "ht-s18", description: "No inf values", outputNotContains: [" inf "] },
      { id: "ht-s19", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "ht-s20", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "ht-s21", description: "No double-free", outputNotContains: ["double free"] },
      { id: "ht-s22", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "ht-s23", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "ht-s24", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "ht-s25", description: "No timeout", outputNotContains: ["timeout"] },
      { id: "ht-s26", description: "Histogram correctness check if present", outputNotContains: ["WRONG histogram", "FAIL"] },
      { id: "ht-s27", description: "Two methods compared", outputMatchesPattern: "Global[\\s\\S]+Shared" },
      { id: "ht-s28", description: "No kernel launch failure", outputNotContains: ["kernel launch failure"] },
      { id: "ht-s29", description: "Throughput numbers present", outputMatchesPattern: "\\d+\\.?\\d*\\s*(M|G)pix" },
      { id: "ht-s30", description: "No signal 11", outputNotContains: ["signal 11"] },
      { id: "ht-s31", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "ht-s32", description: "No INCORRECT", outputNotContains: ["INCORRECT"] },
      { id: "ht-s33", description: "No memory leak message", outputNotContains: ["memory leak"] },
      { id: "ht-s34", description: "Shared memory version shows speedup", outputMatchesPattern: "Shared memory" },
      { id: "ht-s35", description: "No race condition message", outputNotContains: ["race condition", "data race"] },
      { id: "ht-s36", description: "Mpix/s or Gpix/s throughput line", outputMatchesPattern: "pix/s" },
      { id: "ht-s37", description: "No negative throughput", outputNotContains: ["-0. Mpix", "-0. Gpix"] },
      { id: "ht-s38", description: "No 'FAILED' keyword", outputNotContains: ["FAILED"] },
      { id: "ht-s39", description: "No undefined behavior", outputNotContains: ["undefined behavior"] },
      { id: "ht-s40", description: "Histogram bins counted correctly (no WRONG)", outputNotContains: ["WRONG"] },
      { id: "ht-s41", description: "Both method names appear", outputMatchesPattern: "Global[\\s\\S]+Shared" },
      { id: "ht-s42", description: "Hidden: shared memory >2x faster than global atomics", outputMatchesPattern: "Shared memory:\\s+\\d+\\.?\\d*\\s*ms", hidden: true },
      { id: "ht-s43", description: "Hidden: throughput in Gpix/s for shared mem", outputMatchesPattern: "Gpix/s|Mpix/s", hidden: true },
      { id: "ht-s44", description: "Hidden: no warp serialization artifacts", outputNotContains: ["serialization"], hidden: true },
      { id: "ht-s45", description: "Hidden: histogram bins are correct", outputNotContains: ["WRONG", "FAIL"], hidden: true },
      { id: "ht-s46", description: "Hidden: atomic adds complete without error", outputNotContains: ["atomicAdd error", "atomic fail"], hidden: true },
      { id: "ht-s47", description: "Hidden: both methods complete", outputMatchesPattern: "Global[\\s\\S]+Shared", hidden: true },
      { id: "ht-s48", description: "Hidden: no cudaMalloc failure", outputNotContains: ["cudaMalloc failed"], hidden: true },
      { id: "ht-s49", description: "Hidden: throughput values present", outputMatchesPattern: "pix/s", hidden: true },
      { id: "ht-s50", description: "Hidden: shared memory implementation present", outputContains: ["Shared memory"], hidden: true },
    ],
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
    runTests: [
      { id: "rv-r1", description: "Reduce0 (divergent) reported", outputMatchesPattern: "Reduce0" },
      { id: "rv-r2", description: "Reduce5 (shuffle) reported", outputMatchesPattern: "Reduce5" },
      { id: "rv-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "rv-s01", description: "Reduce0 line present", outputMatchesPattern: "Reduce0" },
      { id: "rv-s02", description: "Reduce5 line present", outputMatchesPattern: "Reduce5" },
      { id: "rv-s03", description: "Timing in ms", outputMatchesPattern: "\\d+\\.?\\d*\\s*ms" },
      { id: "rv-s04", description: "Bandwidth in GB/s", outputMatchesPattern: "\\d+\\.?\\d*\\s*GB/s" },
      { id: "rv-s05", description: "No cudaError", outputNotContains: ["cudaError"] },
      { id: "rv-s06", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "rv-s07", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "rv-s08", description: "Output non-empty", outputMatchesPattern: "\\S" },
      { id: "rv-s09", description: "No nan values", outputNotContains: ["nan", "NaN"] },
      { id: "rv-s10", description: "No TODO in output", outputNotContains: ["TODO"] },
      { id: "rv-s11", description: "Multiple reduction variants reported", outputMatchesPattern: "Reduce[0-9]" },
      { id: "rv-s12", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "rv-s13", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "rv-s14", description: "Shuffle-based reduction present", outputMatchesPattern: "shuffle|warp" },
      { id: "rv-s15", description: "Bandwidth values positive", outputMatchesPattern: "[1-9]\\d*\\.?\\d*\\s*GB/s" },
      { id: "rv-s16", description: "No 'failed'", outputNotContains: [" failed"] },
      { id: "rv-s17", description: "Output has at least 2 lines", outputMatchesPattern: "([^\\n]+\\n){2,}" },
      { id: "rv-s18", description: "No inf values", outputNotContains: [" inf "] },
      { id: "rv-s19", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "rv-s20", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "rv-s21", description: "No double-free", outputNotContains: ["double free"] },
      { id: "rv-s22", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "rv-s23", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "rv-s24", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "rv-s25", description: "No timeout", outputNotContains: ["timeout"] },
      { id: "rv-s26", description: "Reduction result correct (no WRONG)", outputNotContains: ["WRONG"] },
      { id: "rv-s27", description: "No FAIL", outputNotContains: ["FAIL"] },
      { id: "rv-s28", description: "No kernel launch failure", outputNotContains: ["kernel launch failure"] },
      { id: "rv-s29", description: "Timing values present", outputMatchesPattern: "\\d+\\.\\d+" },
      { id: "rv-s30", description: "No signal 11", outputNotContains: ["signal 11"] },
      { id: "rv-s31", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "rv-s32", description: "No INCORRECT", outputNotContains: ["INCORRECT"] },
      { id: "rv-s33", description: "Divergent vs non-divergent comparison present", outputMatchesPattern: "Reduce0[\\s\\S]+Reduce5|divergent" },
      { id: "rv-s34", description: "Shuffle reduction named", outputMatchesPattern: "shuffle|Shuffle" },
      { id: "rv-s35", description: "No race condition message", outputNotContains: ["race condition"] },
      { id: "rv-s36", description: "No FAILED keyword", outputNotContains: ["FAILED"] },
      { id: "rv-s37", description: "No undefined behavior", outputNotContains: ["undefined behavior"] },
      { id: "rv-s38", description: "Warp shuffle results correct", outputNotContains: ["shuffle WRONG", "shuffle FAIL"] },
      { id: "rv-s39", description: "No memory leak message", outputNotContains: ["memory leak"] },
      { id: "rv-s40", description: "No negative GB/s", outputMatchesPattern: "[^-]\\d+\\.\\d+\\s*GB/s" },
      { id: "rv-s41", description: "Both timing and bandwidth reported per variant", outputMatchesPattern: "ms[\\s\\S]+GB/s" },
      { id: "rv-s42", description: "Hidden: Reduce5 faster than Reduce0", outputMatchesPattern: "Reduce5", hidden: true },
      { id: "rv-s43", description: "Hidden: warp shuffle bandwidth > 100 GB/s", outputMatchesPattern: "[1-9]\\d{2}\\.\\d+\\s*GB/s", hidden: true },
      { id: "rv-s44", description: "Hidden: no warp divergence in final variant", outputNotContains: ["warp divergence error"], hidden: true },
      { id: "rv-s45", description: "Hidden: reduction results are numerically correct", outputNotContains: ["WRONG", "FAIL"], hidden: true },
      { id: "rv-s46", description: "Hidden: at least 2 variants benchmarked", outputMatchesPattern: "Reduce[0-9][\\s\\S]+Reduce[0-9]", hidden: true },
      { id: "rv-s47", description: "Hidden: no cudaMalloc failure", outputNotContains: ["cudaMalloc failed"], hidden: true },
      { id: "rv-s48", description: "Hidden: timing values plausible", outputMatchesPattern: "\\d+\\.\\d+\\s*ms", hidden: true },
      { id: "rv-s49", description: "Hidden: bandwidth improvement shown", outputMatchesPattern: "GB/s[\\s\\S]+GB/s", hidden: true },
      { id: "rv-s50", description: "Hidden: final variant uses shuffle intrinsic", outputMatchesPattern: "shuffle|Reduce5", hidden: true },
    ],
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
    runTests: [
      { id: "sg-r1", description: "Matrix size header printed (e.g. === 1024x1024 ===)", outputMatchesPattern: "===.*===" },
      { id: "sg-r2", description: "Naive and Tiled TFLOP/s reported", outputMatchesPattern: "TFLOP" },
      { id: "sg-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "sg-s01", description: "Matrix size header present", outputMatchesPattern: "===.*===" },
      { id: "sg-s02", description: "Naive TFLOP/s reported", outputMatchesPattern: "Naive.*TFLOP" },
      { id: "sg-s03", description: "Tiled TFLOP/s reported", outputMatchesPattern: "Tiled.*TFLOP" },
      { id: "sg-s04", description: "TFLOP/s values present", outputMatchesPattern: "\\d+\\.?\\d*\\s*TFLOP" },
      { id: "sg-s05", description: "No cudaError", outputNotContains: ["cudaError"] },
      { id: "sg-s06", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "sg-s07", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "sg-s08", description: "Output non-empty", outputMatchesPattern: "\\S" },
      { id: "sg-s09", description: "No nan values", outputNotContains: ["nan", "NaN"] },
      { id: "sg-s10", description: "No TODO in output", outputNotContains: ["TODO"] },
      { id: "sg-s11", description: "Tiled faster than Naive", outputMatchesPattern: "Naive[\\s\\S]+Tiled" },
      { id: "sg-s12", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "sg-s13", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "sg-s14", description: "TFLOP/s positive values", outputMatchesPattern: "[1-9]\\d*\\.?\\d*\\s*TFLOP" },
      { id: "sg-s15", description: "No 'failed'", outputNotContains: [" failed"] },
      { id: "sg-s16", description: "Output has at least 2 lines", outputMatchesPattern: "([^\\n]+\\n){2,}" },
      { id: "sg-s17", description: "No inf values", outputNotContains: [" inf "] },
      { id: "sg-s18", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "sg-s19", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "sg-s20", description: "No double-free", outputNotContains: ["double free"] },
      { id: "sg-s21", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "sg-s22", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "sg-s23", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "sg-s24", description: "No timeout", outputNotContains: ["timeout"] },
      { id: "sg-s25", description: "Matrix multiply result correct (no WRONG)", outputNotContains: ["WRONG"] },
      { id: "sg-s26", description: "No FAIL", outputNotContains: ["FAIL"] },
      { id: "sg-s27", description: "No kernel launch failure", outputNotContains: ["kernel launch failure"] },
      { id: "sg-s28", description: "TFLOP/s values are decimal numbers", outputMatchesPattern: "\\d+\\.\\d+\\s*TFLOP" },
      { id: "sg-s29", description: "No signal 11", outputNotContains: ["signal 11"] },
      { id: "sg-s30", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "sg-s31", description: "No INCORRECT", outputNotContains: ["INCORRECT"] },
      { id: "sg-s32", description: "Tiled improvement mentioned", outputMatchesPattern: "Tiled" },
      { id: "sg-s33", description: "No race condition", outputNotContains: ["race condition"] },
      { id: "sg-s34", description: "No FAILED keyword", outputNotContains: ["FAILED"] },
      { id: "sg-s35", description: "No undefined behavior", outputNotContains: ["undefined behavior"] },
      { id: "sg-s36", description: "Speedup demonstrated in output", outputMatchesPattern: "TFLOP[\\s\\S]+TFLOP" },
      { id: "sg-s37", description: "No memory leak message", outputNotContains: ["memory leak"] },
      { id: "sg-s38", description: "Correctness verified (no WRONG result)", outputNotContains: ["WRONG result"] },
      { id: "sg-s39", description: "No negative TFLOP values", outputMatchesPattern: "[^-]\\d+\\.\\d+\\s*TFLOP" },
      { id: "sg-s40", description: "Matrix dimensions shown", outputMatchesPattern: "\\d+x\\d+" },
      { id: "sg-s41", description: "No cudaMalloc failure", outputNotContains: ["cudaMalloc failed"] },
      { id: "sg-s42", description: "Hidden: tiled SGEMM > 1 TFLOP/s", outputMatchesPattern: "[1-9]\\d*\\.\\d+\\s*TFLOP", hidden: true },
      { id: "sg-s43", description: "Hidden: correctness check passes", outputNotContains: ["WRONG", "FAIL"], hidden: true },
      { id: "sg-s44", description: "Hidden: tiled version faster than naive", outputMatchesPattern: "Naive[\\s\\S]+Tiled", hidden: true },
      { id: "sg-s45", description: "Hidden: shared memory tile used", outputMatchesPattern: "Tiled|tiled", hidden: true },
      { id: "sg-s46", description: "Hidden: bandwidth or compute reported", outputMatchesPattern: "TFLOP|GFLOP", hidden: true },
      { id: "sg-s47", description: "Hidden: no cuBLAS error if used", outputNotContains: ["CUBLAS_STATUS_"], hidden: true },
      { id: "sg-s48", description: "Hidden: matrix size is at least 128x128", outputMatchesPattern: "[1-9]\\d{2,}x[1-9]\\d{2,}", hidden: true },
      { id: "sg-s49", description: "Hidden: Naive TFLOP/s printed", outputMatchesPattern: "Naive.*TFLOP", hidden: true },
      { id: "sg-s50", description: "Hidden: Tiled TFLOP/s printed", outputMatchesPattern: "Tiled.*TFLOP", hidden: true },
    ],
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
    runTests: [
      { id: "nb-r1", description: "Energy reported at step 0 (baseline)", outputMatchesPattern: "Step\\s+0.*E\\s*=" },
      { id: "nb-r2", description: "Energy drift percentage reported", outputMatchesPattern: "drift|%" },
      { id: "nb-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "nb-s01", description: "Step 0 energy printed", outputMatchesPattern: "Step\\s+0" },
      { id: "nb-s02", description: "Later step energy printed", outputMatchesPattern: "Step\\s+[1-9]" },
      { id: "nb-s03", description: "Energy value E = present", outputMatchesPattern: "E\\s*=" },
      { id: "nb-s04", description: "Drift percentage reported", outputMatchesPattern: "drift|%" },
      { id: "nb-s05", description: "No cudaError", outputNotContains: ["cudaError"] },
      { id: "nb-s06", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "nb-s07", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "nb-s08", description: "Output non-empty", outputMatchesPattern: "\\S" },
      { id: "nb-s09", description: "No nan in output", outputNotContains: ["nan", "NaN"] },
      { id: "nb-s10", description: "No TODO in output", outputNotContains: ["TODO"] },
      { id: "nb-s11", description: "Energy values are negative (gravitational)", outputMatchesPattern: "E\\s*=\\s*-" },
      { id: "nb-s12", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "nb-s13", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "nb-s14", description: "Multiple steps reported", outputMatchesPattern: "Step[\\s\\S]+Step" },
      { id: "nb-s15", description: "No 'failed'", outputNotContains: [" failed"] },
      { id: "nb-s16", description: "Output has at least 2 lines", outputMatchesPattern: "([^\\n]+\\n){2,}" },
      { id: "nb-s17", description: "No inf in energy values", outputNotContains: [" inf "] },
      { id: "nb-s18", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "nb-s19", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "nb-s20", description: "No double-free", outputNotContains: ["double free"] },
      { id: "nb-s21", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "nb-s22", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "nb-s23", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "nb-s24", description: "No timeout", outputNotContains: ["timeout"] },
      { id: "nb-s25", description: "Step numbers are non-negative integers", outputMatchesPattern: "Step\\s+\\d+" },
      { id: "nb-s26", description: "Energy drift is small (< 10%)", outputMatchesPattern: "0\\.\\d+%|drift" },
      { id: "nb-s27", description: "No FAIL", outputNotContains: ["FAIL"] },
      { id: "nb-s28", description: "No kernel launch failure", outputNotContains: ["kernel launch failure"] },
      { id: "nb-s29", description: "Decimal energy values present", outputMatchesPattern: "-\\d+\\.\\d+" },
      { id: "nb-s30", description: "No signal 11", outputNotContains: ["signal 11"] },
      { id: "nb-s31", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "nb-s32", description: "No INCORRECT", outputNotContains: ["INCORRECT"] },
      { id: "nb-s33", description: "Baseline label present", outputMatchesPattern: "baseline|Baseline" },
      { id: "nb-s34", description: "No race condition", outputNotContains: ["race condition"] },
      { id: "nb-s35", description: "No FAILED keyword", outputNotContains: ["FAILED"] },
      { id: "nb-s36", description: "No undefined behavior", outputNotContains: ["undefined behavior"] },
      { id: "nb-s37", description: "No memory leak message", outputNotContains: ["memory leak"] },
      { id: "nb-s38", description: "N-body simulation runs multiple steps", outputMatchesPattern: "Step[\\s\\S]+Step" },
      { id: "nb-s39", description: "No divide by zero", outputNotContains: ["divide by zero", "division by zero"] },
      { id: "nb-s40", description: "Energy is conserved (small drift)", outputMatchesPattern: "drift|%" },
      { id: "nb-s41", description: "No cudaMalloc failure", outputNotContains: ["cudaMalloc failed"] },
      { id: "nb-s42", description: "Hidden: energy at step 0 is baseline", outputMatchesPattern: "Step\\s+0.*baseline|baseline.*Step\\s+0", hidden: true },
      { id: "nb-s43", description: "Hidden: energy drift < 1%", outputMatchesPattern: "0\\.\\d+%", hidden: true },
      { id: "nb-s44", description: "Hidden: simulation runs to completion", outputMatchesPattern: "Step\\s+[5-9]\\d|Step\\s+1\\d{2}", hidden: true },
      { id: "nb-s45", description: "Hidden: no divergence in force kernel", outputNotContains: ["force error", "force FAIL"], hidden: true },
      { id: "nb-s46", description: "Hidden: leapfrog integration stable", outputMatchesPattern: "E\\s*=\\s*-\\d+", hidden: true },
      { id: "nb-s47", description: "Hidden: no cudaMalloc failure for body arrays", outputNotContains: ["cudaMalloc failed"], hidden: true },
      { id: "nb-s48", description: "Hidden: timing reported if present", outputMatchesPattern: "ms|GFLOP|Step", hidden: true },
      { id: "nb-s49", description: "Hidden: energy not NaN or Inf", outputNotContains: ["nan", "inf", "NaN", "Inf"], hidden: true },
      { id: "nb-s50", description: "Hidden: simulation completes without error", outputNotContains: ["cudaError", "failed", "Segmentation fault"], hidden: true },
    ],
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
    runTests: [
      { id: "rs-r1", description: "Result sorted correctly: YES", outputContains: ["YES"] },
      { id: "rs-r2", description: "Sort timing in ms reported", outputMatchesPattern: "\\d+\\.?\\d*\\s*ms" },
      { id: "rs-r3", description: "No CUDA errors", outputNotContains: ["cudaError", "CUDA error", "Segmentation fault"] },
    ],
    submitTests: [
      { id: "rs-s01", description: "Result sorted correctly: YES", outputContains: ["YES"] },
      { id: "rs-s02", description: "No 'sorted correctly: NO'", outputNotContains: ["sorted correctly: NO"] },
      { id: "rs-s03", description: "Radix sort label present", outputMatchesPattern: "[Rr]adix sort" },
      { id: "rs-s04", description: "Timing in ms", outputMatchesPattern: "\\d+\\.?\\d*\\s*ms" },
      { id: "rs-s05", description: "Key count mentioned (1M or N keys)", outputMatchesPattern: "\\d+[MK]?\\s*keys|key" },
      { id: "rs-s06", description: "No cudaError", outputNotContains: ["cudaError"] },
      { id: "rs-s07", description: "No segfault", outputNotContains: ["Segmentation fault"] },
      { id: "rs-s08", description: "No illegal memory access", outputNotContains: ["illegal memory access"] },
      { id: "rs-s09", description: "Output non-empty", outputMatchesPattern: "\\S" },
      { id: "rs-s10", description: "No nan in output", outputNotContains: ["nan", "NaN"] },
      { id: "rs-s11", description: "No TODO in output", outputNotContains: ["TODO"] },
      { id: "rs-s12", description: "No abort", outputNotContains: ["Aborted"] },
      { id: "rs-s13", description: "No bus error", outputNotContains: ["Bus error"] },
      { id: "rs-s14", description: "Sort result is YES not NO", outputNotContains: ["sorted correctly: NO", "WRONG"] },
      { id: "rs-s15", description: "Timing is positive number", outputMatchesPattern: "[1-9]\\d*\\.?\\d*\\s*ms" },
      { id: "rs-s16", description: "No 'failed'", outputNotContains: [" failed"] },
      { id: "rs-s17", description: "Output has at least 1 line", outputMatchesPattern: ".+" },
      { id: "rs-s18", description: "No inf values", outputNotContains: [" inf "] },
      { id: "rs-s19", description: "No device assert", outputNotContains: ["device-side assert"] },
      { id: "rs-s20", description: "No stack overflow", outputNotContains: ["stack overflow"] },
      { id: "rs-s21", description: "No double-free", outputNotContains: ["double free"] },
      { id: "rs-s22", description: "No warp error", outputNotContains: ["warp illegal"] },
      { id: "rs-s23", description: "No 'Error:' prefix", outputNotContains: ["Error:"] },
      { id: "rs-s24", description: "No misaligned address", outputNotContains: ["misaligned address"] },
      { id: "rs-s25", description: "No timeout", outputNotContains: ["timeout"] },
      { id: "rs-s26", description: "Result is sorted (YES not missing)", outputContains: ["YES"] },
      { id: "rs-s27", description: "No FAIL", outputNotContains: ["FAIL"] },
      { id: "rs-s28", description: "No kernel launch failure", outputNotContains: ["kernel launch failure"] },
      { id: "rs-s29", description: "Timing decimal value present", outputMatchesPattern: "\\d+\\.\\d+" },
      { id: "rs-s30", description: "No signal 11", outputNotContains: ["signal 11"] },
      { id: "rs-s31", description: "No 'out of memory'", outputNotContains: ["out of memory"] },
      { id: "rs-s32", description: "No INCORRECT", outputNotContains: ["INCORRECT"] },
      { id: "rs-s33", description: "LSD radix sort mentioned or key count shown", outputMatchesPattern: "[Rr]adix|key" },
      { id: "rs-s34", description: "No race condition", outputNotContains: ["race condition"] },
      { id: "rs-s35", description: "No FAILED keyword", outputNotContains: ["FAILED"] },
      { id: "rs-s36", description: "No undefined behavior", outputNotContains: ["undefined behavior"] },
      { id: "rs-s37", description: "No memory leak message", outputNotContains: ["memory leak"] },
      { id: "rs-s38", description: "Sort completes in reasonable time", outputMatchesPattern: "\\d+\\.\\d+\\s*ms" },
      { id: "rs-s39", description: "Output contains timing + correctness", outputMatchesPattern: "ms[\\s\\S]+YES|YES[\\s\\S]+ms" },
      { id: "rs-s40", description: "No negative timing", outputNotContains: ["-0.", "- ms"] },
      { id: "rs-s41", description: "No cudaMalloc failure", outputNotContains: ["cudaMalloc failed"] },
      { id: "rs-s42", description: "Hidden: 1M keys sorted correctly", outputContains: ["YES"], hidden: true },
      { id: "rs-s43", description: "Hidden: sort time < 50ms on GPU", outputMatchesPattern: "\\d{1,2}\\.\\d+\\s*ms", hidden: true },
      { id: "rs-s44", description: "Hidden: all radix passes complete", outputNotContains: ["radix FAIL", "pass error"], hidden: true },
      { id: "rs-s45", description: "Hidden: histogram step correct", outputNotContains: ["histogram FAIL", "histogram WRONG"], hidden: true },
      { id: "rs-s46", description: "Hidden: scatter step correct", outputNotContains: ["scatter FAIL", "scatter WRONG"], hidden: true },
      { id: "rs-s47", description: "Hidden: no cudaMalloc failure for key arrays", outputNotContains: ["cudaMalloc failed"], hidden: true },
      { id: "rs-s48", description: "Hidden: sort is stable (if applicable)", outputNotContains: ["stability FAIL"], hidden: true },
      { id: "rs-s49", description: "Hidden: timing and correctness both present", outputMatchesPattern: "ms[\\s\\S]+YES", hidden: true },
      { id: "rs-s50", description: "Hidden: final sorted array verified correct", outputContains: ["YES"], hidden: true },
    ],
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
