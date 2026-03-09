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
  // ─── 9. Atomic Operations ────────────────────────────────────────────────
  {
    slug: "atomic-operations",
    title: "Atomic Operations and Memory Ordering",
    category: "Memory",
    order: 9,
    relatedProjects: ["histogram", "reduction-variants"],
    relatedConcepts: ["warp-execution", "global-memory-coalescing", "parallel-reduction"],
    content: `# Atomic Operations and Memory Ordering

An **atomic operation** reads, modifies, and writes a memory location as an indivisible unit — no other thread can observe the location in an intermediate state. CUDA provides hardware-accelerated atomics in global and shared memory.

## Built-in Atomic Functions

| Function | Operation | Types |
|---|---|---|
| \`atomicAdd(addr, val)\` | \`*addr += val\` | int, uint, float, double, half2 |
| \`atomicSub(addr, val)\` | \`*addr -= val\` | int, uint |
| \`atomicMin/Max(addr, val)\` | Min or max update | int, uint (float on CC 3.5+) |
| \`atomicAnd/Or/Xor(addr, val)\` | Bitwise op | int, uint |
| \`atomicExch(addr, val)\` | Swap, return old | int, uint, float |
| \`atomicCAS(addr, compare, val)\` | Compare-and-swap | int, uint, ull |
| \`atomicInc/Dec(addr, max)\` | Modular increment/decrement | uint |

All return the **old** value at \`addr\` before the operation.

## Compare-And-Swap (CAS)

\`atomicCAS\` is the primitive from which all others can be built:

\`\`\`c
// Implement atomicMin for float (no native HW instruction on older GPUs)
__device__ float atomicMinFloat(float *addr, float val) {
    int *addr_i = (int *)addr;
    int old = *addr_i, assumed;
    do {
        assumed = old;
        float current = __int_as_float(old);
        if (val >= current) break;
        old = atomicCAS(addr_i, assumed, __float_as_int(val));
    } while (assumed != old);
    return __int_as_float(old);
}
\`\`\`

The loop retries until \`assumed == old\`, meaning no other thread modified the location between the read and the CAS.

## Contention and Performance

**All atomics to the same address serialize.** A histogram with 256 bins and 1M threads → potentially 4000 threads contending per bin.

**Mitigation strategies:**

1. **Shared memory atomics + reduction** — accumulate per-block in shared memory, flush to global once:
\`\`\`c
__global__ void histogram(const int *data, int *hist, int n) {
    __shared__ int s_hist[256];
    if (threadIdx.x < 256) s_hist[threadIdx.x] = 0;
    __syncthreads();

    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) atomicAdd(&s_hist[data[i]], 1);   // fast: shared memory
    __syncthreads();

    // Flush block-local counts to global with one atomic per bin per block
    if (threadIdx.x < 256) atomicAdd(&hist[threadIdx.x], s_hist[threadIdx.x]);
}
\`\`\`

2. **Thread-private partial histograms** — each thread accumulates in private arrays, merge at end.
3. **Warp-level aggregation** — use \`__ballot_sync\` to count how many threads in a warp increment the same bin, then do a single atomic per unique bin.

## Memory Ordering: \`cuda::atomic\` (CUDA 11+)

The CUDA C++ \`<cuda/atomic>\` header provides C++20-style atomics with explicit memory orders:

\`\`\`c
#include <cuda/atomic>

__device__ cuda::atomic<int, cuda::thread_scope_device> counter{0};

__global__ void increment() {
    counter.fetch_add(1, cuda::memory_order_relaxed); // no ordering guarantee
}
\`\`\`

Available memory orders (weakest to strongest): \`relaxed\`, \`acquire\`, \`release\`, \`acq_rel\`, \`seq_cst\`.

Use the weakest order that is correct — \`relaxed\` for independent counters, \`acquire/release\` for producer-consumer patterns.

## Atomic Scope

| Scope | Constant | When to use |
|---|---|---|
| Thread block | \`cuda::thread_scope_block\` | Shared memory atomics within a block |
| Device | \`cuda::thread_scope_device\` | Global memory atomics within one GPU |
| System | \`cuda::thread_scope_system\` | Host-device communication via pinned memory |`,
    codeExample: `// Histogram using shared memory atomics (fast) vs global atomics (slow)
#include <cuda_runtime.h>
#define BINS 256
#define BLOCK 256

// FAST: accumulate per-block in shared memory, one atomic to global per bin
__global__ void histShared(const unsigned char *data, int *hist, int n) {
    __shared__ int s[BINS];
    if (threadIdx.x < BINS) s[threadIdx.x] = 0;
    __syncthreads();

    int i = blockIdx.x * BLOCK + threadIdx.x;
    if (i < n) atomicAdd(&s[data[i]], 1);
    __syncthreads();

    if (threadIdx.x < BINS) atomicAdd(&hist[threadIdx.x], s[threadIdx.x]);
}

// Demonstrate atomicCAS-based lock for a critical section
__device__ int g_lock = 0;

__global__ void criticalSection(int *shared_val) {
    // Spin-lock: not recommended for production, illustrative only
    bool done = false;
    while (!done) {
        if (atomicCAS(&g_lock, 0, 1) == 0) {
            // critical section
            (*shared_val)++;
            __threadfence();         // ensure write is visible before unlock
            atomicExch(&g_lock, 0); // release lock
            done = true;
        }
    }
}`,
  },

  // ─── 10. Parallel Reduction ──────────────────────────────────────────────
  {
    slug: "parallel-reduction",
    title: "Parallel Reduction Patterns",
    category: "Algorithms",
    order: 10,
    relatedProjects: ["reduction-variants", "vector-add"],
    relatedConcepts: ["warp-execution", "shared-memory", "cooperative-groups", "atomic-operations"],
    content: `# Parallel Reduction Patterns

**Reduction** maps an array of N values to a single value (sum, max, count) using an associative operator. The naive sequential approach is O(N); the parallel approach achieves O(N/P + log P) — the dominant pattern in GPU programming.

## The Tree Reduction Idea

Think of it as a binary tree of pairwise operations:
\`\`\`
[a0 a1 a2 a3 a4 a5 a6 a7]     N = 8 elements
  ↓    ↓    ↓    ↓             step 1: stride 1 (4 ops)
[a0+a1 a2+a3 a4+a5 a6+a7]
    ↓         ↓               step 2: stride 2 (2 ops)
  [a0..a3   a4..a7]
          ↓                   step 3: stride 4 (1 op)
       [a0..a7]
\`\`\`
\`log2(8) = 3\` steps. With 1,024 threads this becomes 10 steps — much less than 1,023 sequential adds.

## Reduction 1 — Interleaved Addressing (Naive, Slow)

\`\`\`c
// DIVERGES: threadIdx.x % stride != 0 causes half the warp to idle
for (int s = 1; s < blockDim.x; s *= 2) {
    if (threadIdx.x % (2 * s) == 0)
        smem[threadIdx.x] += smem[threadIdx.x + s];
    __syncthreads();
}
\`\`\`

Problem: thread IDs 0, 2, 4... are active while 1, 3, 5... are idle — heavy divergence.

## Reduction 2 — Sequential Addressing (Better)

\`\`\`c
// No divergence: first blockDim.x/2 threads are always active
for (int s = blockDim.x / 2; s > 0; s >>= 1) {
    if (threadIdx.x < s)
        smem[threadIdx.x] += smem[threadIdx.x + s];
    __syncthreads();
}
\`\`\`

All active threads are contiguous (0 to s−1) — no divergence. Also improves cache behavior.

## Reduction 3 — First Add During Load

Half the blocks do nothing useful in reduction 2 (they just load one element). Load two elements per thread and add immediately:

\`\`\`c
int i = blockIdx.x * (blockDim.x * 2) + threadIdx.x;
smem[tid] = g_idata[i] + g_idata[i + blockDim.x];  // adds on load
\`\`\`

Halves the number of blocks needed for the same input size.

## Reduction 4 — Warp Unrolling

For the final 32 threads (one warp), \`__syncthreads()\` is unnecessary because threads in a warp execute synchronously:

\`\`\`c
if (tid < 32) {
    // warpReduce: no __syncthreads() needed
    smem[tid] += smem[tid + 32]; __syncwarp();
    smem[tid] += smem[tid + 16]; __syncwarp();
    smem[tid] += smem[tid +  8]; __syncwarp();
    smem[tid] += smem[tid +  4]; __syncwarp();
    smem[tid] += smem[tid +  2]; __syncwarp();
    smem[tid] += smem[tid +  1]; __syncwarp();
}
\`\`\`

## Reduction 5 — Full Warp Shuffle (Best Practice)

Replace shared memory entirely for the warp-level phase:

\`\`\`c
__device__ float warpReduceSum(float val) {
    for (int offset = 16; offset > 0; offset >>= 1)
        val += __shfl_down_sync(0xffffffff, val, offset);
    return val;  // lane 0 has the total
}
\`\`\`

Shuffle intrinsics have lower latency than shared memory and require no \`__syncthreads()\`.

## Multi-Block Reduction

A single block handles at most 1,024 elements. For large arrays:

1. **Pass 1:** Each block reduces its chunk → writes partial sum to \`partial[blockIdx.x]\`
2. **Pass 2:** One block (or CPU) reduces the N/1024 partial sums

\`\`\`c
// Grid-stride loop: one kernel handles arbitrarily large arrays
int i = blockIdx.x * blockDim.x + threadIdx.x;
float val = 0.f;
while (i < n) {
    val += g_in[i];
    i += gridDim.x * blockDim.x;   // stride = total thread count
}
// then tree-reduce val within the block...
\`\`\``,
    codeExample: `// Complete optimized block reduction: first-add-on-load + warp shuffles
#include <cuda_runtime.h>

__device__ float warpReduceSum(float val) {
    val += __shfl_down_sync(0xffffffff, val, 16);
    val += __shfl_down_sync(0xffffffff, val,  8);
    val += __shfl_down_sync(0xffffffff, val,  4);
    val += __shfl_down_sync(0xffffffff, val,  2);
    val += __shfl_down_sync(0xffffffff, val,  1);
    return val;
}

__global__ void reduce(const float *g_in, float *g_out, int n) {
    __shared__ float smem[32];  // one slot per warp

    // Grid-stride loop: load 2 elements per thread and add immediately
    int tid  = threadIdx.x;
    int gid  = blockIdx.x * (blockDim.x * 2) + tid;
    float val = 0.f;
    if (gid     < n) val += g_in[gid];
    if (gid + blockDim.x < n) val += g_in[gid + blockDim.x];

    // Warp-level reduction
    val = warpReduceSum(val);

    // First lane of each warp writes to shared memory
    int lane   = tid % 32;
    int warpId = tid / 32;
    if (lane == 0) smem[warpId] = val;
    __syncthreads();

    // Final warp reduces all warp sums
    int numWarps = (blockDim.x + 31) / 32;
    if (tid < 32) {
        val = (tid < numWarps) ? smem[tid] : 0.f;
        val = warpReduceSum(val);
        if (tid == 0) g_out[blockIdx.x] = val;
    }
}`,
  },

  // ─── 11. Parallel Prefix Scan ────────────────────────────────────────────
  {
    slug: "parallel-scan",
    title: "Parallel Prefix Scan (Inclusive and Exclusive)",
    category: "Algorithms",
    order: 11,
    relatedProjects: ["parallel-scan", "reduction-variants"],
    relatedConcepts: ["parallel-reduction", "shared-memory", "warp-execution"],
    content: `# Parallel Prefix Scan

A **prefix scan** (prefix sum) produces a running cumulative result: given \`[a0, a1, a2, a3]\`, the inclusive scan is \`[a0, a0+a1, a0+a1+a2, a0+a1+a2+a3]\`. It is a fundamental building block for stream compaction, sorting, histogram normalization, and load balancing.

## Inclusive vs. Exclusive

| | Inclusive | Exclusive |
|---|---|---|
| Result[i] | \`a[0] + … + a[i]\` | \`a[0] + … + a[i-1]\` |
| Result[0] | \`a[0]\` | Identity (0 for sum) |
| Convert | Shift right by 1, prepend identity | Shift left by 1, append total |

## Hillis-Steele (Work-Inefficient)

\`log2(N)\` steps, but each step touches all N elements → O(N log N) work (vs O(N) sequential). Good when extra parallelism outweighs extra work.

\`\`\`c
for (int d = 1; d < n; d <<= 1) {
    if (tid >= d)
        tmp[tid] = s[tid] + s[tid - d];
    else
        tmp[tid] = s[tid];
    __syncthreads();
    s[tid] = tmp[tid];
    __syncthreads();
}
// Result: inclusive scan in s[]
\`\`\`

## Blelloch (Work-Efficient)

Two-phase approach — O(N) work, O(log N) depth. Preferred for large inputs.

**Phase 1 — Reduce (up-sweep):**
\`\`\`
d=1:  s[1]+=s[0],   s[3]+=s[2],   s[5]+=s[4],   ...
d=2:  s[3]+=s[1],   s[7]+=s[5],   ...
d=4:  s[7]+=s[3],   ...
\`\`\`
After up-sweep, \`s[N-1]\` holds the total.

**Phase 2 — Down-sweep:**
\`\`\`c
// Set last element to identity
if (tid == 0) s[n - 1] = 0;
__syncthreads();

for (int d = n/2; d >= 1; d >>= 1) {
    // Each active thread performs a butterfly swap + add
    int left = 2*d*tid + d - 1, right = left + d;
    float t = s[left];
    s[left]  = s[right];
    s[right] += t;
    __syncthreads();
}
// Result: exclusive scan in s[]
\`\`\`

## Warp Scan (Fastest, No Shared Memory Sync)

For sub-warp or full-warp scans, use shuffle intrinsics — no \`__syncthreads()\` needed:

\`\`\`c
__device__ float warpInclusiveScan(float val) {
    unsigned mask = 0xffffffff;
    for (int offset = 1; offset < 32; offset <<= 1) {
        float y = __shfl_up_sync(mask, val, offset);
        if (threadIdx.x % 32 >= offset) val += y;
    }
    return val;
}
\`\`\`

## Multi-Block Scan Pattern

For arrays larger than one block:

1. **Block scan:** each block scans its chunk, writes the block total to \`sums[blockIdx.x]\`
2. **Scan the sums:** run scan on the \`sums\` array (recursively or with a single block)
3. **Add prefix:** each block adds its corresponding prefix sum from \`sums\`

This pattern, called **scan-then-propagate**, is used by CUB's \`DeviceScan\` and Thrust's \`inclusive_scan\`.

## Applications

| Pattern | Uses scan for |
|---|---|
| Stream compaction | Writing only valid elements to a compact output array |
| Radix sort | Digit histogram offsets (counting sort step) |
| Sparse matrix-vector multiply | Row pointer generation |
| Dynamic memory allocation | Allocating variable-size per-thread output buffers |`,
    codeExample: `// Blelloch exclusive scan within a single block (power-of-2 size)
#define BLOCK_N 512

__global__ void exclusiveScan(float *data, int n) {
    __shared__ float s[BLOCK_N];
    int tid = threadIdx.x;

    // Load input
    s[tid] = (tid < n) ? data[tid] : 0.f;
    __syncthreads();

    // Up-sweep (reduce)
    for (int d = 1; d < BLOCK_N; d <<= 1) {
        int right = 2 * d * (tid + 1) - 1;
        int left  = right - d;
        if (right < BLOCK_N) s[right] += s[left];
        __syncthreads();
    }

    // Set root to identity
    if (tid == 0) s[BLOCK_N - 1] = 0.f;
    __syncthreads();

    // Down-sweep
    for (int d = BLOCK_N / 2; d >= 1; d >>= 1) {
        int right = 2 * d * (tid + 1) - 1;
        int left  = right - d;
        if (right < BLOCK_N) {
            float t   = s[left];
            s[left]   = s[right];
            s[right] += t;
        }
        __syncthreads();
    }

    if (tid < n) data[tid] = s[tid];
}`,
  },

  // ─── 12. Tiled Matrix Multiplication ─────────────────────────────────────
  {
    slug: "tiled-matrix-multiply",
    title: "Tiled Matrix Multiplication (SGEMM)",
    category: "Algorithms",
    order: 12,
    relatedProjects: ["tiled-sgemm"],
    relatedConcepts: ["shared-memory", "global-memory-coalescing", "occupancy", "tensor-cores"],
    content: `# Tiled Matrix Multiplication (SGEMM)

Matrix multiplication \`C = A × B\` (SGEMM — Single-precision General Matrix Multiply) is the most important compute-bound kernel in GPU programming. It is compute-bound: each element of C requires N multiply-add operations but is written only once.

## The Roofline Problem

Naively, computing C[i][j] requires reading one full row of A and one full column of B — N floats each, for N² elements of C. Total reads: 2N³ floats. Without shared memory every thread independently fetches from global DRAM.

**Arithmetic intensity:** \`ops / bytes = N multiply-adds / (N reads + N reads) = N/2\`

For N=1024, each element of C requires 1024 multiply-adds and 2048 bytes loaded — we need to keep the data close to the compute units.

## Tiled Algorithm

Decompose A and B into **TILE×TILE sub-matrices**. Each thread block computes one TILE×TILE tile of C, loading tiles of A and B into shared memory and reusing them across the K dimension:

\`\`\`
For each k-tile (k = 0 to K/TILE):
  1. Load A_tile[TILE][TILE] from global memory → shared memory (coalesced)
  2. Load B_tile[TILE][TILE] from global memory → shared memory (coalesced)
  3. __syncthreads()
  4. Each thread computes its partial dot product using shared memory
  5. __syncthreads()
\`\`\`

**Shared memory reuse:** each element of the tile is reused TILE times (by TILE different threads). This multiplies the effective bandwidth by TILE.

For TILE=16: 16× bandwidth reduction. For TILE=32: 32× reduction.

## Register Tiling for More Compute

The next level: each thread accumulates a small sub-tile (e.g. 4×4) of C in registers, loading 4 values of A and 4 values of B per step. This is how cuBLAS achieves >90% of theoretical FLOPs.

\`\`\`c
float c[4][4] = {};           // 16 registers for C sub-tile
float a[4], b[4];

for (int k = 0; k < K; k++) {
    // Load 4 values from A column and B row into registers
    for (int i = 0; i < 4; i++) a[i] = s_A[k][ty*4 + i];
    for (int j = 0; j < 4; j++) b[j] = s_B[k][tx*4 + j];
    // Outer product: 4×4 = 16 FMAs
    for (int i = 0; i < 4; i++)
        for (int j = 0; j < 4; j++)
            c[i][j] += a[i] * b[j];
}
\`\`\`

## Performance Roofline

| Approach | Effective bandwidth | FLOPs |
|---|---|---|
| Naive global memory | Peak DRAM BW | Low (memory-bound) |
| Shared-memory tiling (TILE=16) | 16× less DRAM | Moderate |
| Register tiling (4×4 sub-tile) | 64× less DRAM | High (compute-bound) |
| Tensor cores (WMMA) | Minimal loads | Near-peak TFLOPS |

## When to Use cuBLAS

For production code, always use **cuBLAS \`cublasSgemm\`** — it implements register tiling, tensor core utilization, and architecture-specific tuning. Only write your own GEMM as a learning exercise or when you need non-standard operations.`,
    codeExample: `// Shared-memory tiled SGEMM: C = A * B (N×N matrices)
#define TILE 16

__global__ void tiledSgemm(
    const float *A, const float *B, float *C, int N)
{
    __shared__ float As[TILE][TILE];
    __shared__ float Bs[TILE][TILE];

    int row = blockIdx.y * TILE + threadIdx.y;  // C row
    int col = blockIdx.x * TILE + threadIdx.x;  // C col

    float sum = 0.f;

    // Sweep tiles along the K dimension
    for (int t = 0; t < (N + TILE - 1) / TILE; t++) {
        // Coalesced loads into shared memory
        int aCol = t * TILE + threadIdx.x;
        int bRow = t * TILE + threadIdx.y;

        As[threadIdx.y][threadIdx.x] = (row < N && aCol < N) ? A[row * N + aCol] : 0.f;
        Bs[threadIdx.y][threadIdx.x] = (bRow < N && col < N) ? B[bRow * N + col] : 0.f;
        __syncthreads();

        // Dot product over this tile — TILE FMAs per thread
        for (int k = 0; k < TILE; k++)
            sum += As[threadIdx.y][k] * Bs[k][threadIdx.x];
        __syncthreads();
    }

    if (row < N && col < N) C[row * N + col] = sum;
}`,
  },

  // ─── 13. Tensor Cores and WMMA ───────────────────────────────────────────
  {
    slug: "tensor-cores",
    title: "Tensor Cores and the WMMA API",
    category: "Optimization",
    order: 13,
    relatedProjects: ["tiled-sgemm"],
    relatedConcepts: ["tiled-matrix-multiply", "warp-execution", "occupancy"],
    content: `# Tensor Cores and the WMMA API

**Tensor Cores** are dedicated matrix-multiply-accumulate (MMA) units introduced in Volta (V100). They compute a small matrix product (e.g. 16×16×16) in a single clock cycle, delivering >4× the FLOPs of standard CUDA cores.

## Why Tensor Cores Exist

A dense GEMM is dominated by fused multiply-add (FMA) operations. Regular CUDA cores execute one FMA per thread per clock. Tensor Cores execute a **16×16×16 FP16 matrix multiply** per warp per clock — 256 FMAs in one instruction vs. 32 from regular cores.

| GPU | FP32 (CUDA cores) | FP16 Tensor (WMMA) |
|---|---|---|
| V100 | 14 TFLOPS | 112 TFLOPS |
| A100 | 19.5 TFLOPS | 312 TFLOPS (TF32), 624 TFLOPS (FP16) |
| H100 | 67 TFLOPS | 1979 TFLOPS (FP8) |

## WMMA: Warp Matrix Multiply-Accumulate

The \`nvcuda::wmma\` API exposes tensor cores at the warp level. All 32 threads in a warp cooperate to hold a **fragment** (a distributed register tile):

\`\`\`c
#include <mma.h>
using namespace nvcuda::wmma;

// Fragment types: matrix_a, matrix_b, accumulator
fragment<matrix_a, 16, 16, 16, half, row_major> a_frag;
fragment<matrix_b, 16, 16, 16, half, col_major> b_frag;
fragment<accumulator, 16, 16, 16, float>         c_frag;

// Initialize accumulator to zero
fill_fragment(c_frag, 0.0f);

// Load a 16×16 tile of A and B from shared or global memory
load_matrix_sync(a_frag, tile_A_ptr, lda);   // lda = leading dimension
load_matrix_sync(b_frag, tile_B_ptr, ldb);

// Execute: c_frag += a_frag * b_frag (tensor core instruction)
mma_sync(c_frag, a_frag, b_frag, c_frag);

// Store the result tile back to memory
store_matrix_sync(c_ptr, c_frag, ldc, mem_row_major);
\`\`\`

## Supported Data Types

| Data type pair | Accumulator | Min. Compute Capability |
|---|---|---|
| FP16 × FP16 | FP16 or FP32 | CC 7.0 (Volta) |
| BF16 × BF16 | FP32 | CC 8.0 (Ampere) |
| TF32 × TF32 | FP32 | CC 8.0 (Ampere) |
| FP8 × FP8 | FP16/FP32 | CC 9.0 (Hopper) |
| INT8 × INT8 | INT32 | CC 7.2 (Volta) |

## TF32: Drop-in Acceleration

Ampere added **TF32** (19-bit mantissa truncated from FP32), enabling FP32 → tensor core automatically:

\`\`\`c
// Enable TF32 for cuBLAS (transparent, ~10× vs FP32 CUDA cores)
cublasSetMathMode(handle, CUBLAS_TF32_TENSOR_OP_MATH);
\`\`\`

No code changes required — cuBLAS handles the conversion internally.

## Alignment Requirements

WMMA requires:
- **128-byte aligned** shared memory pointers
- Leading dimensions divisible by the tile size (16 for standard WMMA)
- Input matrices in **FP16** for basic WMMA (FP32 inputs need conversion)

\`\`\`c
// Convert FP32 → FP16 on device before WMMA
__global__ void fp32ToFp16(const float *in, half *out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) out[i] = __float2half(in[i]);
}
\`\`\`

## Practical Advice

For production: **always use cuBLAS or cuDNN** — they use WMMA internally with architecture-specific tuning, achieving 95%+ of peak. Write WMMA directly only for custom fused operations (e.g., fused attention) or as a learning exercise.`,
    codeExample: `// Minimal WMMA GEMM kernel: C (FP32) = A (FP16) * B (FP16)
#include <mma.h>
#include <cuda_fp16.h>
using namespace nvcuda::wmma;

#define WMMA_M 16
#define WMMA_N 16
#define WMMA_K 16

__global__ void wmmaGemm(
    const half *A, const half *B, float *C, int M, int N, int K)
{
    // Warp-level tile coordinates
    int warpM = (blockIdx.x * blockDim.x + threadIdx.x) / 32;
    int warpN =  blockIdx.y * blockDim.y + threadIdx.y;

    fragment<matrix_a, WMMA_M, WMMA_N, WMMA_K, half, row_major> aFrag;
    fragment<matrix_b, WMMA_M, WMMA_N, WMMA_K, half, col_major> bFrag;
    fragment<accumulator, WMMA_M, WMMA_N, WMMA_K, float>         cFrag;
    fill_fragment(cFrag, 0.0f);

    // Sweep over K tiles
    for (int k = 0; k < K; k += WMMA_K) {
        if (warpM * WMMA_M < M && k < K)
            load_matrix_sync(aFrag, A + warpM * WMMA_M * K + k, K);
        if (warpN * WMMA_N < N && k < K)
            load_matrix_sync(bFrag, B + k * N + warpN * WMMA_N, N);
        mma_sync(cFrag, aFrag, bFrag, cFrag);
    }

    // Store result
    if (warpM * WMMA_M < M && warpN * WMMA_N < N)
        store_matrix_sync(C + warpM * WMMA_M * N + warpN * WMMA_N,
                          cFrag, N, mem_row_major);
}`,
  },

  // ─── 14. CUDA Error Handling and Debugging ───────────────────────────────
  {
    slug: "cuda-error-handling",
    title: "Error Handling and Debugging",
    category: "Tooling",
    order: 14,
    relatedProjects: ["hello-cuda", "vector-add"],
    relatedConcepts: ["gpu-thread-hierarchy", "cuda-profiling"],
    content: `# Error Handling and Debugging

CUDA operations fail silently by default. All CUDA runtime functions return a \`cudaError_t\` code; all kernel launches are asynchronous and can't return a value. Building robust CUDA code requires systematic error checking.

## Runtime Error Checking

Every CUDA API call should be wrapped:

\`\`\`c
// Convenient macro for CUDA API calls
#define CUDA_CHECK(call)                                                  \\
    do {                                                                  \\
        cudaError_t err = (call);                                         \\
        if (err != cudaSuccess) {                                         \\
            fprintf(stderr, "CUDA error at %s:%d — %s\\n",               \\
                    __FILE__, __LINE__, cudaGetErrorString(err));         \\
            exit(EXIT_FAILURE);                                           \\
        }                                                                 \\
    } while (0)

// Usage:
CUDA_CHECK(cudaMalloc(&d_ptr, bytes));
CUDA_CHECK(cudaMemcpy(d_ptr, h_ptr, bytes, cudaMemcpyHostToDevice));
\`\`\`

## Kernel Error Checking

Kernels don't return errors directly. After a launch, check two things:

\`\`\`c
// Check launch configuration errors (wrong grid/block size, etc.)
myKernel<<<grid, block>>>(args);
CUDA_CHECK(cudaGetLastError());

// Check errors that occurred during kernel execution
CUDA_CHECK(cudaDeviceSynchronize());
\`\`\`

Without \`cudaDeviceSynchronize()\`, errors from asynchronous operations may be attributed to the wrong line of code.

## Device-Side Assertions

\`assert()\` works in CUDA kernels on devices with compute capability 2.0+:

\`\`\`c
__global__ void myKernel(float *data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    assert(i < n);  // triggers cudaErrorAssert if false; printed to stderr
    data[i] *= 2.0f;
}
\`\`\`

\`printf\` also works in kernels (buffered and flushed at \`cudaDeviceSynchronize()\`):
\`\`\`c
if (threadIdx.x == 0 && blockIdx.x == 0)
    printf("First thread: data[0] = %f\\n", data[0]);
\`\`\`

## Compute Sanitizer

NVIDIA's **Compute Sanitizer** (replaces the deprecated cuda-memcheck) detects:

| Tool | Detects |
|---|---|
| \`memcheck\` | Out-of-bounds access, misaligned access, uninitialized device memory |
| \`racecheck\` | Shared memory races (missing \`__syncthreads()\`) |
| \`initcheck\` | Use of uninitialized global memory |
| \`synccheck\` | Illegal barrier usage (\`__syncthreads()\` in divergent code) |

\`\`\`bash
compute-sanitizer --tool memcheck ./my_program
compute-sanitizer --tool racecheck ./my_program
\`\`\`

## Common Bugs

| Bug | Symptom | Fix |
|---|---|---|
| Missing \`cudaDeviceSynchronize()\` | Wrong results; silent failure | Add sync before checking results |
| Off-by-one in grid size | Last elements wrong | Use \`(N + block - 1) / block\` |
| Accessing freed device memory | Crash or garbage | Track allocation lifetime |
| Using host pointer on device | Segfault in kernel | Ensure pointer came from \`cudaMalloc\` |
| Missing \`__syncthreads()\` | Race condition in shared memory | Add barrier after shared memory writes |
| Divergent \`__syncthreads()\` | Deadlock or hang | Never put \`__syncthreads()\` inside an if-block that only some threads reach |

## CUDA-GDB

For interactive debugging:
\`\`\`bash
# Compile with debug info
nvcc -G -g -o my_program my_program.cu

# Run under CUDA-GDB
cuda-gdb ./my_program

# Key CUDA-GDB commands
(cuda-gdb) cuda thread (0,0,0) block (1,0,0)  # switch to specific thread
(cuda-gdb) info cuda threads                   # list all active threads
(cuda-gdb) print threadIdx.x                  # inspect CUDA built-ins
\`\`\``,
    codeExample: `#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>

// Wrap every CUDA call with this macro
#define CUDA_CHECK(call)                                               \\
    do {                                                               \\
        cudaError_t _err = (call);                                     \\
        if (_err != cudaSuccess) {                                     \\
            fprintf(stderr, "[CUDA] %s:%d error: %s\\n",              \\
                __FILE__, __LINE__, cudaGetErrorString(_err));        \\
            exit(EXIT_FAILURE);                                        \\
        }                                                              \\
    } while (0)

__global__ void safeKernel(float *data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    // Device-side bounds check — triggers cudaErrorAssert if violated
    assert(i < n);
    data[i] *= 2.0f;
}

int main() {
    const int N = 1024;
    float *d_data;

    CUDA_CHECK(cudaMalloc(&d_data, N * sizeof(float)));

    // Fill with 1s on device using cudaMemset-like approach
    CUDA_CHECK(cudaMemset(d_data, 0, N * sizeof(float)));

    int tpb = 256;
    int blocks = (N + tpb - 1) / tpb;
    safeKernel<<<blocks, tpb>>>(d_data, N);

    // Always check kernel launch AND execution errors
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    float h_result;
    CUDA_CHECK(cudaMemcpy(&h_result, d_data, sizeof(float), cudaMemcpyDeviceToHost));
    printf("data[0] = %f (expected 0.0)\\n", h_result);

    CUDA_CHECK(cudaFree(d_data));
    return 0;
}`,
  },

  // ─── 15. Profiling with Nsight ───────────────────────────────────────────
  {
    slug: "cuda-profiling",
    title: "Profiling with Nsight Compute and Nsight Systems",
    category: "Tooling",
    order: 15,
    relatedProjects: ["reduction-variants", "matrix-transpose", "tiled-sgemm"],
    relatedConcepts: ["occupancy", "global-memory-coalescing", "warp-execution", "cuda-error-handling"],
    content: `# Profiling with Nsight Compute and Nsight Systems

Profiling is not optional — human intuition about GPU bottlenecks is wrong surprisingly often. NVIDIA provides two complementary tools: **Nsight Systems** (system-level timeline) and **Nsight Compute** (kernel-level deep analysis).

## The Roofline Model

Before profiling, understand whether your kernel is **compute-bound** or **memory-bound**:

- **Compute-bound:** execution time limited by arithmetic throughput (FLOPs)
- **Memory-bound:** execution time limited by bandwidth (bytes/second)

**Arithmetic intensity** = FLOPs / bytes transferred to/from DRAM

If your kernel's arithmetic intensity is below the **ridge point** (peak FLOPs / peak bandwidth), it's memory-bound. For A100: 19.5 TFLOPS / 2 TB/s = ~9.75 FLOP/byte ridge point.

## Nsight Systems: Timeline View

Use Nsight Systems (\`nsys\`) first — it shows the big picture: are kernels overlapping with copies? Is there GPU idle time? Are there many small kernel launches with high CPU overhead?

\`\`\`bash
# Profile the full application
nsys profile --stats=true -o report.nsys-rep ./my_app

# View in GUI
nsys-ui report.nsys-rep

# Or print summary to terminal
nsys stats report.nsys-rep
\`\`\`

Key things to look for:
- Long gaps between kernels (CPU bottleneck or missing streams)
- Memory copies not overlapping with compute (missing async + pinned memory)
- Many tiny kernels (consider CUDA Graphs or kernel fusion)

## Nsight Compute: Per-Kernel Analysis

\`ncu\` drills into a single kernel execution. It measures hardware counters in multiple passes:

\`\`\`bash
# Profile all kernels
ncu --set full -o report ./my_app

# Profile only one kernel
ncu --kernel-name myKernel --launch-count 1 -o report ./my_app

# Open GUI
ncu-ui report.ncu-rep
\`\`\`

## Key Metrics to Read

| Section | Metric | What it tells you |
|---|---|---|
| SM Throughput | sm__throughput.avg.pct_of_peak | Overall SM utilization |
| Memory Throughput | l1tex__throughput, lts__throughput | L1/L2/DRAM utilization |
| Warp Stalls | smsp__warp_issue_stalled_*.pct | Where warps are waiting |
| Achieved Occupancy | sm__warps_active.avg.pct_of_peak | Active warps vs. theoretical |
| L2 Hit Rate | lts__t_sector_hit_rate | L2 cache effectiveness |
| Uncoalesced Accesses | l1tex__data_pipe_lsu_wavefronts_mem_lg_cmd_ld.sum | Non-coalesced load transactions |

## CUDA Events for Timing

For microbenchmarking individual kernels in code:

\`\`\`c
cudaEvent_t t0, t1;
cudaEventCreate(&t0);
cudaEventCreate(&t1);

cudaEventRecord(t0);
myKernel<<<grid, block>>>(args);
cudaEventRecord(t1);
cudaEventSynchronize(t1);

float ms;
cudaEventElapsedTime(&ms, t0, t1);
printf("Kernel: %.3f ms\\n", ms);

// Compute effective bandwidth (for memory-bound kernels)
float bytes = 2.0f * N * sizeof(float);  // 1 read + 1 write
printf("Bandwidth: %.1f GB/s\\n", bytes / ms / 1e6f);

cudaEventDestroy(t0);
cudaEventDestroy(t1);
\`\`\`

## Profiling-Guided Optimization Loop

1. **Profile** with Nsight Systems → find top-time kernels
2. **Profile** with Nsight Compute → find the binding limiter (memory vs. compute)
3. **If memory-bound:** improve coalescing, add shared memory tiling, reduce data movement
4. **If compute-bound:** use tensor cores, reduce redundant ops, improve ILP with register tiling
5. **Re-profile** to verify improvement → repeat`,
    codeExample: `// Self-contained bandwidth measurement using CUDA events
#include <cuda_runtime.h>
#include <cstdio>

__global__ void copyKernel(const float * __restrict__ src,
                           float * __restrict__ dst, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) dst[i] = src[i];
}

int main() {
    const int N     = 1 << 25;  // 32M floats = 128 MB
    const int ITERS = 20;
    const size_t bytes = N * sizeof(float);

    float *d_src, *d_dst;
    cudaMalloc(&d_src, bytes);
    cudaMalloc(&d_dst, bytes);
    cudaMemset(d_src, 0, bytes);

    cudaEvent_t t0, t1;
    cudaEventCreate(&t0);
    cudaEventCreate(&t1);

    int tpb = 256, blocks = (N + tpb - 1) / tpb;

    // Warm-up (fills caches, JIT-compiles)
    copyKernel<<<blocks, tpb>>>(d_src, d_dst, N);
    cudaDeviceSynchronize();

    cudaEventRecord(t0);
    for (int i = 0; i < ITERS; i++)
        copyKernel<<<blocks, tpb>>>(d_src, d_dst, N);
    cudaEventRecord(t1);
    cudaEventSynchronize(t1);

    float ms;
    cudaEventElapsedTime(&ms, t0, t1);
    float avg_ms = ms / ITERS;

    // 2× N bytes: one read + one write
    float bw = 2.0f * bytes / avg_ms / 1e6f;
    printf("Average: %.3f ms  Bandwidth: %.1f GB/s\\n", avg_ms, bw);

    cudaFree(d_src); cudaFree(d_dst);
    cudaEventDestroy(t0); cudaEventDestroy(t1);
}`,
  },

  // ─── 16. Dynamic Parallelism ─────────────────────────────────────────────
  {
    slug: "dynamic-parallelism",
    title: "Dynamic Parallelism",
    category: "Parallelism",
    order: 16,
    relatedProjects: ["parallel-scan"],
    relatedConcepts: ["gpu-thread-hierarchy", "cuda-streams", "cuda-memory-hierarchy"],
    content: `# Dynamic Parallelism

**Dynamic Parallelism** (CUDA 5.0+, CC 3.5+) allows kernels to launch child kernels directly from the device, without returning control to the host. It enables **adaptive algorithms** where the parallel structure isn't known until runtime.

## How It Works

From inside a kernel, you can use the full CUDA launch syntax:

\`\`\`c
__global__ void parentKernel(float *data, int n) {
    // Decide launch config based on runtime data
    if (someCondition(data, n)) {
        int childBlock = 128;
        int childGrid  = (n / 2 + childBlock - 1) / childBlock;
        childKernel<<<childGrid, childBlock>>>(data, n / 2);
    }
    // cudaDeviceSynchronize() on the device syncs child kernels
    cudaDeviceSynchronize();
}
\`\`\`

**Key constraints:**
- The device-side \`cudaDeviceSynchronize()\` only waits for children launched by **the calling thread block**, not all blocks
- Child launches are asynchronous relative to the parent block unless explicitly synchronized
- Memory written by the parent before launch is visible to children; parent can read children's output after \`cudaDeviceSynchronize()\`

## Use Cases

### Adaptive Mesh Refinement

\`\`\`c
__global__ void refineGrid(Cell *cells, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;

    if (cells[i].errorEstimate > THRESHOLD) {
        // Recursively refine only this cell
        subdivideCell<<<1, 256>>>(cells[i].data, cells[i].level + 1);
    }
}
\`\`\`

### Recursive Algorithms (e.g., Quicksort)

\`\`\`c
__global__ void quicksort(int *data, int lo, int hi) {
    if (lo >= hi) return;
    int pivot = partition(data, lo, hi);
    // Launch two child kernels for each partition
    if (pivot - lo > 1)
        quicksort<<<1, 1>>>(data, lo, pivot - 1);
    if (hi - pivot > 1)
        quicksort<<<1, 1>>>(data, pivot + 1, hi);
    cudaDeviceSynchronize();
}
\`\`\`

### Variable-Length Output (Compaction + Kernel-per-Cluster)

Process data of unknown density: first count elements in each region, then launch exactly as many threads as needed per region.

## Compilation and Linking

Dynamic parallelism requires device-side CUDA runtime and separate compilation:

\`\`\`bash
nvcc -arch=sm_70 -rdc=true -o program program.cu -lcudadevrt
# -rdc=true enables relocatable device code (required)
# -lcudadevrt links the device runtime library
\`\`\`

## Performance Considerations

Dynamic parallelism has higher overhead than host-side launches:
- Each device-side launch has ~1–10 µs overhead (vs ~1–5 µs from host)
- Deep recursion creates many small kernels; use **tail-call flattening** when possible
- Memory for child launch configs is allocated from a device-side pool — can exhaust with very deep recursion
- Better alternatives for simple subdivision: **grid-stride loops**, **cooperative groups grid sync**, or **precomputed offsets from prefix scan**

Use dynamic parallelism when the work distribution genuinely can't be determined before kernel execution.`,
    codeExample: `// Dynamic parallelism: parent kernel launches children for dense regions only
#include <cuda_runtime.h>
#include <cstdio>

// Child kernel: process one dense region
__global__ void processRegion(float *data, int start, int count) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < count) data[start + i] *= 2.0f;
}

// Parent kernel: decide which regions need processing
__global__ void adaptiveParent(float *data, float *density, int nRegions, int regionSize) {
    int r = blockIdx.x * blockDim.x + threadIdx.x;
    if (r >= nRegions) return;

    if (density[r] > 0.5f) {
        // Launch a child kernel only for dense regions
        int start = r * regionSize;
        int tpb   = 128;
        int blocks = (regionSize + tpb - 1) / tpb;
        processRegion<<<blocks, tpb>>>(data, start, regionSize);
    }
    // No cudaDeviceSynchronize here: parent continues immediately
    // If parent needs child results, call cudaDeviceSynchronize() after all launches
}

int main() {
    const int REGIONS = 64, REGION_SIZE = 1024;
    const int N = REGIONS * REGION_SIZE;

    float *d_data, *d_density;
    cudaMalloc(&d_data,    N * sizeof(float));
    cudaMalloc(&d_density, REGIONS * sizeof(float));

    // Must use -rdc=true and -lcudadevrt to compile this example
    adaptiveParent<<<(REGIONS + 31) / 32, 32>>>(d_data, d_density, REGIONS, REGION_SIZE);
    cudaDeviceSynchronize();

    cudaFree(d_data);
    cudaFree(d_density);
}`,
  },

  // ─── 17. Multi-GPU Programming ───────────────────────────────────────────
  {
    slug: "multi-gpu",
    title: "Multi-GPU Programming",
    category: "Parallelism",
    order: 17,
    relatedProjects: ["image-processing-pipeline"],
    relatedConcepts: ["cuda-streams", "cuda-memory-hierarchy", "global-memory-coalescing"],
    content: `# Multi-GPU Programming

Modern AI and HPC systems use 2–8 GPUs connected via PCIe or NVLink. CUDA exposes each GPU as a separate device; you must explicitly manage which device is active and how data moves between them.

## Enumerating Devices

\`\`\`c
int deviceCount;
cudaGetDeviceCount(&deviceCount);

for (int i = 0; i < deviceCount; i++) {
    cudaDeviceProp prop;
    cudaGetDeviceProperties(&prop, i);
    printf("Device %d: %s, %.0f GB, %d SMs, PCIe gen%d x%d\\n",
        i, prop.name,
        prop.totalGlobalMem / 1e9,
        prop.multiProcessorCount,
        prop.pciBusID,  // useful for identifying physical slots
        prop.pciDeviceID);
}
\`\`\`

## Setting the Active Device

Each host thread has a **current device** — all CUDA calls apply to it:

\`\`\`c
cudaSetDevice(0);          // GPU 0 is active
float *d0; cudaMalloc(&d0, bytes);

cudaSetDevice(1);          // Switch to GPU 1
float *d1; cudaMalloc(&d1, bytes);
\`\`\`

For multi-threaded host code, each thread should call \`cudaSetDevice\` independently. Consider using one CPU thread per GPU.

## Peer-to-Peer (P2P) Access

When GPUs are connected via NVLink or PCIe peer mapping, they can read/write each other's memory directly — no host staging copy needed:

\`\`\`c
int canAccess;
cudaDeviceCanAccessPeer(&canAccess, 0, 1);  // can GPU 0 access GPU 1?

if (canAccess) {
    cudaSetDevice(0);
    cudaDeviceEnablePeerAccess(1, 0);  // GPU 0 can now read d1

    // Direct GPU0 → GPU1 copy (goes over NVLink, not PCIe+host)
    cudaMemcpyPeer(d1, 1, d0, 0, bytes);
}
\`\`\`

NVLink bandwidth (A100): 600 GB/s bidirectional (vs ~32 GB/s PCIe Gen4 x16).

## Unified Virtual Addressing (UVA)

On systems with UVA, all device and pinned host pointers occupy a single virtual address space. \`cudaMemcpy\` infers direction from the pointer value — no need to specify \`cudaMemcpyPeer\`:

\`\`\`c
// With UVA active (Pascal+ on 64-bit Linux), direction is automatic
cudaMemcpy(d1, d0, bytes, cudaMemcpyDefault);  // cudaMemcpyDefault infers direction
\`\`\`

## NCCL: Multi-GPU Collective Communication

For distributed reductions, broadcasts, and all-reduce (the core of data-parallel training), use **NCCL**:

\`\`\`c
#include <nccl.h>

ncclComm_t comms[NUM_GPUS];
int devs[NUM_GPUS] = {0, 1, 2, 3};
ncclCommInitAll(comms, NUM_GPUS, devs);

// All-reduce: sum d_buf across all GPUs, result on every GPU
ncclGroupStart();
for (int i = 0; i < NUM_GPUS; i++) {
    cudaSetDevice(devs[i]);
    ncclAllReduce(d_buf[i], d_buf[i], N, ncclFloat, ncclSum, comms[i], streams[i]);
}
ncclGroupEnd();
\`\`\`

## Data Partitioning Strategies

| Strategy | Use when |
|---|---|
| **Data parallelism** — split input across GPUs | Same model, different batches (DL training) |
| **Model parallelism** — split layers across GPUs | Model too large for one GPU (LLMs) |
| **Domain decomposition** — split spatial domain | Simulations with boundary exchange |
| **Pipeline parallelism** — stage GPUs in sequence | Long sequential stages with different memory requirements |`,
    codeExample: `// Multi-GPU vector add: split N/2 to GPU 0, N/2 to GPU 1
#include <cuda_runtime.h>
#include <cstdio>

__global__ void vecAdd(const float *a, const float *b, float *c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}

int main() {
    const int N    = 1 << 20;      // 1M elements total
    const int HALF = N / 2;
    const size_t HALF_BYTES = HALF * sizeof(float);

    // Host data (pinned for async transfers)
    float *h_a, *h_b, *h_c;
    cudaMallocHost(&h_a, N * sizeof(float));
    cudaMallocHost(&h_b, N * sizeof(float));
    cudaMallocHost(&h_c, N * sizeof(float));
    for (int i = 0; i < N; i++) { h_a[i] = 1.0f; h_b[i] = 2.0f; }

    float *d_a[2], *d_b[2], *d_c[2];
    cudaStream_t s[2];

    for (int d = 0; d < 2; d++) {
        cudaSetDevice(d);
        cudaMalloc(&d_a[d], HALF_BYTES);
        cudaMalloc(&d_b[d], HALF_BYTES);
        cudaMalloc(&d_c[d], HALF_BYTES);
        cudaStreamCreate(&s[d]);
    }

    // Upload each half to its GPU and launch
    for (int d = 0; d < 2; d++) {
        cudaSetDevice(d);
        int offset = d * HALF;
        cudaMemcpyAsync(d_a[d], h_a + offset, HALF_BYTES, cudaMemcpyHostToDevice, s[d]);
        cudaMemcpyAsync(d_b[d], h_b + offset, HALF_BYTES, cudaMemcpyHostToDevice, s[d]);
        int tpb = 256, blocks = (HALF + tpb - 1) / tpb;
        vecAdd<<<blocks, tpb, 0, s[d]>>>(d_a[d], d_b[d], d_c[d], HALF);
        cudaMemcpyAsync(h_c + offset, d_c[d], HALF_BYTES, cudaMemcpyDeviceToHost, s[d]);
    }

    // Wait for both GPUs
    for (int d = 0; d < 2; d++) {
        cudaSetDevice(d);
        cudaStreamSynchronize(s[d]);
    }

    printf("c[0]=%.0f c[N-1]=%.0f (expected 3)\\n", h_c[0], h_c[N-1]);
    // cleanup omitted for brevity
}`,
  },

  // ─── 18. Thrust and CUB ──────────────────────────────────────────────────
  {
    slug: "thrust-cub",
    title: "Thrust and CUB: GPU Algorithm Libraries",
    category: "Algorithms",
    order: 18,
    relatedProjects: ["reduction-variants", "histogram", "parallel-scan"],
    relatedConcepts: ["parallel-reduction", "parallel-scan", "atomic-operations"],
    content: `# Thrust and CUB: GPU Algorithm Libraries

Writing optimized CUDA kernels from scratch for every standard algorithm is unnecessary — NVIDIA provides two libraries that cover most data-parallel primitives at near-peak performance.

## Thrust: High-Level STL-Like Interface

Thrust mirrors the C++ STL (\`<algorithm>\`, \`<numeric>\`) for GPU execution. It works with both device vectors and raw pointers.

\`\`\`cpp
#include <thrust/device_vector.h>
#include <thrust/transform.h>
#include <thrust/reduce.h>
#include <thrust/sort.h>

thrust::device_vector<float> d_vec(1 << 20, 1.0f);

// Transform: square every element
thrust::transform(d_vec.begin(), d_vec.end(), d_vec.begin(),
                  [] __device__ (float x) { return x * x; });

// Reduce: sum all elements
float total = thrust::reduce(d_vec.begin(), d_vec.end(), 0.0f, thrust::plus<float>());

// Sort in ascending order
thrust::sort(d_vec.begin(), d_vec.end());

// Exclusive scan: prefix sum
thrust::device_vector<float> d_scan(d_vec.size());
thrust::exclusive_scan(d_vec.begin(), d_vec.end(), d_scan.begin());
\`\`\`

### Useful Thrust Algorithms

| Algorithm | Function |
|---|---|
| \`thrust::reduce\` | Reduction (sum, max, min, custom) |
| \`thrust::inclusive_scan / exclusive_scan\` | Prefix scan |
| \`thrust::sort / sort_by_key\` | Radix sort (keys only or key-value pairs) |
| \`thrust::copy_if\` | Stream compaction (filter elements) |
| \`thrust::transform_reduce\` | Fused map + reduce |
| \`thrust::unique\` | Remove consecutive duplicates |
| \`thrust::scatter / gather\` | Indexed copy |
| \`thrust::fill / sequence\` | Initialize vectors |

## CUB: Block-Level and Device-Level Primitives

CUB (CUDA UnBound) is lower-level than Thrust and designed for use inside kernels. It provides optimized collective operations for thread blocks and warps.

### Device-Level (Host API — entire array)

\`\`\`cpp
#include <cub/cub.cuh>

float *d_in, *d_out;
int N = 1 << 24;

// Determine temporary storage size
void   *d_temp = nullptr;
size_t  temp_bytes = 0;
cub::DeviceReduce::Sum(d_temp, temp_bytes, d_in, d_out, N);  // query pass

cudaMalloc(&d_temp, temp_bytes);

// Actual reduction
cub::DeviceReduce::Sum(d_temp, temp_bytes, d_in, d_out, N);
cudaDeviceSynchronize();
\`\`\`

### Block-Level (Inside Kernels)

\`\`\`cpp
__global__ void myKernel(float *data, float *block_sums, int n) {
    using BlockReduce = cub::BlockReduce<float, 256>;
    __shared__ typename BlockReduce::TempStorage temp;

    int i = blockIdx.x * blockDim.x + threadIdx.x;
    float val = (i < n) ? data[i] : 0.f;

    // CUB handles the shared-memory tree reduction automatically
    float block_sum = BlockReduce(temp).Sum(val);

    if (threadIdx.x == 0) block_sums[blockIdx.x] = block_sum;
}
\`\`\`

### Warp-Level (Inside Kernels)

\`\`\`cpp
using WarpScan = cub::WarpScan<float>;
__shared__ WarpScan::TempStorage temp[WARPS];
float prefix_sum;
WarpScan(temp[warpId]).InclusiveSum(val, prefix_sum);
\`\`\`

## Thrust vs. CUB: When to Use Each

| Criterion | Thrust | CUB |
|---|---|---|
| Ease of use | High (STL-like) | Medium (more boilerplate) |
| Flexibility | Limited to provided algorithms | Mix with custom kernel logic |
| Use from host | Yes | Device-level APIs yes; block/warp level from inside kernels |
| Custom operators | Lambda functions | Custom functors |
| Performance | Near-peak | Peak (tuned per architecture) |

**Rule of thumb:** Use Thrust for standalone data-parallel steps. Use CUB when you need to fuse a standard primitive with custom logic inside a kernel.`,
    codeExample: `// Thrust: sort, scan, and stream compaction in a few lines
#include <thrust/device_vector.h>
#include <thrust/sort.h>
#include <thrust/scan.h>
#include <thrust/copy.h>
#include <cstdio>

int main() {
    const int N = 16;
    thrust::device_vector<int> d(N);

    // Fill: 15, 14, 13, ..., 0
    thrust::sequence(d.begin(), d.end(), N-1, -1);

    // Sort ascending: 0, 1, 2, ..., 15
    thrust::sort(d.begin(), d.end());

    // Inclusive scan: 0, 1, 3, 6, 10, 15, 21, ...
    thrust::device_vector<int> scan(N);
    thrust::inclusive_scan(d.begin(), d.end(), scan.begin());

    // Stream compaction: keep only even numbers
    thrust::device_vector<int> evens(N);
    auto end = thrust::copy_if(d.begin(), d.end(), evens.begin(),
                               [] __device__ (int x) { return x % 2 == 0; });
    evens.resize(end - evens.begin());

    printf("Sorted[0..3]: %d %d %d %d\\n", (int)d[0], (int)d[1], (int)d[2], (int)d[3]);
    printf("Scan[0..3]:   %d %d %d %d\\n", (int)scan[0], (int)scan[1], (int)scan[2], (int)scan[3]);
    printf("Even count: %d\\n", (int)evens.size());  // 8: 0,2,4,6,8,10,12,14
}`,
  },

  // ─── 19. Texture Memory and Surface Memory ───────────────────────────────
  {
    slug: "texture-surface-memory",
    title: "Texture Memory and Surface Memory",
    category: "Memory",
    order: 19,
    relatedProjects: ["image-processing-pipeline"],
    relatedConcepts: ["cuda-memory-hierarchy", "global-memory-coalescing", "shared-memory"],
    content: `# Texture Memory and Surface Memory

CUDA provides hardware-accelerated **texture memory** (read-only, cached, with filtering) and **surface memory** (read-write image objects). Both are backed by global DRAM but accessed through a dedicated texture/surface cache optimized for 2D spatial locality.

## Why Texture Cache?

Global memory cache (L1/L2) is optimized for 1D coalesced access. The **texture cache** is optimized for **2D spatial locality** — if you read pixel (x, y), the hardware prefetches its neighbors. This helps image processing stencils where access patterns include (x±1, y±1) neighborhoods.

Additional hardware features:
- **Automatic boundary handling:** clamp, wrap, or mirror at image edges — no manual bounds checks
- **Hardware bilinear/trilinear interpolation:** free hardware interpolation between texels for float coordinates
- **Normalized coordinates:** address textures using [0.0, 1.0) regardless of actual dimensions

## Texture Objects (CUDA 5.0+, Recommended)

The modern API uses opaque \`cudaTextureObject_t\` handles:

\`\`\`c
// Step 1: allocate a CUDA Array (optimal 2D tiled layout)
cudaArray_t cuArray;
cudaChannelFormatDesc chanDesc = cudaCreateChannelDesc<float>();
cudaMallocArray(&cuArray, &chanDesc, width, height);

// Step 2: copy host data into the array
cudaMemcpy2DToArray(cuArray, 0, 0, h_data,
                    width * sizeof(float), width * sizeof(float), height,
                    cudaMemcpyHostToDevice);

// Step 3: create resource descriptor and texture descriptor
cudaResourceDesc resDesc = {};
resDesc.resType         = cudaResourceTypeArray;
resDesc.res.array.array = cuArray;

cudaTextureDesc texDesc = {};
texDesc.addressMode[0]  = cudaAddressModeClamp;   // boundary handling: x
texDesc.addressMode[1]  = cudaAddressModeClamp;   // boundary handling: y
texDesc.filterMode      = cudaFilterModeLinear;    // bilinear interpolation
texDesc.readMode        = cudaReadModeElementType;
texDesc.normalizedCoords = 0;                      // use integer coordinates

// Step 4: create texture object
cudaTextureObject_t texObj;
cudaCreateTextureObject(&texObj, &resDesc, &texDesc, nullptr);
\`\`\`

\`\`\`c
// In the kernel: read with tex2D
__global__ void blurKernel(cudaTextureObject_t tex, float *out, int W, int H) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x >= W || y >= H) return;

    // tex2D automatically clamps out-of-bounds (no if-guards needed)
    float sum = tex2D<float>(tex, x-1, y-1) + tex2D<float>(tex, x, y-1) + tex2D<float>(tex, x+1, y-1)
              + tex2D<float>(tex, x-1, y  ) + tex2D<float>(tex, x, y  ) + tex2D<float>(tex, x+1, y  )
              + tex2D<float>(tex, x-1, y+1) + tex2D<float>(tex, x, y+1) + tex2D<float>(tex, x+1, y+1);
    out[y * W + x] = sum / 9.0f;
}
\`\`\`

## Surface Memory (Read-Write Images)

Surface memory allows **writes** back to the CUDA Array in a kernel — useful for in-place image processing:

\`\`\`c
cudaSurfaceObject_t surfObj;
cudaResourceDesc surfDesc = {};
surfDesc.resType         = cudaResourceTypeArray;
surfDesc.res.array.array = cuArray;
cudaCreateSurfaceObject(&surfObj, &surfDesc);

// In kernel
__global__ void invertKernel(cudaSurfaceObject_t surf, int W, int H) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x >= W || y >= H) return;

    float val;
    surf2Dread(&val, surf, x * sizeof(float), y);  // read
    surf2Dwrite(1.0f - val, surf, x * sizeof(float), y);  // write
}
\`\`\`

## When to Use Texture vs. Global Memory

| Use texture/surface when | Use global memory when |
|---|---|
| 2D spatial access patterns (image stencils) | 1D coalesced access |
| Need hardware clamping/wrapping at borders | Arbitrary read-write access |
| Bilinear interpolation is useful | Integer indexing only |
| Read-only data accessed irregularly | Data changes every kernel |

## Cleanup

\`\`\`c
cudaDestroyTextureObject(texObj);
cudaDestroySurfaceObject(surfObj);
cudaFreeArray(cuArray);
\`\`\``,
    codeExample: `// 3×3 box blur using texture object — no manual boundary checks
#include <cuda_runtime.h>
#include <cstdio>

__global__ void boxBlur(cudaTextureObject_t tex,
                        float *out, int W, int H) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x >= W || y >= H) return;

    float sum = 0.f;
    for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++)
            sum += tex2D<float>(tex, x + dx, y + dy);  // clamp handles borders

    out[y * W + x] = sum * (1.f / 9.f);
}

int main() {
    const int W = 512, H = 512;
    const int N = W * H;

    // Allocate CUDA Array (2D tiled layout, optimal for texture cache)
    cudaArray_t arr;
    cudaChannelFormatDesc cd = cudaCreateChannelDesc<float>();
    cudaMallocArray(&arr, &cd, W, H);

    // Fill with test data (all 1s)
    float *h = new float[N];
    for (int i = 0; i < N; i++) h[i] = 1.f;
    cudaMemcpy2DToArray(arr, 0, 0, h, W*sizeof(float), W*sizeof(float), H, cudaMemcpyHostToDevice);

    // Create texture object
    cudaResourceDesc rd = {};
    rd.resType = cudaResourceTypeArray;
    rd.res.array.array = arr;

    cudaTextureDesc td = {};
    td.addressMode[0] = td.addressMode[1] = cudaAddressModeClamp;
    td.filterMode     = cudaFilterModePoint;   // nearest-neighbor
    td.readMode       = cudaReadModeElementType;
    td.normalizedCoords = 0;

    cudaTextureObject_t tex;
    cudaCreateTextureObject(&tex, &rd, &td, nullptr);

    float *d_out;
    cudaMalloc(&d_out, N * sizeof(float));

    dim3 block(16, 16), grid((W+15)/16, (H+15)/16);
    boxBlur<<<grid, block>>>(tex, d_out, W, H);
    cudaDeviceSynchronize();

    float h_out;
    cudaMemcpy(&h_out, d_out, sizeof(float), cudaMemcpyDeviceToHost);
    printf("out[0,0] = %.4f (expected 1.0)\\n", h_out);

    cudaDestroyTextureObject(tex);
    cudaFreeArray(arr);
    cudaFree(d_out);
    delete[] h;
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
