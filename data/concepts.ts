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
  // ─── 1. Thread Hierarchy ─────────────────────────────────────────────────
  {
    slug: "gpu-thread-hierarchy",
    title: "GPU Thread Hierarchy",
    category: "Parallelism",
    order: 1,
    relatedProjects: ["hello-cuda", "vector-add", "parallel-scan"],
    relatedConcepts: ["warp-execution", "occupancy", "cuda-memory-hierarchy"],
    content: `# GPU Thread Hierarchy

CUDA organizes parallel work into a three-level hierarchy: **threads → blocks → grids**. Every kernel launch defines how many blocks and how many threads per block to use.

## Threads

The basic unit of execution. Each thread runs the same kernel code but operates on different data identified by its built-in index variables:

- \`threadIdx.x / .y / .z\` — thread's position within its block (3D)
- \`blockIdx.x / .y / .z\` — block's position within the grid (3D)
- \`blockDim.x / .y / .z\` — dimensions of the block (threads per dimension)
- \`gridDim.x / .y / .z\` — dimensions of the grid (blocks per dimension)
- \`warpSize\` — always **32** on all current NVIDIA GPUs

## Thread Blocks

Threads are grouped into **thread blocks**. Threads within a block can:

- Communicate via **shared memory** (on-chip SRAM, ~100× faster than global memory)
- Synchronize with \`__syncthreads()\` — a barrier all threads in the block must reach before any proceed

Thread blocks execute **independently** — in any order, in parallel or serial. This independence is what lets CUDA programs scale from small GPUs to large ones without code changes.

**Limits per block:**
- Maximum **1024 threads** total (any shape: 256×1×1, 32×32×1, 8×8×16, …)
- Block dimensions should be multiples of 32 (the warp size) to avoid idle threads in the last warp

## Grids

Blocks are organized into a **grid**. Grids and blocks can be 1D, 2D, or 3D — use \`dim3\` to specify:

\`\`\`c
dim3 threadsPerBlock(16, 16);                  // 256 threads per block, 2D layout
dim3 numBlocks((N+15)/16, (N+15)/16);          // ceil(N/16) × ceil(N/16) blocks
MatAdd<<<numBlocks, threadsPerBlock>>>(A, B, C);
\`\`\`

## Global Thread Index

For 1D kernels:
\`\`\`
i = blockIdx.x * blockDim.x + threadIdx.x
\`\`\`

For 2D kernels (e.g., image processing):
\`\`\`
x = blockIdx.x * blockDim.x + threadIdx.x   // column
y = blockIdx.y * blockDim.y + threadIdx.y   // row
\`\`\`

## Thread Block Clusters (Compute Capability 9.0+)

Hopper (H100) introduced a fourth level: **clusters**. Multiple blocks in a cluster are co-scheduled on the same GPU Processing Cluster (GPC) and can share data via **Distributed Shared Memory** without going through global memory. Maximum portable cluster size: **8 blocks**.

\`\`\`c
// Declare a 2-block cluster at compile time
__global__ void __cluster_dims__(2, 1, 1) clusterKernel(float *in, float *out) {
    // blocks in the same cluster can access each other's shared memory
}
\`\`\`

## Key Rules

| Rule | Why |
|---|---|
| Blocks execute independently | Enables automatic scaling across GPU sizes |
| Only intra-block sync (\`__syncthreads\`) is cheap | Cross-block sync requires global memory + extra kernels |
| Block size should be a multiple of 32 | Avoids partially-filled warps with idle threads |
| Maximum 1024 threads per block | Hard hardware limit on all current GPUs |`,
    codeExample: `// 2D kernel: each thread handles one element of an N×N matrix
__global__ void matAdd(const float *A, const float *B, float *C, int N) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;  // column
    int y = blockIdx.y * blockDim.y + threadIdx.y;  // row
    if (x < N && y < N) {
        int i = y * N + x;
        C[i] = A[i] + B[i];
    }
}

int main() {
    const int N = 1024;
    dim3 block(16, 16);                         // 256 threads/block
    dim3 grid((N + 15) / 16, (N + 15) / 16);   // 64×64 = 4096 blocks
    matAdd<<<grid, block>>>(d_A, d_B, d_C, N);
    cudaDeviceSynchronize();
}`,
  },

  // ─── 2. Memory Hierarchy ─────────────────────────────────────────────────
  {
    slug: "cuda-memory-hierarchy",
    title: "CUDA Memory Hierarchy",
    category: "Memory",
    order: 2,
    relatedProjects: ["vector-add", "hello-cuda"],
    relatedConcepts: ["global-memory-coalescing", "shared-memory", "occupancy"],
    content: `# CUDA Memory Hierarchy

CUDA exposes several distinct memory spaces with different scope, lifetime, latency, and size. Choosing the right memory for each use case is the single most impactful optimization lever available.

## Overview

| Memory | Scope | Lifetime | Latency | Size (typical) |
|---|---|---|---|---|
| Registers | Per-thread | Kernel | ~1 cycle | ~256 KB/SM |
| Local memory | Per-thread | Kernel | ~800 cycles | Limited by DRAM |
| Shared memory | Per-block | Block | ~32 cycles | 48–96 KB/SM |
| L1 / Texture cache | Per-SM | — | ~32 cycles | 32–128 KB/SM |
| L2 cache | Device | — | ~200 cycles | 4–40 MB |
| Global memory | All threads | Application | ~600–800 cycles | GBs (DRAM) |
| Constant memory | All threads (read-only) | Application | ~1 cycle (broadcast) | 64 KB |
| Texture memory | All threads (read-only) | Application | ~32 cycles (cached) | Up to DRAM size |

## Registers

The fastest storage — compiler assigns them automatically. Each SM has a fixed register file (~65,536 × 32-bit registers on Ampere/Hopper) shared among all concurrently active threads.

**Register spilling:** when a kernel needs more registers than the hardware limit per thread, the overflow spills to **local memory** — which lives in global DRAM and has ~800-cycle latency. Avoid spilling:

\`\`\`
nvcc --ptxas-options=-v kernel.cu   # see: registers per thread, spilled stores/loads
nvcc -maxrregcount=32 kernel.cu     # hard cap (may cause intentional spilling)
\`\`\`

## Shared Memory

On-chip SRAM declared with \`__shared__\`. Latency ~32 cycles vs ~800 for global memory. Shared among all threads in a block, allocated per-block.

On Ampere, each SM has 192 KB of on-chip SRAM split between L1 cache and shared memory (configurable):

\`\`\`c
cudaFuncSetAttribute(myKernel,
    cudaFuncAttributePreferredSharedMemoryCarveout, 50); // 50% shared, 50% L1
\`\`\`

More shared memory per block → fewer concurrent blocks per SM → lower occupancy. Find the right balance.

## Global Memory

The main GPU DRAM — accessible from all threads, persists across kernel launches. Managed with \`cudaMalloc\` / \`cudaFree\`.

Bandwidth is everything: A100 offers ~2 TB/s, H100 HBM3 ~3.35 TB/s. Achieving peak requires **coalesced access** (consecutive threads accessing consecutive addresses).

## Constant Memory

64 KB, read-only, with a dedicated cache. When all threads in a warp read the **same address**, it broadcasts in a single cycle — ideal for kernel parameters, filter weights, and lookup tables:

\`\`\`c
__constant__ float c_kernel[9];  // declared at file scope
cudaMemcpyToSymbol(c_kernel, h_kernel, 9 * sizeof(float));
\`\`\`

## Texture Memory

Cached through the texture cache with 2D spatial locality. Good for image processing stencils where you access 2D neighborhoods. Supports hardware bilinear interpolation and boundary clamping.

## Unified Memory (\`cudaMallocManaged\`)

Single address space accessible from both host and device. CUDA migrates pages automatically on demand:

\`\`\`c
float *data;
cudaMallocManaged(&data, N * sizeof(float));
data[0] = 1.0f;                               // CPU access
myKernel<<<grid, block>>>(data, N);           // GPU access
cudaDeviceSynchronize();
printf("%f\\n", data[0]);                      // CPU reads GPU result
cudaFree(data);
\`\`\`

Supports **oversubscription** on Pascal+ GPUs (device can address more memory than physically present via page faulting).

## Pinned (Page-Locked) Host Memory

Regular \`malloc\` allocates pageable memory. PCIe DMA transfers require pinned memory — if you use \`malloc\`, CUDA must internally copy to a pinned staging buffer first (halving effective transfer bandwidth). Use \`cudaMallocHost\` for any buffer you transfer repeatedly:

\`\`\`c
float *h_buf;
cudaMallocHost(&h_buf, N * sizeof(float));   // pinned — DMA can access directly
// Required for cudaMemcpyAsync
cudaFreeHost(h_buf);
\`\`\``,
    codeExample: `// Using all major memory spaces in one kernel
__constant__ float c_scale;                    // constant memory (file scope)

__global__ void memDemoKernel(
    const float * __restrict__ g_in,           // global memory
    float *g_out, int n)
{
    __shared__ float s_tile[256];              // shared memory

    int tid = threadIdx.x;
    int gid = blockIdx.x * blockDim.x + tid;

    // Coalesced load from global → shared memory
    s_tile[tid] = (gid < n) ? g_in[gid] : 0.f;
    __syncthreads();

    // Compute using a register and constant memory
    float reg = s_tile[tid] * c_scale;         // register × constant

    if (gid < n) g_out[gid] = reg;
}

int main() {
    // Copy to constant memory
    float scale = 2.0f;
    cudaMemcpyToSymbol(c_scale, &scale, sizeof(float));

    // Use pinned host memory for fast transfers
    float *h_data;
    cudaMallocHost(&h_data, N * sizeof(float));
    // ... fill h_data, cudaMemcpy, launch kernel ...
    cudaFreeHost(h_data);
}`,
  },

  // ─── 3. Global Memory Coalescing ─────────────────────────────────────────
  {
    slug: "global-memory-coalescing",
    title: "Global Memory Coalescing",
    category: "Memory",
    order: 3,
    relatedProjects: ["matrix-transpose", "image-processing-pipeline", "vector-add"],
    relatedConcepts: ["cuda-memory-hierarchy", "shared-memory", "warp-execution"],
    content: `# Global Memory Coalescing

Global memory (device DRAM) is served in **128-byte cache line transactions**. Whether a warp of 32 threads consumes 1 transaction or 32 depends entirely on the access pattern.

## How Transactions Work

When a warp issues a load or store:

1. The hardware collects all 32 thread addresses
2. It groups them into 128-byte aligned cache line segments
3. One memory transaction is issued per unique segment required

**Best case — fully coalesced:**
32 threads × 4-byte float = 128 bytes, all within one 128-byte aligned segment → **1 transaction**, peak bandwidth (~1–3 TB/s)

**Worst case — fully divergent:**
32 threads each touch a different 128-byte cache line → **32 transactions**, ~3% of peak bandwidth

## Access Pattern Impact

| Pattern | Transactions | Bandwidth efficiency |
|---|---|---|
| Stride-1: \`array[i]\` | 1 | ~100% |
| Stride-2: \`array[2*i]\` | 2 | ~50% |
| Stride-4: \`array[4*i]\` | 4 | ~25% |
| Stride-32: \`array[32*i]\` | 32 | ~3% |
| Random | up to 32 | ~3% |

## Alignment

\`cudaMalloc\` guarantees 256-byte aligned base pointers. Misaligned accesses can add extra transactions even for stride-1 patterns. Use \`__align__(16)\` for structs in device memory.

## The Column-Access Problem

Row-major storage: \`A[row][col] = A[row * N + col]\`

- **Row access** — thread \`i\` reads \`A[row * N + i]\`: consecutive threads touch consecutive addresses → **coalesced ✓**
- **Column access** — thread \`i\` reads \`A[i * N + col]\`: consecutive threads are \`N\` elements apart → **non-coalesced ✗**

Matrix transpose is the canonical example: one direction of access is always non-coalesced unless you use shared memory as a staging tile.

## The Shared Memory Fix

Standard pattern for correcting non-coalesced access:

1. **Coalesced read** from global memory → shared memory tile
2. **\`__syncthreads()\`**
3. Read from shared memory in any order (no coalescing penalty)
4. **Coalesced write** from shared memory → global memory

This turns one non-coalesced pass into two coalesced passes — net win once the tile has enough reuse.

## The \`__restrict__\` Qualifier

Tells the compiler two pointers don't alias, enabling better instruction scheduling and load/store optimization:

\`\`\`c
__global__ void scale(float * __restrict__ out,
                      const float * __restrict__ in, float s, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) out[i] = in[i] * s;
}
\`\`\`

## Measuring Bandwidth

\`\`\`
effective_bandwidth (GB/s) = bytes_transferred / time_s / 1e9
\`\`\`

For a simple copy kernel (1 read + 1 write per element):
\`\`\`c
float ms; cudaEventElapsedTime(&ms, t0, t1);
float bw = 2.0f * N * sizeof(float) / ms / 1e6f;  // GB/s
printf("%.1f GB/s (peak: %.1f GB/s)\\n", bw, peakBandwidth);
\`\`\``,
    codeExample: `#define N    1024
#define TILE 32

// SLOW: non-coalesced — consecutive threads are N elements apart
__global__ void colSumNaive(const float *A, float *out, int n) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    if (col >= n) return;
    float sum = 0.f;
    for (int row = 0; row < n; row++)
        sum += A[row * n + col];  // stride-N access: 1 transaction per thread
    out[col] = sum;
}

// FAST: coalesced via shared memory staging
__global__ void colSumShared(const float *A, float *out, int n) {
    __shared__ float tile[TILE][TILE];

    int col = blockIdx.x * TILE + threadIdx.x;
    int row = blockIdx.y * TILE + threadIdx.y;

    // Coalesced read: all threads in a row access consecutive columns
    if (row < n && col < n)
        tile[threadIdx.y][threadIdx.x] = A[row * n + col];
    __syncthreads();

    // Now accumulate from shared memory (fast, no coalescing requirement)
    if (blockIdx.y == 0 && col < n) {
        float sum = 0.f;
        for (int k = 0; k < TILE; k++) sum += tile[k][threadIdx.x];
        atomicAdd(&out[col], sum);
    }
}`,
  },

  // ─── 4. Shared Memory & Bank Conflicts ───────────────────────────────────
  {
    slug: "shared-memory",
    title: "Shared Memory and Bank Conflicts",
    category: "Memory",
    order: 4,
    relatedProjects: ["matrix-transpose", "tiled-sgemm", "histogram"],
    relatedConcepts: ["global-memory-coalescing", "cuda-memory-hierarchy", "warp-execution"],
    content: `# Shared Memory and Bank Conflicts

Shared memory is on-chip SRAM with ~32-cycle latency vs ~800 cycles for global DRAM. It is the primary tool for data reuse within a thread block and for staging non-coalesced global memory accesses.

## Declaring Shared Memory

**Static** (size known at compile time):
\`\`\`c
__shared__ float tile[32][32];
\`\`\`

**Dynamic** (size passed at launch):
\`\`\`c
extern __shared__ float s[];
myKernel<<<grid, block, sharedBytes>>>(args);
\`\`\`

## Memory Banks

Shared memory is physically organized as **32 banks**, each 4 bytes wide. Successive 4-byte words map to successive banks cyclically:

\`\`\`
bank(address) = (address / 4) % 32
\`\`\`

### Conflict Rules

| Access pattern | Result |
|---|---|
| 32 threads → 32 different banks (any permutation) | No conflict — 1 cycle |
| Multiple threads → same address | Broadcast — no conflict, 1 cycle |
| N threads → different addresses in same bank | N-way conflict — N cycles (serialized) |

## Common Bank Conflict Patterns

**Stride-1 — no conflict:**
\`\`\`c
tile[threadIdx.x]        // thread i → bank i → all 32 banks, no conflict
\`\`\`

**Stride-2 — 2-way conflict:**
\`\`\`c
tile[threadIdx.x * 2]    // thread 0 → bank 0, thread 16 → bank 0 (conflict)
\`\`\`

**Stride-32 — 32-way conflict:**
\`\`\`c
tile[threadIdx.x * 32]   // all 32 threads → bank 0 at different addresses
\`\`\`

## The Padding Fix

Matrix transpose produces 32-way conflicts when reading \`tile[threadIdx.x][threadIdx.y]\`: all 32 elements land in the same bank (one per column).

**Fix: pad the inner dimension by 1:**
\`\`\`c
__shared__ float tile[32][32 + 1];   // +1 offsets each row's bank assignments
\`\`\`

With padding, row \`r\` starts at byte offset \`r * 33 * 4\`. Element \`[r][c]\` maps to bank \`(r * 33 + c) % 32\` — no two rows' column \`c\` align to the same bank.

**Cost:** 32 × 1 × 4 = 128 bytes of wasted memory per tile — negligible.

## Shared Memory Capacity

On Ampere (A100), each SM has **192 KB** of on-chip SRAM, configurable as shared memory / L1 cache. Default split: 100 KB shared / 28 KB L1 (varies by architecture).

You can request more shared memory per block:
\`\`\`c
cudaFuncSetAttribute(myKernel,
    cudaFuncAttributeMaxDynamicSharedMemorySize, 98304);  // 96 KB
\`\`\`

More shared memory per block reduces how many blocks fit simultaneously on an SM (**occupancy tradeoff**).

## When to Use Shared Memory

**Use it when:**
- The same data is read multiple times within a block (amortize global memory latency)
- Global memory access is non-coalesced (stage the data in shared memory with coalesced loads, then access arbitrarily)
- Implementing reductions, scans, or other intra-block communication

**Skip it when:**
- Data is accessed exactly once (L2 cache already helps here)
- The algorithm naturally has coalesced global memory access with no reuse`,
    codeExample: `// Bank-conflict-free matrix transpose: +1 padding eliminates 32-way conflicts
#define TILE 32

__global__ void transposeNoBankConflict(
    const float * __restrict__ in,
    float * __restrict__ out, int N)
{
    // +1 padding shifts each row's bank offset, breaking the 32-way alignment
    __shared__ float tile[TILE][TILE + 1];

    int x = blockIdx.x * TILE + threadIdx.x;
    int y = blockIdx.y * TILE + threadIdx.y;

    // Coalesced read: consecutive threads read consecutive x values
    if (x < N && y < N)
        tile[threadIdx.y][threadIdx.x] = in[y * N + x];
    __syncthreads();

    // Transposed output coordinates
    int ox = blockIdx.y * TILE + threadIdx.x;
    int oy = blockIdx.x * TILE + threadIdx.y;

    // Coalesced write; tile access tile[threadIdx.x][threadIdx.y]
    // is conflict-free due to the +1 padding
    if (ox < N && oy < N)
        out[oy * N + ox] = tile[threadIdx.x][threadIdx.y];
}`,
  },

  // ─── 5. Warp Execution & Divergence ──────────────────────────────────────
  {
    slug: "warp-execution",
    title: "Warp Execution and Divergence",
    category: "Parallelism",
    order: 5,
    relatedProjects: ["reduction-variants", "parallel-scan"],
    relatedConcepts: ["gpu-thread-hierarchy", "occupancy", "cooperative-groups"],
    content: `# Warp Execution and Divergence

A **warp** is 32 threads that the GPU schedules and executes as a single unit. Understanding warp behavior is essential for reasoning about performance.

## SIMT: Single Instruction, Multiple Threads

Every SM executes instructions in warp granularity using the **SIMT** (Single Instruction, Multiple Thread) model:

- All 32 threads in a warp execute the **same instruction** in the **same clock cycle**
- Each thread has its own registers and produces different results (different data)
- A block of 256 threads is divided into **8 warps** (warps 0–7, threads 0–31, 32–63, …)

## Warp Divergence

When threads in a warp take **different branches**, hardware uses **predication** — both paths execute sequentially with inactive threads masked off:

\`\`\`c
// 50% efficiency: half the warp is idle in each branch
if (threadIdx.x < 16) {
    doA();   // threads 0-15 active, 16-31 idle
} else {
    doB();   // threads 16-31 active, 0-15 idle
}
\`\`\`

Each additional divergent path multiplies the cycles consumed. A branch taken by all or no threads in a warp has zero divergence cost.

## Minimizing Divergence

**Warp-aligned conditions** (no divergence cost):
\`\`\`c
// Safe: condition is uniform for all 32 threads in a warp
if (blockIdx.x * blockDim.x < n) { ... }
\`\`\`

**Bounds guard as early return** (only the last partial warp diverges):
\`\`\`c
int i = blockIdx.x * blockDim.x + threadIdx.x;
if (i >= n) return;  // minimal divergence: only the last block's last warp
\`\`\`

## Zero-Overhead Context Switching

When a warp stalls on a global memory load (~800 cycles), the scheduler **immediately** switches to another ready warp — zero overhead because all warp state lives in the register file (no save/restore). This is how GPUs hide memory latency through massive thread parallelism.

A stall of 800 cycles is hidden completely if there are enough other active warps to fill the time. This is the motivation for high **occupancy**.

## Warp-Level Primitives (CUDA 9+)

Threads exchange values **within a warp without shared memory** using shuffle instructions:

| Primitive | Effect |
|---|---|
| \`__shfl_sync(mask, val, srcLane)\` | All threads receive value from \`srcLane\` |
| \`__shfl_down_sync(mask, val, delta)\` | Thread \`i\` receives value from thread \`i+delta\` |
| \`__shfl_up_sync(mask, val, delta)\` | Thread \`i\` receives value from thread \`i-delta\` |
| \`__shfl_xor_sync(mask, val, laneMask)\` | Butterfly exchange by XOR of lane IDs |
| \`__ballot_sync(mask, pred)\` | 32-bit mask: bit \`i\` set if thread \`i\`'s \`pred\` is true |
| \`__any_sync(mask, pred)\` | True if any thread in warp satisfies \`pred\` |
| \`__all_sync(mask, pred)\` | True if all threads satisfy \`pred\` |

The first argument (\`mask\`) specifies participating threads. Use \`0xffffffff\` for full-warp participation.

## Warp Reduce in 5 Instructions

A full 32-way reduction using shuffles — no shared memory, no \`__syncthreads()\`:

\`\`\`c
float warpReduceSum(float val) {
    val += __shfl_down_sync(0xffffffff, val, 16);
    val += __shfl_down_sync(0xffffffff, val,  8);
    val += __shfl_down_sync(0xffffffff, val,  4);
    val += __shfl_down_sync(0xffffffff, val,  2);
    val += __shfl_down_sync(0xffffffff, val,  1);
    return val;  // lane 0 holds the total
}
\`\`\``,
    codeExample: `// Full block reduction using warp shuffles + shared memory
// No __syncthreads() inside the warp reduce phase

__device__ float warpReduceSum(float val) {
    val += __shfl_down_sync(0xffffffff, val, 16);
    val += __shfl_down_sync(0xffffffff, val,  8);
    val += __shfl_down_sync(0xffffffff, val,  4);
    val += __shfl_down_sync(0xffffffff, val,  2);
    val += __shfl_down_sync(0xffffffff, val,  1);
    return val;
}

__global__ void blockSum(const float *in, float *out, int n) {
    __shared__ float warpSums[32];  // max 32 warps per block

    int gid    = blockIdx.x * blockDim.x + threadIdx.x;
    int lane   = threadIdx.x % 32;   // lane within warp
    int warpId = threadIdx.x / 32;   // which warp in block

    float val = (gid < n) ? in[gid] : 0.f;

    // Phase 1: reduce within each warp (no shared memory needed)
    val = warpReduceSum(val);

    // Phase 2: lane 0 of each warp writes partial sum to shared memory
    if (lane == 0) warpSums[warpId] = val;
    __syncthreads();

    // Phase 3: first warp reduces all warp sums
    if (warpId == 0) {
        int numWarps = (blockDim.x + 31) / 32;
        val = (lane < numWarps) ? warpSums[lane] : 0.f;
        val = warpReduceSum(val);
        if (lane == 0) atomicAdd(out, val);
    }
}`,
  },

  // ─── 6. Occupancy ────────────────────────────────────────────────────────
  {
    slug: "occupancy",
    title: "Occupancy and Latency Hiding",
    category: "Optimization",
    order: 6,
    relatedProjects: ["reduction-variants", "tiled-sgemm"],
    relatedConcepts: ["warp-execution", "shared-memory", "cuda-memory-hierarchy"],
    content: `# Occupancy and Latency Hiding

**Occupancy** is the ratio of active warps to the maximum number of warps an SM can support. It determines how effectively the GPU can hide memory latency.

## Why Occupancy Matters

Global memory accesses take ~800 cycles. During those cycles the warp stalls; the warp scheduler switches to another ready warp at **zero cost** (all state lives in the register file). The more active warps, the more latency can be hidden.

**Rule of thumb:** 4–8+ active warps per SM are needed to effectively hide global memory latency. On Ampere, the max is **48 warps per SM** (1,536 threads).

## Three Resource Limits

Whichever resource runs out first determines maximum occupancy:

### 1. Registers per Thread

Each SM has ~65,536 × 32-bit registers shared across all active threads. If a kernel uses 64 registers/thread with 256 threads/block:

\`\`\`
registers per block = 64 × 256 = 16,384
max blocks per SM   = floor(65,536 / 16,384) = 4
active warps        = 4 × (256/32) = 32
occupancy           = 32 / 48 = 67%
\`\`\`

Check register usage:
\`\`\`
nvcc --ptxas-options=-v kernel.cu
# → registers per thread = N, spills = M
\`\`\`

### 2. Shared Memory per Block

If each SM has 96 KB and a block uses 32 KB, only 3 blocks fit (regardless of thread count).

### 3. Hardware Block/Thread Limits

- Max **32 blocks** per SM (Ampere)
- Max **48 warps** (1,536 threads) per SM (Ampere)
- Max **1,024 threads** per block

## CUDA Occupancy API

\`\`\`c
int blockSize, minGridSize;

// Find the block size that maximizes occupancy for your kernel
cudaOccupancyMaxPotentialBlockSize(
    &minGridSize, &blockSize,
    myKernel,
    0,   // dynamic shared memory per block (bytes)
    0    // max block size hint (0 = no limit)
);

// Query how many blocks actually fit per SM
int activeBlocks;
cudaOccupancyMaxActiveBlocksPerMultiprocessor(
    &activeBlocks, myKernel, blockSize, 0);

cudaDeviceProp prop;
cudaGetDeviceProperties(&prop, 0);
float occ = (float)(activeBlocks * blockSize)
          / prop.maxThreadsPerMultiProcessor;
printf("Occupancy: %.1f%%\\n", occ * 100);
\`\`\`

## Occupancy vs. Performance

**Higher occupancy ≠ higher performance.** A kernel at 50% occupancy that does lots of compute per memory access can outperform a 100% occupancy kernel.

The goal is **enough** warps to hide latency, not maximizing occupancy:
- **Memory-bound:** increasing occupancy helps (more warps = better latency hiding)
- **Compute-bound:** occupancy doesn't help; reduce instruction count instead

Profile with Nsight Compute to distinguish these cases.

## \`__launch_bounds__\` Hint

Tell the compiler the maximum block size and desired minimum blocks per SM. The compiler uses this to allocate registers more aggressively:

\`\`\`c
// At most 256 threads/block, target at least 4 blocks/SM
__global__ void __launch_bounds__(256, 4) myKernel(float *data, int n) { ... }
\`\`\``,
    codeExample: `#include <cuda_runtime.h>
#include <stdio.h>

// __launch_bounds__ guides the compiler's register allocation
__global__ void __launch_bounds__(256, 4) scaleKernel(
    float * __restrict__ out,
    const float * __restrict__ in,
    float scale, int n)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) out[i] = in[i] * scale;
}

int main() {
    // Let CUDA find the optimal block size for occupancy
    int blockSize, minGridSize;
    cudaOccupancyMaxPotentialBlockSize(
        &minGridSize, &blockSize, scaleKernel, 0, 0);

    const int N = 1 << 24;
    int gridSize = (N + blockSize - 1) / blockSize;
    printf("Grid: %d blocks × %d threads\\n", gridSize, blockSize);

    // Measure theoretical occupancy
    int activeBlocks;
    cudaOccupancyMaxActiveBlocksPerMultiprocessor(
        &activeBlocks, scaleKernel, blockSize, 0);

    cudaDeviceProp prop;
    cudaGetDeviceProperties(&prop, 0);
    float occ = (float)(activeBlocks * blockSize)
              / prop.maxThreadsPerMultiProcessor;
    printf("Occupancy: %.1f%%\\n", occ * 100);

    scaleKernel<<<gridSize, blockSize>>>(d_out, d_in, 2.0f, N);
    cudaDeviceSynchronize();
}`,
  },

  // ─── 7. CUDA Streams ─────────────────────────────────────────────────────
  {
    slug: "cuda-streams",
    title: "CUDA Streams and Async Execution",
    category: "Parallelism",
    order: 7,
    relatedProjects: ["image-processing-pipeline"],
    relatedConcepts: ["gpu-thread-hierarchy", "occupancy", "cooperative-groups"],
    content: `# CUDA Streams and Async Execution

A **CUDA stream** is an ordered queue of GPU operations (kernel launches, memory copies, events) that execute **in order**. Operations in **different streams** may overlap.

## The Default Stream

All CUDA calls without an explicit stream use the **null stream** (stream 0). It is **synchronizing**: it waits for all preceding operations in all other streams, and all other streams wait for it. Safe for simple programs; prevents all overlap.

## Creating and Using Streams

\`\`\`c
cudaStream_t s;
cudaStreamCreate(&s);

kernel<<<grid, block, 0, s>>>(args);                          // kernel in stream s
cudaMemcpyAsync(dst, src, bytes, cudaMemcpyHostToDevice, s);  // async copy in s
cudaStreamSynchronize(s);   // host waits for s to finish
cudaStreamDestroy(s);
\`\`\`

## Three Types of Overlap

Modern GPUs have independent **copy engines** (DMA units) separate from the compute engines (SMs):

| Overlap Type | Requirement |
|---|---|
| Concurrent kernel execution | Multiple non-dependent kernels in different streams |
| Kernel + H2D transfer | Pinned host memory + separate stream from kernel |
| H2D + D2H transfer simultaneously | GPU with separate H2D and D2H DMA engines |

**Critical:** async memory transfers require **pinned (page-locked) host memory** allocated with \`cudaMallocHost\`. Regular \`malloc\` memory cannot be DMA'd directly.

## Pipelined Processing (2-Stream Pattern)

Classic pattern for processing a large dataset in chunks — approaches 2× throughput when compute ≈ transfer time:

\`\`\`
Time →
Stream A: [H2D chunk 0]──[compute 0]──[D2H chunk 0]
Stream B:           [H2D chunk 1]──[compute 1]──[D2H chunk 1]
                               [H2D chunk 2]──...
\`\`\`

## Cross-Stream Synchronization with Events

Events let you express fine-grained dependencies without stalling the entire device:

\`\`\`c
cudaEvent_t e;
cudaEventCreate(&e);

kernelA<<<grid, block, 0, streamA>>>(d_buf);
cudaEventRecord(e, streamA);          // record when A finishes

cudaStreamWaitEvent(streamB, e, 0);  // B waits for A's event
kernelB<<<grid, block, 0, streamB>>>(d_buf);  // uses A's output

cudaEventDestroy(e);
\`\`\`

## Synchronization API Reference

| Call | Blocks until… |
|---|---|
| \`cudaDeviceSynchronize()\` | All device operations complete |
| \`cudaStreamSynchronize(s)\` | All operations in stream \`s\` complete |
| \`cudaEventSynchronize(e)\` | Event \`e\` has been recorded |
| \`cudaStreamWaitEvent(s, e)\` | GPU: stream \`s\` waits for event \`e\` (no CPU block) |

Prefer stream/event sync over \`cudaDeviceSynchronize\` to avoid stalling unrelated work.

## CUDA Graphs (CUDA 10+)

For workloads that repeat the same kernel sequence many times, **CUDA Graphs** eliminate per-iteration CPU launch overhead:

\`\`\`c
cudaGraph_t graph;
cudaGraphExec_t instance;

// Capture the operation sequence once
cudaStreamBeginCapture(stream, cudaStreamCaptureModeGlobal);
kernelA<<<grid, block, 0, stream>>>(args);
kernelB<<<grid, block, 0, stream>>>(args);
cudaStreamEndCapture(stream, &graph);

// Instantiate once
cudaGraphInstantiate(&instance, graph, 0);

// Launch 1000 times — ~10× less CPU overhead than re-launching kernels
for (int i = 0; i < 1000; i++)
    cudaGraphLaunch(instance, stream);
cudaStreamSynchronize(stream);

cudaGraphExecDestroy(instance);
cudaGraphDestroy(graph);
\`\`\``,
    codeExample: `// Two-stream pipeline: overlap H2D copies with kernel computation
#include <cuda_runtime.h>

__global__ void processChunk(float *d, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) d[i] = d[i] * 2.0f + 1.0f;
}

int main() {
    const int N       = 1 << 22;
    const int CHUNKS  = 4;
    const int CHUNK_N = N / CHUNKS;
    const size_t BYTES = CHUNK_N * sizeof(float);

    // Pinned memory is required for async DMA transfers
    float *h_data;
    cudaMallocHost(&h_data, N * sizeof(float));
    for (int i = 0; i < N; i++) h_data[i] = (float)i;

    float *d_buf[2];
    cudaMalloc(&d_buf[0], BYTES);
    cudaMalloc(&d_buf[1], BYTES);

    cudaStream_t streams[2];
    cudaStreamCreate(&streams[0]);
    cudaStreamCreate(&streams[1]);

    // Ping-pong between two streams: stream 0 processes while stream 1 copies
    for (int c = 0; c < CHUNKS; c++) {
        int s = c % 2;
        float *h = h_data + c * CHUNK_N;

        // H2D: copy next chunk to device
        cudaMemcpyAsync(d_buf[s], h, BYTES, cudaMemcpyHostToDevice, streams[s]);

        // Compute: overlaps with H2D of other stream
        int tpb = 256, blocks = (CHUNK_N + tpb - 1) / tpb;
        processChunk<<<blocks, tpb, 0, streams[s]>>>(d_buf[s], CHUNK_N);

        // D2H: copy result back
        cudaMemcpyAsync(h, d_buf[s], BYTES, cudaMemcpyDeviceToHost, streams[s]);
    }

    cudaStreamSynchronize(streams[0]);
    cudaStreamSynchronize(streams[1]);

    cudaFreeHost(h_data);
    cudaFree(d_buf[0]); cudaFree(d_buf[1]);
    cudaStreamDestroy(streams[0]); cudaStreamDestroy(streams[1]);
}`,
  },

  // ─── 8. Cooperative Groups ───────────────────────────────────────────────
  {
    slug: "cooperative-groups",
    title: "Cooperative Groups and Warp Primitives",
    category: "Parallelism",
    order: 8,
    relatedProjects: ["reduction-variants", "parallel-scan"],
    relatedConcepts: ["warp-execution", "gpu-thread-hierarchy", "occupancy"],
    content: `# Cooperative Groups and Warp Primitives

**Cooperative Groups** (CUDA 9+) provide a composable, type-safe API for synchronizing and communicating across arbitrary subsets of threads — beyond the fixed \`__syncthreads()\` model.

## Thread Group Types

| Group | API | Scope |
|---|---|---|
| Thread block | \`cg::this_thread_block()\` | All threads in current block |
| Warp tile (32) | \`cg::tiled_partition<32>(block)\` | One full warp |
| Sub-warp tile | \`cg::tiled_partition<N>(block)\` | N threads (N = 2, 4, 8, 16, or 32) |
| Grid group | \`cg::this_grid()\` | All threads (cooperative launch required) |
| Coalesced group | \`cg::coalesced_threads()\` | All currently active threads in warp |

\`\`\`c
#include <cooperative_groups.h>
namespace cg = cooperative_groups;

__global__ void example() {
    cg::thread_block block = cg::this_thread_block();
    block.sync();   // same as __syncthreads()

    // Partition into 32-thread warps
    auto warp = cg::tiled_partition<32>(block);
    warp.sync();    // synchronize this warp only

    // Sub-warp: 4-thread tiles for finer-grained cooperation
    auto quad = cg::tiled_partition<4>(block);
    quad.sync();
}
\`\`\`

## Group-Level Reduce

Cooperative Groups provides built-in reduce operations that use the fastest available mechanism (shuffles for warps, shared memory for blocks):

\`\`\`c
#include <cooperative_groups/reduce.h>

auto warp = cg::tiled_partition<32>(cg::this_thread_block());
float sum = cg::reduce(warp, val, cg::plus<float>());    // warp sum
float mx  = cg::reduce(warp, val, cg::greater<float>()); // warp max
\`\`\`

## Warp Shuffle Intrinsics

Exchange register values between threads in a warp — **no shared memory, no synchronization needed**:

\`\`\`c
// Broadcast: all threads receive the value held by lane srcLane
float v = __shfl_sync(0xffffffff, val, 0);           // broadcast from lane 0

// Shift down: thread i receives the value of thread i+delta
float next = __shfl_down_sync(0xffffffff, val, 1);   // useful for scan

// Butterfly XOR: pairs (0,1), (2,3), ... (used in reductions)
float pair = __shfl_xor_sync(0xffffffff, val, 1);
\`\`\`

The first argument is a 32-bit **active mask**. Use \`0xffffffff\` for full warp participation. All threads named in the mask must execute the instruction.

## Warp Vote Functions

Test predicates across all lanes:

\`\`\`c
// 32-bit mask: bit i = 1 if thread i's predicate is true
unsigned mask = __ballot_sync(0xffffffff, val > 0.f);
int count = __popc(mask);   // population count = number of true threads

bool any_true = __any_sync(0xffffffff, val > 0.f);
bool all_true = __all_sync(0xffffffff, val > 0.f);
\`\`\`

## Grid-Level Cooperation (Cooperative Kernels)

For synchronization across all blocks without ending the kernel, use a **cooperative launch**. All blocks must be resident simultaneously — the launch size is limited:

\`\`\`c
__global__ void cooperativeKernel(float *data, int n) {
    cg::grid_group grid = cg::this_grid();

    // Phase 1: independent work per block
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) data[i] *= 2.0f;

    grid.sync();  // wait for all blocks to finish phase 1

    // Phase 2: depends on phase 1 results from other blocks
    if (i < n && i > 0) data[i] += data[i - 1];
}

// Must use cudaLaunchCooperativeKernel
void *args[] = { &d_data, &n };
cudaLaunchCooperativeKernel((void*)cooperativeKernel, grid, block, args);
\`\`\`

**Constraint:** grid size ≤ SM count × max concurrent blocks per SM (entire grid must be resident).`,
    codeExample: `// Warp reduction using Cooperative Groups reduce API
#include <cooperative_groups.h>
#include <cooperative_groups/reduce.h>
namespace cg = cooperative_groups;

__global__ void cgBlockSum(const float *in, float *out, int n) {
    cg::thread_block      block = cg::this_thread_block();
    cg::thread_block_tile<32> warp = cg::tiled_partition<32>(block);

    __shared__ float warpResults[32];  // one slot per warp

    int gid    = blockIdx.x * blockDim.x + threadIdx.x;
    int lane   = warp.thread_rank();   // 0-31
    int warpId = threadIdx.x / 32;

    float val = (gid < n) ? in[gid] : 0.f;

    // Phase 1: reduce within warp using shuffle (cg::reduce uses __shfl internally)
    float warpSum = cg::reduce(warp, val, cg::plus<float>());

    // Phase 2: lane 0 of each warp writes to shared memory
    if (lane == 0) warpResults[warpId] = warpSum;
    block.sync();   // __syncthreads() via cooperative groups

    // Phase 3: first warp reduces all warp results
    if (warpId == 0) {
        int numWarps = (blockDim.x + 31) / 32;
        float partial = (lane < numWarps) ? warpResults[lane] : 0.f;
        float blockTotal = cg::reduce(warp, partial, cg::plus<float>());
        if (lane == 0) atomicAdd(out, blockTotal);
    }
}`,
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
