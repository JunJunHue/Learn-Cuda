# CUDA Optimization Labs

## Overview

These labs are distinct from the short fill-in-the-blank projects in the main curriculum. Each lab is a multi-hour, multi-phase engineering challenge modeled after university GPU programming course assignments. You will:

- **Build real kernels** from scratch, not fill in blanks
- **Measure performance** at every stage with Nsight Compute or `nvprof`
- **Hit concrete targets** (TFLOPS, GB/s, FPS) rather than just "make it run"
- **Understand the bottleneck** before trying to fix it — roofline analysis required

**Prerequisite path (recommended order):** Lab 4 → Lab 1 → Lab 2 → Lab 3 → Lab 5

Concept slugs reference the site's concept library (e.g., `shared-memory`, `cuda-streams`).

---

## Lab 1: "Beating the Roof" — Optimized SGEMM

**Category:** Optimization | **Difficulty:** Advanced | **Estimated Time:** 3–4 hours

### Learning Objectives

- Understand why naive matrix multiply is memory-bound, not compute-bound
- Apply shared-memory tiling to reuse data and cut global memory traffic
- Use register blocking to increase arithmetic intensity per thread
- Exploit 128-bit vectorized loads for full memory bus utilization
- Overlap data movement with computation via `cp.async` and double buffering

### Prerequisites

Concepts: `shared-memory`, `global-memory-coalescing`, `occupancy`, `tiled-matrix-multiply`, `cuda-profiling`

You should be comfortable writing kernels with `__shared__` arrays and analyzing Nsight Compute's roofline view before starting.

### Phase Breakdown

#### Phase 1 — Naive Global Memory

Each thread computes one `C[row][col]` output element by iterating over the K dimension, loading `A[row][k]` and `B[k][col]` directly from global memory on every iteration.

```cuda
__global__ void sgemm_naive(float* A, float* B, float* C, int M, int N, int K) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    if (row >= M || col >= N) return;
    float acc = 0.0f;
    for (int k = 0; k < K; k++)
        acc += A[row * K + k] * B[k * N + col];
    C[row * N + col] = acc;
}
```

**Measure:** TFLOPS, memory bandwidth utilization, roofline position. Expect ~5–10% of peak FLOPS.

#### Phase 2 — Shared-Memory Tiling (32×32)

Launch 32×32 thread blocks. Each block cooperatively loads a 32×32 tile of A and B into `__shared__` arrays, synchronizes, then computes the partial dot products before moving to the next tile.

```cuda
__global__ void sgemm_tiled(float* A, float* B, float* C, int M, int N, int K) {
    __shared__ float As[32][32];
    __shared__ float Bs[32][32];
    int tx = threadIdx.x, ty = threadIdx.y;
    int row = blockIdx.y * 32 + ty;
    int col = blockIdx.x * 32 + tx;
    float acc = 0.0f;
    for (int t = 0; t < K / 32; t++) {
        As[ty][tx] = A[row * K + t * 32 + tx];
        Bs[ty][tx] = B[(t * 32 + ty) * N + col];
        __syncthreads();
        for (int k = 0; k < 32; k++) acc += As[ty][k] * Bs[k][tx];
        __syncthreads();
    }
    C[row * N + col] = acc;
}
```

**Measure:** Compare TFLOPS vs. Phase 1. Expect 3–5× speedup. Check L1/L2 hit rates in Nsight.

#### Phase 3 — Register Blocking (4×4 per thread)

Restructure so each thread computes a 4×4 sub-tile of C. Load a 128×8 tile of A and 8×128 tile of B into shared memory; each thread owns 4 rows × 4 cols of the output. This dramatically reduces the shared memory load-to-compute ratio.

```cuda
// Each thread accumulates into float acc[4][4]
// Tile size: BM=128, BN=128, BK=8
// Thread block: 32x32 (1024 threads), each does 4x4 output
```

**Measure:** Expect significant reduction in shared memory transactions, higher FLOPS. Target: >50% peak.

#### Phase 4 — Vectorized Loads (`float4`)

Replace scalar `float` loads with `float4` (128-bit) to fully utilize the memory bus. Both the global→shared load and the shared→register load should use `float4`.

```cuda
float4 a4 = reinterpret_cast<float4*>(&A[row * K + t * BK])[tx];
// Store into shared memory as individual floats for flexible indexing
```

**Measure:** Check Nsight's "Memory Throughput" metric. Should approach peak HBM bandwidth.

#### Phase 5 — Double Buffering with `cp.async`

Use two shared memory buffers (ping-pong). While the math unit processes tile `t`, initiate an async copy of tile `t+1` via `__pipeline_memcpy_async`. Requires `#include <cuda/pipeline>`.

```cuda
// Double-buffered shared memory
__shared__ float As[2][BM][BK];
__shared__ float Bs[2][BK][BN];
// Use cuda::pipeline or cp.async intrinsics
// Alternate between buffer 0 and buffer 1 each tile iteration
```

**Measure:** Math-to-memory latency overlap. Target: >70% cuBLAS throughput on A100/V100.

### Success Metrics

| Stage | Target TFLOPS (A100) | % of cuBLAS |
|-------|---------------------|-------------|
| Naive | ~2–5 | ~3–7% |
| Tiled | ~15–25 | ~20–35% |
| Register blocking | ~40–55 | ~55–75% |
| Vectorized | ~50–65 | ~70–90% |
| Double buffered | ~55–70 | ~75–95% |

**Deliverable:** Roofline plot (matplotlib or Nsight export) showing each stage's arithmetic intensity vs. TFLOPS. Final kernel must exceed 70% cuBLAS throughput.

### Concept Links

`tiled-matrix-multiply` · `shared-memory` · `global-memory-coalescing` · `occupancy` · `cuda-profiling`

---

## Lab 2: "Seeing the Light" — GPU Ray Tracer

**Category:** Parallelism | **Difficulty:** Intermediate–Advanced | **Estimated Time:** 3–5 hours

### Learning Objectives

- Map embarrassingly parallel workloads (pixels) to threads
- Diagnose and mitigate warp divergence caused by ray termination
- Implement a BVH for O(log N) intersection tests
- Use CUDA streams to overlap rendering with host I/O

### Prerequisites

Concepts: `gpu-thread-hierarchy`, `warp-execution`, `cuda-streams`, `cuda-memory-hierarchy`

Basic ray-sphere intersection math (provided in starter code). Familiarity with Phong shading model.

### Phase Breakdown

#### Phase 1 — Baseline: One Thread per Pixel

Assign one thread to each pixel. For each thread: cast a ray from the camera, test against all spheres (O(N) loop), compute Phong shading (ambient + diffuse + specular + shadow ray), write `uchar4` RGBA to output buffer.

```cuda
__global__ void render(uchar4* fb, int width, int height,
                       Sphere* spheres, int num_spheres, Camera cam) {
    int px = blockIdx.x * blockDim.x + threadIdx.x;
    int py = blockIdx.y * blockDim.y + threadIdx.y;
    if (px >= width || py >= height) return;
    Ray ray = make_ray(cam, px, py, width, height);
    float3 color = trace(ray, spheres, num_spheres);
    fb[py * width + px] = to_uchar4(color);
}
```

**Measure:** Rays/second, warp efficiency (Nsight: "Warp State Statistics").

#### Phase 2 — BVH Acceleration

Build a bounding volume hierarchy on the CPU before the kernel launch. Pass a flattened BVH node array to the GPU. Each thread traverses the BVH iteratively (stack-based, ~32-deep) instead of looping over all spheres.

```cuda
struct BVHNode {
    float3 aabb_min, aabb_max;
    int left_child;  // -1 if leaf
    int right_child; // -1 if leaf
    int sphere_idx;  // valid if leaf
};
// GPU traversal uses a local stack: int stack[32]; int sp = 0;
```

**Measure:** Compare rays/second vs. Phase 1 with 1000+ spheres. Expect 5–20× speedup.

#### Phase 3 — Russian Roulette Path Tracing

Replace Phong with Monte Carlo path tracing: at each bounce, sample a random hemisphere direction, accumulate radiance, and use Russian roulette (terminate with probability proportional to throughput) to keep variance bounded.

```cuda
// Each thread maintains: float3 throughput = {1,1,1}; float3 radiance = {0,0,0};
// Loop up to MAX_DEPTH bounces; at each: sample BRDF, update throughput, test for light hit
// Russian roulette: if (curand_uniform(&state) > max(throughput)) break;
```

**Measure:** Warp divergence will increase — measure "Warp Cycles Per Issued Instruction". Add multiple samples per pixel in Phase 4 to reduce noise.

#### Phase 4 — Anti-Aliasing (Multi-Sample)

Render S samples per pixel by calling the path tracer S times with different random seeds and averaging results. Two approaches to compare:
- **Atomic accumulation:** `atomicAdd` into a `float3` framebuffer, normalize after all samples
- **Reduction:** Re-launch kernel for each sample, accumulate in a secondary float buffer, do one final normalization pass

**Measure:** Image quality (PSNR vs. ground truth), throughput (total samples/second).

#### Phase 5 — Stream Pipelining

Divide the image into horizontal tiles. Use two CUDA streams: while stream A renders tile `i`, stream B transfers the finished pixels of tile `i-1` to host memory via `cudaMemcpyAsync`, where a CPU thread encodes them as PNG rows.

```cuda
cudaStream_t streams[2];
for (int tile = 0; tile < num_tiles; tile++) {
    int s = tile % 2;
    render<<<grid, block, 0, streams[s]>>>(tile_buf[s], ...);
    cudaMemcpyAsync(host_buf[s], tile_buf[s], tile_bytes, D2H, streams[s]);
}
```

**Measure:** Wall-clock time for a 1920×1080 render vs. serialized version. Target: >30% reduction.

### Success Metrics

- 1920×1080 PNG output with correct shadows, reflections, and anti-aliasing
- BVH achieves >5× speedup over naive intersection with 500 spheres
- Stream pipelining reduces total wall-clock time by >25%
- Warp efficiency documented at each stage (Nsight report)

### Concept Links

`gpu-thread-hierarchy` · `warp-execution` · `cuda-streams` · `cuda-memory-hierarchy` · `atomic-operations`

---

## Lab 3: "Memory-Efficient Attention" — Flash Attention from First Principles

**Category:** Memory | **Difficulty:** Advanced | **Estimated Time:** 4–5 hours

### Learning Objectives

- Understand why naive attention is HBM bandwidth-bound, not compute-bound
- Implement block-level tiling to avoid materializing the N×N attention matrix
- Derive and implement the online softmax normalization trick
- Apply causal masking within tile boundaries without extra passes
- Implement the backward pass through tiled attention (recompute instead of store)

### Prerequisites

Concepts: `shared-memory` · `global-memory-coalescing` · `cuda-profiling` · `tiled-matrix-multiply`

Linear algebra background: matrix multiplication, softmax, attention mechanism. Familiarity with PyTorch for reference comparison.

### Phase Breakdown

#### Phase 1 — Naive Attention (O(N²) Memory)

Materialize the full N×N score matrix in global memory: compute `S = QKᵀ / sqrt(d)`, apply softmax row-wise, then compute `O = softmax(S) · V`.

```cuda
// Step 1: S[i][j] = dot(Q[i], K[j]) / sqrt(d)  — N×N matrix
// Step 2: softmax each row of S in place
// Step 3: O[i] = sum_j S[i][j] * V[j]
// Memory: O(N²) for S alone — prohibitive for N=4096+
```

**Measure:** HBM reads/writes (Nsight: "Memory Workload Analysis"). For N=2048, d=64, count exact bytes moved.

#### Phase 2 — Tiled Attention (Flash Attention v1)

Partition Q into row tiles (size Br) and K, V into column tiles (size Bc). Process one (Q-tile, KV-tile) pair at a time. Keep a running output accumulator `O_tile` and running softmax statistics `(m, l)` in registers. Never write the full S matrix to HBM.

```cuda
// For each Q-tile (outer loop):
//   Initialize: m = -inf, l = 0, O = 0
//   For each KV-tile (inner loop):
//     Load Q_tile, K_tile, V_tile into shared memory
//     Compute S_tile = Q_tile @ K_tile^T  (BrxBc block)
//     Update running softmax stats
//     Accumulate O contribution from V_tile
//   Write final O_tile to HBM
```

**Measure:** Compare HBM reads/writes vs. Phase 1. Target: O(N) rather than O(N²) memory traffic.

#### Phase 3 — Online Softmax

Implement the "safe softmax" online normalization. For each new K/V tile, update the running maximum `m_new = max(m_old, rowmax(S_tile))`, rescale the existing accumulator by `exp(m_old - m_new)`, then add the new contribution.

```cuda
// For each KV tile:
float m_new = max(m_old, tile_rowmax(S_tile));
float l_new = exp(m_old - m_new) * l_old + rowsum(exp(S_tile - m_new));
O = exp(m_old - m_new) * O + exp(S_tile - m_new) @ V_tile;
m_old = m_new; l_old = l_new;
// Final: O = O / l_old
```

This single-pass fusion eliminates the need for a second pass to apply softmax after seeing all K/V pairs.

**Measure:** Kernel launch count should drop to O(N/Bc) vs. multiple passes in Phase 2.

#### Phase 4 — Causal Masking

For autoregressive models, token `i` must not attend to token `j > i`. Within each S_tile, identify which elements are above the diagonal (future tokens) and set them to `-inf` before the online softmax update. Only tiles on the diagonal require masking; tiles strictly below the diagonal are fully valid.

```cuda
// Tile (q_tile_idx, kv_tile_idx):
// If q_start >= kv_end: no masking needed (all past)
// If q_start < kv_start: set entire tile to -inf (all future)
// If q_start < kv_end: apply element-wise causal mask
bool is_future = (kv_col_idx > q_row_idx);  // within tile
S_tile[i][j] = is_future ? -INFINITY : S_tile[i][j];
```

**Measure:** Throughput (TFLOPS) for causal vs. full attention with N=1024, 2048, 4096.

#### Phase 5 — Backward Pass

Implement gradient computation. Key insight: recompute the attention matrix S during the backward pass instead of storing it (this is Flash Attention's memory saving in the backward direction too).

Gradients needed: `dQ`, `dK`, `dV`. Recompute `S_tile` from stored `Q`, `K`, then compute:
- `dV += softmax(S_tile)ᵀ · dO_tile`
- `dS_tile = dO_tile · Vᵀ`
- `dQ += dS_tile · K_tile`
- `dK += dS_tile ᵀ · Q_tile`

**Measure:** Memory overhead of backward pass vs. storing the full N×N attention weights. Compare throughput to `torch.autograd` on the naive attention.

### Success Metrics

- Phase 2+ never allocates an N×N matrix in global memory (verify with `cuda-memcheck`)
- HBM traffic ≤ 5× (Q+K+V+O) for forward pass at N=4096
- Throughput within <10% of PyTorch `F.scaled_dot_product_attention` on A100
- Backward pass produces correct gradients (match `torch.autograd` to 1e-3 tolerance)

### Concept Links

`shared-memory` · `tiled-matrix-multiply` · `global-memory-coalescing` · `cuda-profiling` · `tensor-cores`

---

## Lab 4: "Sorting the Chaos" — High-Performance Parallel Radix Sort

**Category:** Algorithms | **Difficulty:** Intermediate | **Estimated Time:** 3–4 hours

### Learning Objectives

- Implement a work-efficient exclusive prefix scan (Blelloch algorithm)
- Understand histogram privatization to eliminate atomic contention
- Build a full radix sort pipeline: histogram → scan → scatter
- Tune digit width (4-bit vs. 8-bit) for occupancy vs. pass-count tradeoff

### Prerequisites

Concepts: `parallel-scan` · `parallel-reduction` · `atomic-operations` · `shared-memory` · `occupancy`

Comfort with binary representation and positional notation (base-256 decomposition of 32-bit integers).

### Phase Breakdown

#### Phase 1 — Naive Counting Sort with Global Atomics

For one radix digit (8-bit = values 0–255), each thread reads its key, extracts the 8-bit digit, and increments `global_histogram[digit]` via `atomicAdd`. Then compute prefix sum on CPU and scatter.

```cuda
__global__ void histogram_naive(uint32_t* keys, int* hist, int n, int shift) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;
    uint8_t digit = (keys[i] >> shift) & 0xFF;
    atomicAdd(&hist[digit], 1);
}
```

**Measure:** Throughput (keys/s), atomic contention (Nsight: "L2 Global Atomic"). Expect severe serialization.

#### Phase 2 — Privatized Histograms

Each thread block maintains its own 256-bin histogram in `__shared__` memory using `atomicAdd` (intra-block, fast). After all threads finish, one warp does a reduction across thread-block histograms to form the global histogram.

```cuda
__shared__ int local_hist[256];
// Initialize local_hist to 0
// Each thread: atomicAdd(&local_hist[digit], 1)
// __syncthreads();
// Warp 0: atomicAdd(&global_hist[tid], local_hist[tid])  (256 threads)
```

**Measure:** Compare L2 atomic traffic vs. Phase 1. Expect 10–50× reduction in atomic operations.

#### Phase 3 — Blelloch Exclusive Prefix Scan

Implement an exclusive scan over the 256-bin global histogram to produce scatter offsets. Use the Blelloch (work-efficient) algorithm: upsweep (reduce) then downsweep, both in shared memory.

```cuda
// Upsweep (reduce in place):
for (int stride = 1; stride < n; stride *= 2)
    if (tid % (2*stride) == 2*stride-1) s[tid] += s[tid - stride];
// Set root to 0
s[n-1] = 0;
// Downsweep:
for (int stride = n/2; stride >= 1; stride /= 2) {
    int temp = s[tid]; s[tid] += s[tid - stride]; s[tid - stride] = temp;
}
```

**Verify:** Output[0] == 0, Output[i] == sum(Input[0..i-1]) for all i. Sum of all histogram bins == N.

**Measure:** Compare to `thrust::exclusive_scan`. Should match output exactly.

#### Phase 4 — Scatter Phase

Using the prefix-scanned offsets, each thread writes its key to its final position. To avoid conflicts, use a two-level scatter: each block scatters into a local staging buffer (shared memory), then the block writes contiguous output to global memory.

```cuda
// Local pass: sort within block using local histogram + scan
// Each thread: output[scan_offset[digit] + local_rank] = key
// local_rank = position of this key among same-digit keys in this block
```

**Measure:** Memory access pattern — should be nearly coalesced for uniform distributions. Check for correctness with `thrust::is_sorted`.

#### Phase 5 — Multi-Pass Radix and Digit Width Comparison

Generalize to full 32-bit sort: with 8-bit digit width, 4 passes over the key array suffice. Compare against using 4-bit digits (16 bins, 8 passes). Measure total throughput for each configuration on 100M keys.

```
8-bit: 4 passes × (histogram + scan + scatter) = 12 kernel launches
4-bit: 8 passes × (histogram + scan + scatter) = 24 kernel launches
```

**Measure:** Total time (ms) for 100M uint32 sort. Compare vs. `thrust::sort`. Target: exceed 2 GB/s, beat `std::sort` by >20×.

### Success Metrics

| Metric | Target |
|--------|--------|
| 100M uint32 sort throughput | >2 GB/s |
| vs. `std::sort` (single-threaded) | >20× faster |
| vs. `thrust::sort` | Within 2× |
| Correctness | `thrust::is_sorted` returns true |

**Deliverable:** Bar chart comparing throughput across all 5 stages, plus a 4-bit vs. 8-bit digit-width comparison.

### Concept Links

`parallel-scan` · `parallel-reduction` · `atomic-operations` · `shared-memory` · `occupancy` · `thrust-cub`

---

## Lab 5: "Fluid on the GPU" — Smoothed Particle Hydrodynamics (SPH)

**Category:** Algorithms | **Difficulty:** Advanced | **Estimated Time:** 4–6 hours

### Learning Objectives

- Implement a GPU spatial hash to turn O(N²) neighbor search into O(N)
- Use shared memory to load neighbor cell data cooperatively
- Fuse multiple physics passes into fewer kernel launches
- Integrate CUDA-OpenGL interop to eliminate CPU-GPU copy overhead for visualization

### Prerequisites

Concepts: `shared-memory` · `atomic-operations` · `cuda-streams` · `gpu-thread-hierarchy` · `occupancy`

Familiarity with basic fluid simulation (density, pressure, viscosity). CUDA-OpenGL interop requires an OpenGL context (GLFW + GLAD starter code provided).

### Phase Breakdown

#### Phase 1 — CPU Baseline (O(N²) Reference)

Write a single-threaded CPU SPH implementation. For each particle `i`, iterate over all `j ≠ i`, compute the distance, and accumulate density, pressure force, and viscosity if `dist < smoothing_radius h`.

```cpp
// CPU reference (not CUDA):
for (int i = 0; i < N; i++) {
    float density = 0;
    for (int j = 0; j < N; j++) {
        float r = length(pos[j] - pos[i]);
        if (r < h) density += mass * W_poly6(r, h);
    }
    rho[i] = density;
}
```

**Measure:** Time per frame for N=4K, 8K, 16K. This is your correctness reference — all GPU stages must match to within 1% RMS error in final particle positions after 100 steps.

#### Phase 2 — Uniform Spatial Grid (O(N) Neighbor Search)

Hash each particle into a 3D grid cell. For each particle `i`, only check particles in the 27 neighboring cells (3×3×3). GPU steps:

1. `build_grid`: compute cell index per particle, sort particles by cell (use `thrust::sort_by_key`)
2. `find_cell_ranges`: scan sorted array to find start/end index of each cell in `cell_start[]`, `cell_end[]`
3. `compute_density`: for each particle `i`, iterate over 27 neighbor cells using `cell_start`/`cell_end`

```cuda
__global__ void compute_density(float3* pos, float* rho, int* cell_start,
                                 int* cell_end, float h, int N) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= N) return;
    int3 cell = world_to_cell(pos[i], h);
    float density = 0;
    for (int dz = -1; dz <= 1; dz++)
    for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
        int neighbor_cell = hash_cell(cell + int3{dx,dy,dz});
        for (int j = cell_start[neighbor_cell]; j < cell_end[neighbor_cell]; j++)
            density += mass * W_poly6(length(pos[j] - pos[i]), h);
    }
    rho[i] = density;
}
```

**Measure:** Frames/second vs. Phase 1 for N=65K. Expect 100–500× speedup. Verify correctness.

#### Phase 3 — Shared Memory Neighbor Loading

For each thread block processing particles in cell `c`, load all particles from the 27 neighboring cells into a shared memory buffer before the force loop. This reduces the number of global memory loads from O(27×avg_cell_pop × threads_per_block) to O(neighbor_count).

```cuda
__shared__ float3 neighbor_pos[MAX_NEIGHBORS];
__shared__ float  neighbor_rho[MAX_NEIGHBORS];
// Cooperative load: use all threads to fill neighbor_pos/rho
// Then each thread iterates over shared buffer for force computation
```

**Measure:** L1/L2 hit rate before and after. Expect meaningful improvement when average cell occupancy > 4 particles.

#### Phase 4 — Kernel Fusion (Density + Pressure + Viscosity)

Combine the separate density, pressure force, and viscosity force kernel launches into a single fused kernel. Compute density for particle `i` first (inner loop over neighbors), then immediately compute pressure/viscosity forces using the freshly computed densities — no second global memory round-trip for density.

```cuda
__global__ void sph_fused(float3* pos, float3* vel, float3* force,
                            float* rho, float* pres, float h, int N) {
    // Phase A: compute density (neighbor loop)
    // Phase B: compute pressure and viscosity forces using density from Phase A
    // Write only: force[i] — no intermediate rho write required if stored in register
}
```

**Measure:** Kernel launch overhead reduction. Compare wall-clock frame time vs. Phase 3. Also measure register usage (may constrain occupancy).

#### Phase 5 — CUDA-OpenGL Interoperability

Register an OpenGL Vertex Buffer Object (VBO) with CUDA via `cudaGraphicsGLRegisterBuffer`. The integration kernel writes particle positions directly into the VBO — no CPU-side `cudaMemcpy` needed. The display loop alternates: CUDA physics update → OpenGL render.

```cuda
// Setup (once):
cudaGraphicsGLRegisterBuffer(&cuda_vbo_resource, vbo, cudaGraphicsMapFlagsWriteDiscard);

// Per frame:
cudaGraphicsMapResources(1, &cuda_vbo_resource, 0);
float3* d_vbo_ptr;
size_t num_bytes;
cudaGraphicsResourceGetMappedPointer((void**)&d_vbo_ptr, &num_bytes, cuda_vbo_resource);
update_particles<<<grid, block>>>(d_vbo_ptr, vel, force, dt, N);
cudaGraphicsUnmapResources(1, &cuda_vbo_resource, 0);
glDrawArrays(GL_POINTS, 0, N);  // GPU renders directly from updated VBO
```

**Measure:** Frame time with vs. without interop (vs. `cudaMemcpy` to host and re-upload). Target: >30 FPS at N=65K in a 3D container with one static obstacle.

### Success Metrics

| Metric | Target |
|--------|--------|
| N=65K simulation FPS | >30 FPS |
| Correctness vs. CPU baseline | <1% RMS particle position error after 100 steps |
| Speedup vs. CPU O(N²) at N=16K | >200× |
| With CUDA-OpenGL interop | No CPU-GPU copy in the render loop |

**Deliverable:** Real-time visualization (OpenGL window) or, if no display available, a 300-frame particle position export validated against the CPU reference.

### Concept Links

`shared-memory` · `atomic-operations` · `occupancy` · `gpu-thread-hierarchy` · `cuda-streams` · `thrust-cub`

---

## Curriculum Sequence

### Recommended Order

```
Lab 4 (Radix Sort)
  └─► Lab 1 (SGEMM)
        └─► Lab 3 (Flash Attention)

Lab 2 (Ray Tracer)  ← can do in parallel with Lab 1

Lab 5 (SPH)  ← requires comfort with Labs 1 & 4 first
```

**Rationale:**
- **Lab 4 first:** Prefix scan and histogram privatization are foundational patterns that appear in Labs 1, 3, and 5. Doing it first builds intuition for parallelism bottlenecks.
- **Lab 1 after Lab 4:** SGEMM is the universal optimization benchmark. The roofline intuition from Lab 1 informs all subsequent labs.
- **Lab 2 is self-contained:** Ray tracing primarily teaches divergence and streams, not memory hierarchy. It can slot in anytime after completing the basic concepts track.
- **Lab 3 after Lab 1:** Flash Attention builds directly on tiled GEMM from Lab 1. Many of the shared-memory patterns are identical.
- **Lab 5 last:** SPH combines spatial hashing, kernel fusion, shared memory, streams, and OpenGL interop — the broadest set of concepts. Best done when the other labs are done.

---

## CUDA Features by Lab

| Feature | Lab 1 | Lab 2 | Lab 3 | Lab 4 | Lab 5 |
|---------|-------|-------|-------|-------|-------|
| Shared memory tiling | ✓✓✓ | | ✓✓✓ | ✓✓ | ✓✓ |
| Register blocking | ✓✓✓ | | ✓ | | |
| Warp divergence | | ✓✓✓ | | | ✓ |
| Prefix scan | | | | ✓✓✓ | |
| Atomics | | ✓ | | ✓✓✓ | ✓✓ |
| CUDA streams | ✓ | ✓✓✓ | | | ✓✓ |
| Vectorized loads | ✓✓✓ | | ✓✓ | | |
| Spatial data structures | | ✓✓ | | | ✓✓✓ |
| OpenGL interop | | | | | ✓✓✓ |
| Nsight Compute required | ✓✓✓ | ✓✓ | ✓✓✓ | ✓✓ | ✓ |

✓ = touched, ✓✓ = central, ✓✓✓ = primary focus
