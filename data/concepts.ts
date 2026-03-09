export interface ConceptData {
  slug: string;
  title: string;
  category: string;
  order: number;
  content: string;
  codeExample?: string;
  relatedProjects: string[];
  relatedConcepts: string[];
}

export const CONCEPTS: ConceptData[] = [
  {
    slug: "gpu-thread-hierarchy",
    title: "GPU Thread Hierarchy",
    category: "Parallelism",
    order: 1,
    relatedProjects: ["hello-cuda", "parallel-scan"],
    relatedConcepts: ["warp-execution", "occupancy"],
    content: `# GPU Thread Hierarchy

CUDA organizes threads into a three-level hierarchy: **threads**, **blocks**, and **grids**.

## Threads
The basic unit of execution. Each thread runs the same kernel code but can access its own index via \`threadIdx\`.

## Blocks
Threads are grouped into **thread blocks** (up to 1024 threads per block). Threads within a block can:
- Communicate via **shared memory**
- Synchronize with \`__syncthreads()\`

## Grid
Blocks are organized into a **grid**. The grid launches when you call a kernel.

## Index Calculation
\`\`\`cuda
int globalIdx = blockIdx.x * blockDim.x + threadIdx.x;
\`\`\`

## Key Rules
- Threads in a block can share memory — threads in different blocks cannot
- Block size should be a multiple of 32 (warp size)
- Maximum threads per block: 1024`,
    codeExample: `__global__ void indexDemo(int *output, int n) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid < n) {
        output[tid] = tid;
    }
}

// Launch: 4 blocks of 256 threads = 1024 total threads
indexDemo<<<4, 256>>>(d_output, 1024);`,
  },
  {
    slug: "global-memory-coalescing",
    title: "Global Memory Coalescing",
    category: "Memory",
    order: 2,
    relatedProjects: ["matrix-transpose", "image-processing-pipeline"],
    relatedConcepts: ["gpu-thread-hierarchy", "shared-memory"],
    content: `# Global Memory Coalescing

Global memory is the largest but slowest GPU memory. Coalesced access patterns are critical for performance.

## What is Coalescing?
When threads in a warp access **consecutive memory addresses**, the hardware combines these into a single (or few) memory transactions. This is **coalesced access**.

## Coalesced vs. Strided

**Coalesced (fast):** Thread \`i\` accesses \`array[i]\`
- 32 threads → 1-4 memory transactions
- ~200-900 GB/s bandwidth utilization

**Strided (slow):** Thread \`i\` accesses \`array[i * stride]\`
- 32 threads → up to 32 separate transactions
- Bandwidth drops dramatically

## Rules for Coalescing
1. Threads in a warp should access a contiguous region of memory
2. Accesses should be aligned to 32, 64, or 128 byte boundaries
3. Avoid random/scattered access patterns

## When to Use Shared Memory
If your algorithm naturally requires non-coalesced access (e.g., column-major access in row-major storage), load data into shared memory in a coalesced pattern first, then access it arbitrarily.`,
    codeExample: `// BAD: Non-coalesced (column access of row-major matrix)
__global__ void columnAccess(float *mat, float *out, int N) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    float sum = 0;
    for (int row = 0; row < N; row++)
        sum += mat[row * N + col]; // stride = N between threads
    out[col] = sum;
}

// GOOD: Coalesced via shared memory staging
__global__ void columnAccessShared(float *mat, float *out, int N) {
    __shared__ float tile[32][32];
    // Load coalesced, then access column from shared mem
    int row = blockIdx.y * 32 + threadIdx.y;
    int col = blockIdx.x * 32 + threadIdx.x;
    if (row < N && col < N) tile[threadIdx.y][threadIdx.x] = mat[row * N + col];
    __syncthreads();
    // Now access tile column (shared mem, no coalescing penalty)
}`,
  },
  {
    slug: "shared-memory",
    title: "Shared Memory and Bank Conflicts",
    category: "Memory",
    order: 3,
    relatedProjects: ["matrix-transpose", "tiled-sgemm"],
    relatedConcepts: ["global-memory-coalescing", "gpu-thread-hierarchy"],
    content: `# Shared Memory and Bank Conflicts

Shared memory is on-chip memory shared between threads in a block. It's ~100x faster than global memory.

## Properties
- Declared with \`__shared__\` keyword
- Scope: thread block lifetime
- Size: typically 48-96 KB per SM (configurable)
- Latency: ~32 cycles vs. ~800 cycles for global memory

## Bank Conflicts
Shared memory is divided into 32 **banks** (one per warp lane). A **bank conflict** occurs when two threads in a warp access different addresses in the same bank simultaneously — the accesses serialize.

### No Conflict
\`tile[threadIdx.x]\` — each thread accesses a different bank ✓

### 2-Way Conflict
\`tile[threadIdx.x * 2]\` — threads 0 and 16 share bank 0, threads 1 and 17 share bank 1, etc.

### Broadcast (No Conflict)
All threads accessing the **same address** triggers a broadcast — no penalty.

## Padding Trick
Add 1 to the row dimension to shift addresses and avoid conflicts:
\`\`\`cuda
__shared__ float tile[32][33]; // +1 padding avoids bank conflicts
\`\`\``,
    codeExample: `#define TILE 32

__global__ void transposeNoBankConflict(float *in, float *out, int N) {
    // Extra column (+1) avoids bank conflicts during column read
    __shared__ float tile[TILE][TILE + 1];

    int x = blockIdx.x * TILE + threadIdx.x;
    int y = blockIdx.y * TILE + threadIdx.y;

    if (x < N && y < N)
        tile[threadIdx.y][threadIdx.x] = in[y * N + x];
    __syncthreads();

    x = blockIdx.y * TILE + threadIdx.x;
    y = blockIdx.x * TILE + threadIdx.y;

    if (x < N && y < N)
        out[y * N + x] = tile[threadIdx.x][threadIdx.y];
}`,
  },
  {
    slug: "warp-execution",
    title: "Warp Execution and Divergence",
    category: "Parallelism",
    order: 4,
    relatedProjects: ["reduction-variants", "parallel-scan"],
    relatedConcepts: ["gpu-thread-hierarchy", "occupancy"],
    content: `# Warp Execution and Divergence

A **warp** is the fundamental scheduling unit on an NVIDIA GPU — 32 threads that execute in lockstep (SIMT: Single Instruction, Multiple Threads).

## SIMT Execution
All 32 threads in a warp execute the same instruction simultaneously. When threads diverge (take different branches), the warp **serializes** — both paths execute, with inactive threads masked out.

## Warp Divergence Example
\`\`\`cuda
if (threadIdx.x < 16) {
    doA(); // Threads 0-15 execute, 16-31 idle
} else {
    doB(); // Threads 16-31 execute, 0-15 idle
}
// Effective throughput: 50% of peak
\`\`\`

## Minimizing Divergence
- Ensure branches are at **warp granularity** (groups of 32)
- Use predication for short conditionals
- Restructure algorithms to avoid per-thread divergence

## Warp-Level Primitives (CUDA 9+)
\`__shfl_sync\`, \`__ballot_sync\`, \`__any_sync\`, \`__all_sync\` allow efficient communication within a warp without shared memory.`,
    codeExample: `// Warp-level reduction using shuffle
__device__ float warpReduceSum(float val) {
    for (int offset = 16; offset > 0; offset >>= 1)
        val += __shfl_down_sync(0xffffffff, val, offset);
    return val; // Thread 0 holds the sum
}

__global__ void reductionKernel(float *input, float *output, int n) {
    float val = (blockIdx.x * blockDim.x + threadIdx.x < n)
                    ? input[blockIdx.x * blockDim.x + threadIdx.x]
                    : 0.0f;
    val = warpReduceSum(val);
    if (threadIdx.x % 32 == 0)
        atomicAdd(output, val);
}`,
  },
  {
    slug: "occupancy",
    title: "Occupancy and Register Pressure",
    category: "Optimization",
    order: 5,
    relatedProjects: ["reduction-variants", "tiled-sgemm"],
    relatedConcepts: ["warp-execution", "shared-memory"],
    content: `# Occupancy and Register Pressure

**Occupancy** is the ratio of active warps to the maximum possible warps on an SM. Higher occupancy helps hide memory latency.

## What Limits Occupancy?
1. **Registers per thread** — each SM has a fixed register file (~65,536 registers)
2. **Shared memory per block** — each SM has limited shared memory
3. **Maximum threads per block** — hardware limit (1024)

## Calculating Occupancy
\`\`\`
warps_per_block = ceil(threads_per_block / 32)
max_blocks = min(
    floor(max_warps_per_sm / warps_per_block),
    floor(register_file_size / (registers_per_thread * threads_per_block)),
    floor(shared_mem_per_sm / shared_mem_per_block)
)
occupancy = max_blocks * warps_per_block / max_warps_per_sm
\`\`\`

## CUDA Occupancy API
\`\`\`cuda
int blockSize, minGridSize;
cudaOccupancyMaxPotentialBlockSize(&minGridSize, &blockSize, myKernel, 0, 0);
\`\`\`

## Register Pressure Tips
- Use \`--maxrregcount=N\` compiler flag to cap registers (may increase spills)
- Reduce live variables across loop iterations
- Use shared memory to reduce per-thread register use`,
    codeExample: `#include <cuda_runtime.h>
#include <stdio.h>

__global__ void myKernel(float *data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) data[i] *= 2.0f;
}

int main() {
    int blockSize, minGridSize;
    cudaOccupancyMaxPotentialBlockSize(
        &minGridSize, &blockSize, myKernel, 0, 0);
    printf("Optimal block size: %d\\n", blockSize);

    int activeBlocks;
    cudaOccupancyMaxActiveBlocksPerMultiprocessor(
        &activeBlocks, myKernel, blockSize, 0);

    cudaDeviceProp prop;
    cudaGetDeviceProperties(&prop, 0);
    float occupancy = (float)(activeBlocks * blockSize / 32) /
                      prop.maxThreadsPerMultiProcessor * 32;
    printf("Theoretical occupancy: %.1f%%\\n", occupancy * 100);
    return 0;
}`,
  },
  {
    slug: "cuda-streams",
    title: "CUDA Streams and Async Execution",
    category: "Parallelism",
    order: 6,
    relatedProjects: ["image-processing-pipeline"],
    relatedConcepts: ["gpu-thread-hierarchy", "occupancy"],
    content: `# CUDA Streams and Async Execution

A **CUDA stream** is a sequence of operations that execute in order on the GPU. Operations in different streams can overlap.

## Default Stream
All CUDA operations without an explicit stream go to the **default stream (stream 0)**, which synchronizes with all other streams.

## Non-Default Streams
\`\`\`cuda
cudaStream_t stream;
cudaStreamCreate(&stream);
kernel<<<grid, block, 0, stream>>>(args);
cudaMemcpyAsync(dst, src, size, kind, stream);
cudaStreamSynchronize(stream);
cudaStreamDestroy(stream);
\`\`\`

## Overlapping Compute and Transfer
With pinned (page-locked) memory and multiple streams:
1. Stream 1: Copy chunk 1 to GPU → Compute chunk 1 → Copy chunk 1 back
2. Stream 2: Copy chunk 2 to GPU (overlaps with stream 1 compute)

This pipeline can approach 2x throughput when compute and transfer are balanced.

## cudaMemcpyAsync
Requires **pinned host memory** allocated with \`cudaMallocHost\` (not \`malloc\`).`,
    codeExample: `cudaStream_t s1, s2;
cudaStreamCreate(&s1);
cudaStreamCreate(&s2);

float *h_data; // Must be pinned!
cudaMallocHost(&h_data, size);

// Overlap: stream1 computes while stream2 transfers
cudaMemcpyAsync(d_buf1, h_data,       half_size, cudaMemcpyHostToDevice, s1);
cudaMemcpyAsync(d_buf2, h_data + n/2, half_size, cudaMemcpyHostToDevice, s2);
kernel<<<grid, block, 0, s1>>>(d_buf1, n/2);
kernel<<<grid, block, 0, s2>>>(d_buf2, n/2);

cudaStreamSynchronize(s1);
cudaStreamSynchronize(s2);
cudaFreeHost(h_data);`,
  },
];

export function getConceptBySlug(slug: string): ConceptData | undefined {
  return CONCEPTS.find((c) => c.slug === slug);
}

export function getConceptsByCategory(category: string): ConceptData[] {
  return CONCEPTS.filter((c) => c.category === category).sort(
    (a, b) => a.order - b.order
  );
}

export function searchConcepts(query: string): ConceptData[] {
  const q = query.toLowerCase();
  return CONCEPTS.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.content.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
  );
}
