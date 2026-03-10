"use client";

import { useState } from "react";
import Nav from "../components/Nav";
import Link from "next/link";

type View = "cluster" | "node" | "gpu" | "sm" | "cpu";

// ─── Component registry ───────────────────────────────────────────────────────

const COMPONENTS = {
  // ── Cluster level ──────────────────────────────────────────────────────────
  clusterFabric: {
    name: "AI Training Cluster",
    category: "Cluster",
    color: "#bc8cff",
    stats: [
      { label: "Nodes (DGX A100)", value: "4" },
      { label: "GPUs total", value: "32 (8 per node)" },
      { label: "CUDA Cores total", value: "221,184" },
      { label: "GPU memory total", value: "2,560 GB HBM2e" },
      { label: "Peak FP16 Tensor", value: "9,984 TFLOPS" },
      { label: "System RAM total", value: "2 TB DDR4 ECC" },
      { label: "Inter-node fabric", value: "InfiniBand HDR 200" },
      { label: "Intra-node GPU BW", value: "600 GB/s (NVLink 3.0)" },
      { label: "Storage", value: "122 TB NVMe" },
    ],
    description:
      "This cluster is modeled on the NVIDIA DGX SuperPOD — the reference architecture for large-scale AI training. Each of the 4 DGX A100 nodes houses 8 A100 GPUs connected in a full NVLink mesh via NVSwitch. Nodes connect to each other via InfiniBand HDR (200 Gb/s per link). A real SuperPOD has 20 nodes; we show 4 here for clarity. Training GPT-3 (175B parameters) required clusters of this scale running for weeks.",
    conceptSlug: "multi-gpu",
  },
  dgxNode: {
    name: "DGX A100 Node",
    category: "Node",
    color: "#bc8cff",
    stats: [
      { label: "GPUs", value: "8 × A100 (80 GB)" },
      { label: "GPU memory", value: "640 GB HBM2e" },
      { label: "CPUs", value: "2 × AMD EPYC 7742" },
      { label: "System RAM", value: "1 TB DDR4-3200 ECC" },
      { label: "NVSwitch chips", value: "6 (3rd gen)" },
      { label: "GPU↔GPU bandwidth", value: "600 GB/s bidirectional" },
      { label: "Storage", value: "30 TB NVMe SSD" },
      { label: "Network", value: "8 × 200 Gb/s InfiniBand HDR" },
      { label: "Power draw", value: "~6.5 kW" },
      { label: "Form factor", value: "10U rackmount" },
    ],
    description:
      "The DGX A100 is NVIDIA's flagship AI server. Its 8 A100 GPUs are connected in a full mesh via 6 NVSwitch chips, so any GPU can send data to any other GPU at 600 GB/s — more than 9× faster than PCIe. This architecture is what makes large-scale model parallelism feasible. The two AMD EPYC CPUs primarily handle data preprocessing and orchestration; the real work happens on the GPUs.",
    conceptSlug: "multi-gpu",
    drillable: true,
  },
  infiniband: {
    name: "InfiniBand HDR 200",
    category: "Network",
    color: "#e3b341",
    stats: [
      { label: "Bandwidth per port", value: "200 Gb/s" },
      { label: "Ports per DGX node", value: "8" },
      { label: "Total node BW", value: "1,600 Gb/s (200 GB/s)" },
      { label: "Latency", value: "~600 ns (MPI ping-pong)" },
      { label: "Protocol", value: "RDMA over InfiniBand" },
      { label: "Switch (leaf)", value: "Mellanox QM8700 (40 ports)" },
    ],
    description:
      "InfiniBand is the network fabric used in most HPC and AI clusters. RDMA (Remote Direct Memory Access) lets GPUs on different nodes transfer data without CPU involvement — a GPU can write directly into another node's GPU memory over the network. This is used by NCCL (NVIDIA Collective Communications Library) for AllReduce operations in distributed training. The latency (~600 ns) is ~10× lower than typical Ethernet.",
    conceptSlug: "multi-gpu",
  },
  nvswitch: {
    name: "NVSwitch (3rd Gen)",
    category: "Interconnect",
    color: "#00ff84",
    stats: [
      { label: "NVSwitch chips per DGX", value: "6" },
      { label: "NVLink ports per chip", value: "18" },
      { label: "Bidirectional BW (chip)", value: "7.2 TB/s" },
      { label: "Aggregate intra-node BW", value: "4.8 TB/s total" },
      { label: "GPU↔GPU bandwidth", value: "600 GB/s per pair" },
      { label: "Topology", value: "All-to-all non-blocking" },
    ],
    description:
      "NVSwitch is a high-bandwidth switch chip that lives on the DGX motherboard and connects all 8 A100s in a full mesh topology. Unlike PCIe (which routes all traffic through the CPU), NVSwitch provides direct GPU-to-GPU paths. Six NVSwitch chips provide enough ports for every A100 to hold 12 NVLink connections. The result: any GPU can transfer data to any other at full 600 GB/s — essential for tensor/pipeline parallelism.",
    conceptSlug: "multi-gpu",
  },
  nvme: {
    name: "NVMe SSD Array",
    category: "Storage",
    color: "#7d8590",
    stats: [
      { label: "Drives per node", value: "8 × 3.84 TB" },
      { label: "Total per node", value: "30 TB" },
      { label: "Sequential read BW", value: "~25 GB/s (striped)" },
      { label: "Interface", value: "PCIe 4.0 NVMe" },
      { label: "Role", value: "Training dataset, checkpoints" },
    ],
    description:
      "NVMe SSDs attached directly to PCIe provide fast local storage for training datasets and model checkpoints. During training, data must be streamed to the GPU faster than the model consumes it. At 25 GB/s per node, NVMe storage can comfortably feed the GPUs for most vision and NLP workloads. For truly massive datasets (petabyte scale), a distributed filesystem (Lustre, GPFS) is added to the cluster.",
    conceptSlug: "cuda-memory-hierarchy",
  },

  // ── CPU level ──────────────────────────────────────────────────────────────
  cpu: {
    name: "AMD EPYC 7742 (Rome)",
    category: "CPU",
    color: "#ffa657",
    stats: [
      { label: "Cores / Threads", value: "64 / 128 (SMT)" },
      { label: "Base / Boost clock", value: "2.25 GHz / 3.4 GHz" },
      { label: "L1 cache (per core)", value: "32 KB I + 32 KB D" },
      { label: "L2 cache (per core)", value: "512 KB" },
      { label: "L3 cache (per CCD)", value: "16 MB (shared 8 cores)" },
      { label: "L3 total", value: "256 MB" },
      { label: "Memory channels", value: "8 × DDR4-3200" },
      { label: "Memory bandwidth", value: "204 GB/s" },
      { label: "PCIe lanes", value: "128 × Gen 4" },
      { label: "Process", value: "TSMC 7nm TSMC" },
      { label: "TDP", value: "225 W" },
    ],
    description:
      "EPYC 7742 uses AMD's chiplet architecture: 8 Core Compute Dies (CCDs) each with 8 cores, connected to a central I/O Die via Infinity Fabric. Unlike a GPU's thousands of simple in-order cores, each CPU core is a complex out-of-order superscalar processor with branch prediction, large caches, and deep pipelines — optimized for low latency on serial workloads. In a DGX node, the CPU's main job is data loading, preprocessing, and orchestrating the 8 GPUs via PCIe.",
    conceptSlug: "gpu-thread-hierarchy",
    drillable: true,
  },
  cpuCore: {
    name: "CPU Core (Zen 2)",
    category: "CPU",
    color: "#ffa657",
    stats: [
      { label: "Pipeline depth", value: "~19 stages (out-of-order)" },
      { label: "Execution units", value: "4 integer + 2 FP/SIMD" },
      { label: "L1 I-Cache", value: "32 KB, 8-way" },
      { label: "L1 D-Cache", value: "32 KB, 8-way" },
      { label: "L2 Cache", value: "512 KB, 8-way" },
      { label: "AVX2 SIMD width", value: "256-bit (8× FP32/clock)" },
      { label: "Threads (SMT)", value: "2 (Hyper-Threading)" },
    ],
    description:
      "A single CPU core is a deeply pipelined, out-of-order processor. It uses branch prediction, speculative execution, and register renaming to extract instruction-level parallelism from sequential code. The AVX2 unit can process 8 FP32 values per clock via SIMD. Contrast with a GPU: one CPU core at 3.4 GHz with 8-wide SIMD delivers ~27 GFLOPS peak. One A100 SM at 1.41 GHz with 64 cores delivers ~180 GFLOPS. The GPU wins on throughput; the CPU wins on latency.",
    conceptSlug: "gpu-thread-hierarchy",
  },
  l3Cache: {
    name: "L3 Cache (Last-Level Cache)",
    category: "Memory",
    color: "#ffa657",
    stats: [
      { label: "Size per CCD", value: "16 MB" },
      { label: "Total (8 CCDs)", value: "256 MB" },
      { label: "Bandwidth (per CCD)", value: "~1 TB/s" },
      { label: "Latency", value: "~40 ns (vs ~5 ns L1)" },
      { label: "Shared among", value: "All 8 cores in one CCD" },
    ],
    description:
      "The L3 (last-level) cache is the final stop before main memory. On EPYC, each CCD has its own 16 MB L3 shared across its 8 cores. The key insight for GPU programmers: even the CPU's largest cache (256 MB total on EPYC 7742) fits less data than a single A100's HBM (80 GB). The A100's L2 cache (40 MB) alone is comparable to the entire CPU L3 — and GPU HBM bandwidth (2 TB/s) is 10× faster than CPU DRAM.",
    conceptSlug: "cuda-memory-hierarchy",
  },
  dram: {
    name: "DDR4-3200 ECC System RAM",
    category: "Memory",
    color: "#58a6ff",
    stats: [
      { label: "Capacity (per node)", value: "1 TB DDR4-3200" },
      { label: "Channels", value: "8 per CPU × 2 CPUs = 16" },
      { label: "Bandwidth (per CPU)", value: "204 GB/s" },
      { label: "Total node bandwidth", value: "~400 GB/s" },
      { label: "Latency", value: "~60–80 ns" },
      { label: "ECC", value: "Yes (corrects single-bit errors)" },
      { label: "vs HBM2e", value: "5× less bandwidth, 80× more capacity" },
    ],
    description:
      "System DRAM is where the CPU's working data lives — Python tensors, datasets, model weights before they're copied to the GPU. The 1 TB per node dwarfs GPU VRAM (640 GB) but is far slower (400 GB/s vs 16 TB/s aggregate across 8 GPUs). The cudaMemcpy bottleneck — copying tensors from CPU RAM to GPU VRAM over PCIe at 64 GB/s — is often the reason GPUs sit idle at <50% utilization. Pinned (page-locked) memory, cudaMemcpyAsync, and pre-fetching are the main mitigations.",
    conceptSlug: "cuda-memory-hierarchy",
  },

  // ── GPU die level ──────────────────────────────────────────────────────────
  chip: {
    name: "NVIDIA A100 GPU (GA100)",
    category: "Die",
    color: "#00ff84",
    stats: [
      { label: "Streaming Multiprocessors", value: "108" },
      { label: "CUDA Cores (FP32)", value: "6,912" },
      { label: "Tensor Cores (3rd gen)", value: "432" },
      { label: "Peak FP32", value: "19.5 TFLOPS" },
      { label: "Peak BF16 Tensor", value: "312 TFLOPS" },
      { label: "L2 Cache", value: "40 MB" },
      { label: "Memory", value: "80 GB HBM2e" },
      { label: "Memory Bandwidth", value: "2,039 GB/s" },
      { label: "TDP", value: "400 W" },
      { label: "Transistors", value: "54.2 billion" },
      { label: "Process Node", value: "TSMC 7nm" },
    ],
    description:
      "The A100 (GA100 die) is NVIDIA's flagship datacenter GPU built on the Ampere architecture. It contains 54.2 billion transistors on TSMC's 7nm process. Every CUDA thread you write ultimately runs on one of the 6,912 FP32 CUDA cores grouped into 108 Streaming Multiprocessors. The A100 introduced the 3rd-gen Tensor Cores that support TF32, BF16, FP16, INT8, and structured sparsity.",
    conceptSlug: "gpu-thread-hierarchy",
  },
  gpc: {
    name: "GPC — Graphics Processing Cluster",
    category: "Cluster",
    color: "#bc8cff",
    stats: [
      { label: "GPCs per A100", value: "8" },
      { label: "SMs per GPC", value: "~14" },
      { label: "TPCs per GPC", value: "7" },
    ],
    description:
      "A GPC is the largest subdivision of the GPU die. The A100 has 8 GPCs. Each GPC shares instruction caches across its SMs and has its own raster engine. GPCs also improve yield: the full GA100 die has 128 SMs, but chips ship with 108 — defective GPCs are disabled while the rest remains functional.",
    conceptSlug: "gpu-thread-hierarchy",
  },
  l2Cache: {
    name: "L2 Cache",
    category: "Memory",
    color: "#58a6ff",
    stats: [
      { label: "Total on A100", value: "40 MB" },
      { label: "Bandwidth", value: "~5 TB/s" },
      { label: "vs CPU L3", value: "40 MB vs 256 MB, but 5× faster" },
      { label: "Residence control", value: "Yes (CUDA 11.1+)" },
    ],
    description:
      "The GPU L2 is shared across all 108 SMs. At 40 MB it is 6× larger than Volta's. CUDA 11.1 introduced L2 residence controls (cudaAccessPolicyWindow) to pin hot data like embedding tables into a reserved L2 partition to prevent eviction.",
    conceptSlug: "cuda-memory-hierarchy",
  },
  hbm: {
    name: "HBM2e — High Bandwidth Memory (VRAM)",
    category: "Memory",
    color: "#58a6ff",
    stats: [
      { label: "Capacity", value: "80 GB" },
      { label: "Bandwidth", value: "2,039 GB/s" },
      { label: "HBM2e stacks", value: "6" },
      { label: "Bus width", value: "6 × 1024-bit = 6,144-bit" },
      { label: "Latency", value: "~200 ns" },
      { label: "vs CPU DRAM", value: "10× faster, 80× less capacity" },
    ],
    description:
      "HBM (High Bandwidth Memory) stacks DRAM dies vertically and connects them via a silicon interposer right next to the GPU die. This is VRAM — where all your CUDA device arrays live. At 2 TB/s it is 5× faster than CPU DRAM. Coalesced, 128-byte aligned accesses are essential to approach peak bandwidth. Uncoalesced scatter-gather patterns can reduce effective bandwidth below 100 GB/s.",
    conceptSlug: "global-memory-coalescing",
  },
  pcie: {
    name: "PCIe 4.0 / NVLink 3.0",
    category: "Interconnect",
    color: "#ffa657",
    stats: [
      { label: "PCIe bandwidth", value: "64 GB/s bidirectional" },
      { label: "NVLink bandwidth", value: "600 GB/s bidirectional" },
      { label: "PCIe vs NVLink", value: "9.4× slower" },
      { label: "NVLink version", value: "3.0 (12 links)" },
    ],
    description:
      "PCIe connects the GPU to the CPU host. Every cudaMemcpy call crosses this bus. At 64 GB/s it is ~32× slower than HBM — minimizing host↔device transfers is critical. NVLink enables direct GPU-to-GPU transfers at 600 GB/s, used by NCCL for AllReduce operations in distributed training without going through the CPU or PCIe.",
    conceptSlug: "multi-gpu",
  },

  // ── SM level ───────────────────────────────────────────────────────────────
  sm: {
    name: "SM — Streaming Multiprocessor",
    category: "Compute",
    color: "#00ff84",
    stats: [
      { label: "FP32 CUDA Cores", value: "64" },
      { label: "INT32 Cores", value: "32" },
      { label: "FP64 Cores", value: "32" },
      { label: "Tensor Cores (3rd gen)", value: "4" },
      { label: "Warp Schedulers", value: "4" },
      { label: "Dispatch Units", value: "8 (2 per scheduler)" },
      { label: "Register File", value: "256 KB" },
      { label: "L1 + Shared Memory", value: "Up to 192 KB" },
      { label: "Max Resident Warps", value: "64" },
      { label: "Max Resident Threads", value: "2,048" },
    ],
    description:
      "The SM is where all CUDA code executes. Thread blocks are assigned to SMs by the hardware scheduler. Each SM runs up to 64 warps (2,048 threads) concurrently by multiplexing them across 4 warp schedulers. When one warp stalls on a memory access, the scheduler instantly switches to another eligible warp — this latency hiding is the GPU's fundamental performance model.",
    conceptSlug: "warp-execution",
    drillable: true,
  },
  warpScheduler: {
    name: "Warp Scheduler",
    category: "Control",
    color: "#e3b341",
    stats: [
      { label: "Per SM", value: "4" },
      { label: "Dispatch units each", value: "2 (dual-issue)" },
      { label: "Issue rate", value: "2 warps/clock (1 per unit)" },
      { label: "Warp pool (shared)", value: "64 warps per SM" },
    ],
    description:
      "Each SM contains 4 independent warp schedulers. Every clock cycle, each scheduler selects one eligible warp from its pool and issues up to 2 independent instructions. A warp becomes eligible once all its dependencies resolve. With 64 resident warps, the schedulers can hide hundreds of cycles of memory latency by always having something useful to run.",
    conceptSlug: "warp-execution",
  },
  cudaCores: {
    name: "CUDA Cores (FP32 / INT32)",
    category: "Compute",
    color: "#00ff84",
    stats: [
      { label: "FP32 Cores per SM", value: "64" },
      { label: "INT32 Cores per SM", value: "32" },
      { label: "Simultaneous FP32+INT32", value: "Yes (separate pipelines)" },
      { label: "Warp width", value: "32 threads (SIMT)" },
    ],
    description:
      "Each FP32 CUDA core executes one floating-point multiply or add per clock. A warp of 32 threads maps to 32 cores executing in lockstep (SIMT). In Ampere, the FP32 and INT32 pipelines are independent: you can run 64 FP32 ops while simultaneously running 32 INT32 address computations.",
    conceptSlug: "gpu-thread-hierarchy",
  },
  tensorCores: {
    name: "Tensor Cores (3rd Gen)",
    category: "Compute",
    color: "#58a6ff",
    stats: [
      { label: "Tensor Cores per SM", value: "4" },
      { label: "Total on A100", value: "432" },
      { label: "Supported dtypes", value: "TF32, BF16, FP16, INT8, INT4" },
      { label: "Peak FP16 (dense)", value: "312 TFLOPS" },
      { label: "Peak FP16 (2:4 sparse)", value: "624 TFLOPS" },
    ],
    description:
      "Tensor Cores are matrix multiply-accumulate units. An entire warp cooperates to compute a 16×16×16 FP16 matrix multiply in a single instruction — roughly 256 FMAs per Tensor Core per clock. This is how cuBLAS, cuDNN, and Flash Attention achieve hundreds of TFLOPS. The 3rd-gen cores added TF32 and 2:4 structured sparsity for 2× additional throughput.",
    conceptSlug: "tensor-cores",
  },
  registerFile: {
    name: "Register File",
    category: "Memory",
    color: "#ff7b72",
    stats: [
      { label: "Size per SM", value: "256 KB" },
      { label: "Register width", value: "32-bit" },
      { label: "Max per thread", value: "255 registers" },
      { label: "Bandwidth", value: "~17 TB/s (per SM)" },
    ],
    description:
      "The register file is the fastest memory on the GPU. Every local variable in your kernel lives here. More registers per thread means fewer threads can be simultaneously resident (lower occupancy), reducing latency hiding ability. Nsight Compute shows register usage per kernel — this is one of the most impactful tuning parameters.",
    conceptSlug: "occupancy",
  },
  sharedMem: {
    name: "L1 Cache / Shared Memory",
    category: "Memory",
    color: "#58a6ff",
    stats: [
      { label: "Total SRAM per SM", value: "192 KB" },
      { label: "Default split", value: "128 KB L1 / 64 KB Shared" },
      { label: "Max Shared Memory", value: "164 KB (with carveout)" },
      { label: "Shared memory banks", value: "32 (4-byte width)" },
    ],
    description:
      "The 192 KB on-chip SRAM is split between a hardware L1 cache and a software scratchpad (__shared__). Shared memory is as fast as registers when accessed without bank conflicts. It is the key to tiled algorithms: SGEMM, Flash Attention, and parallel scan all depend on loading data here to reuse it before it evicts from L1.",
    conceptSlug: "shared-memory",
  },
  ldst: {
    name: "LD/ST Units (Load/Store)",
    category: "Compute",
    color: "#ffa657",
    stats: [
      { label: "LD/ST units per SM", value: "32" },
      { label: "Cache line width", value: "128 bytes" },
      { label: "Coalesced access", value: "32 threads → 1–4 requests" },
      { label: "Uncoalesced worst case", value: "32 threads → 32 requests" },
    ],
    description:
      "LD/ST units handle all memory traffic: global loads/stores, shared memory access, and atomics. When 32 threads execute a load, all 32 addresses are checked for coalescing. Consecutive, aligned accesses merge into 1–4 cache line requests. Scattered accesses generate up to 32 separate requests — a 32× throughput penalty. This is why memory access patterns are the #1 optimization target in CUDA kernels.",
    conceptSlug: "global-memory-coalescing",
  },
} as const;

type ComponentId = keyof typeof COMPONENTS;

// ─── Cluster SVG ──────────────────────────────────────────────────────────────

function ClusterView({
  selected,
  onSelect,
  onDrillNode,
}: {
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
  onDrillNode: () => void;
}) {
  const [hov, setHov] = useState<string | null>(null);
  const isSel = (id: ComponentId) => selected === id;

  const nodePositions = [
    { x: 8, y: 82 }, { x: 390, y: 82 },
    { x: 8, y: 272 }, { x: 390, y: 272 },
  ];

  return (
    <svg viewBox="0 0 762 510" className="w-full h-full" style={{ fontFamily: "var(--font-mono)" }}>
      {/* Background */}
      <rect x="1" y="1" width="760" height="508" rx="8" fill="#080d14" stroke="#21262d" strokeWidth="1" />

      {/* IB Spine switches */}
      {[{ x: 80, label: "IB Spine 0" }, { x: 420, label: "IB Spine 1" }].map((sw, i) => {
        const sel = isSel("infiniband");
        return (
          <g key={i} className="cursor-pointer" onClick={() => onSelect("infiniband")}>
            <rect x={sw.x} y="12" width="262" height="54" rx="4"
              fill={sel ? "rgba(227,179,65,0.12)" : "rgba(227,179,65,0.05)"}
              stroke={sel ? "#e3b341" : "rgba(227,179,65,0.3)"} strokeWidth={sel ? 1.5 : 1} />
            {/* Port dots */}
            {Array.from({ length: 16 }, (_, p) => (
              <rect key={p} x={sw.x + 8 + p * 15} y="18" width="9" height="16" rx="1"
                fill={sel ? "rgba(227,179,65,0.4)" : "rgba(227,179,65,0.15)"} />
            ))}
            <text x={sw.x + 131} y="52" textAnchor="middle" fill={sel ? "#f0c350" : "#7d8590"} fontSize="9" letterSpacing="1">
              {sw.label} · InfiniBand HDR 200
            </text>
          </g>
        );
      })}

      {/* IB → node connection lines */}
      {nodePositions.map((pos, i) => (
        <g key={i}>
          <line x1={i < 2 ? 211 : 550} y1="66" x2={pos.x + 185} y2={pos.y}
            stroke="rgba(227,179,65,0.2)" strokeWidth="1" strokeDasharray="4,3" />
        </g>
      ))}

      {/* DGX Nodes */}
      {nodePositions.map((pos, i) => {
        const sel = isSel("dgxNode");
        const isHov = hov === `node-${i}`;
        return (
          <g key={i} className="cursor-pointer"
            onClick={() => { onSelect("dgxNode"); onDrillNode(); }}
            onMouseEnter={() => setHov(`node-${i}`)}
            onMouseLeave={() => setHov(null)}>
            <rect x={pos.x} y={pos.y} width="372" height="178" rx="5"
              fill={isHov ? "rgba(188,140,255,0.1)" : "rgba(188,140,255,0.04)"}
              stroke={sel || isHov ? "#bc8cff" : "rgba(188,140,255,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            <text x={pos.x + 8} y={pos.y + 13} fill={isHov ? "#d2a8ff" : "#7d8590"} fontSize="8" letterSpacing="1.5">
              DGX A100 NODE {i}
            </text>

            {/* CPUs */}
            {[0, 1].map((c) => (
              <g key={c}>
                <rect x={pos.x + 8} y={pos.y + 20 + c * 68} width="72" height="58" rx="3"
                  fill="rgba(255,166,87,0.1)" stroke="rgba(255,166,87,0.3)" strokeWidth="1" />
                <text x={pos.x + 44} y={pos.y + 38 + c * 68} textAnchor="middle" fill="#ffa657" fontSize="8">EPYC</text>
                <text x={pos.x + 44} y={pos.y + 49 + c * 68} textAnchor="middle" fill="#ffa657" fontSize="8">7742</text>
                {Array.from({ length: 8 }, (_, cc) => (
                  <rect key={cc} x={pos.x + 11 + (cc % 4) * 16} y={pos.y + 55 + c * 68 + Math.floor(cc / 4) * 10}
                    width="11" height="7" rx="1" fill="rgba(255,166,87,0.3)" />
                ))}
              </g>
            ))}

            {/* GPU chips 4×2 */}
            {Array.from({ length: 8 }, (_, g) => {
              const gc = g % 4, gr = Math.floor(g / 4);
              const gx = pos.x + 90 + gc * 68, gy = pos.y + 20 + gr * 80;
              return (
                <g key={g}>
                  <rect x={gx} y={gy} width="60" height="65" rx="3"
                    fill="rgba(0,255,132,0.07)" stroke="rgba(0,255,132,0.25)" strokeWidth="1" />
                  {Array.from({ length: 9 }, (_, cc) => (
                    <rect key={cc} x={gx + 4 + (cc % 3) * 18} y={gy + 8 + Math.floor(cc / 3) * 14}
                      width="12" height="9" rx="1" fill="rgba(0,255,132,0.2)" />
                  ))}
                  <text x={gx + 30} y={gy + 58} textAnchor="middle" fill="#3d444d" fontSize="7">A100</text>
                </g>
              );
            })}

            {/* NVLink lines between GPUs (horizontal) */}
            {[0, 1, 2, 3].map((g) => (
              <line key={g} x1={pos.x + 90 + g * 68 + 60} y1={pos.y + 52}
                x2={pos.x + 90 + (g + 1) * 68} y2={pos.y + 52}
                stroke="rgba(0,255,132,0.2)" strokeWidth="1" strokeDasharray="2,2" />
            ))}
            {[0, 1, 2, 3].map((g) => (
              <line key={g} x1={pos.x + 90 + g * 68 + 60} y1={pos.y + 132}
                x2={pos.x + 90 + (g + 1) * 68} y2={pos.y + 132}
                stroke="rgba(0,255,132,0.2)" strokeWidth="1" strokeDasharray="2,2" />
            ))}

            {/* DRAM label */}
            <text x={pos.x + 10} y={pos.y + 165} fill="#3d444d" fontSize="7" letterSpacing="1">
              1TB DDR4 ECC · 640GB HBM2e · 30TB NVMe
            </text>
            {/* Drill hint */}
            {isHov && (
              <text x={pos.x + 372 - 6} y={pos.y + 165} textAnchor="end" fill="#bc8cff" fontSize="7">
                click to explore →
              </text>
            )}
          </g>
        );
      })}

      {/* NVMe storage row */}
      {(() => {
        const sel = isSel("nvme");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("nvme")}>
            <rect x="8" y="460" width="280" height="38" rx="4"
              fill={sel ? "rgba(125,133,144,0.15)" : "rgba(125,133,144,0.05)"}
              stroke={sel ? "#7d8590" : "rgba(125,133,144,0.2)"} strokeWidth={sel ? 1.5 : 1} />
            <text x="148" y="473" textAnchor="middle" fill={sel ? "#e6edf3" : "#7d8590"} fontSize="8" letterSpacing="1">
              SHARED STORAGE
            </text>
            <text x="148" y="487" textAnchor="middle" fill={sel ? "#7d8590" : "#3d444d"} fontSize="7">
              NVMe · 122 TB · 100 GB/s
            </text>
          </g>
        );
      })()}

      {/* Management network */}
      <rect x="300" y="460" width="454" height="38" rx="4"
        fill="rgba(61,68,77,0.2)" stroke="#21262d" strokeWidth="1" />
      <text x="527" y="473" textAnchor="middle" fill="#3d444d" fontSize="8" letterSpacing="1">MANAGEMENT NETWORK · 1 GbE</text>
      <text x="527" y="487" textAnchor="middle" fill="#3d444d" fontSize="7">BMC · IPMI · Cluster Orchestrator (Slurm / Kubernetes)</text>

      {/* IB bandwidth labels */}
      <text x="381" y="78" textAnchor="middle" fill="#3d444d" fontSize="7" letterSpacing="1">
        InfiniBand HDR · 200 Gb/s per link · 8 links per node = 200 GB/s total
      </text>
    </svg>
  );
}

// ─── Node SVG ─────────────────────────────────────────────────────────────────

function NodeView({
  selected,
  onSelect,
  onDrillGPU,
  onDrillCPU,
}: {
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
  onDrillGPU: () => void;
  onDrillCPU: () => void;
}) {
  const [hov, setHov] = useState<string | null>(null);
  const isSel = (id: ComponentId) => selected === id;

  return (
    <svg viewBox="0 0 762 510" className="w-full h-full" style={{ fontFamily: "var(--font-mono)" }}>
      <rect x="1" y="1" width="760" height="508" rx="8" fill="#080d14" stroke="#21262d" />
      <text x="14" y="14" fill="#3d444d" fontSize="8" letterSpacing="2">DGX A100 · 10U RACKMOUNT · 6.5 kW</text>

      {/* DRAM DIMMs top strip */}
      {(() => {
        const sel = isSel("dram");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("dram")}>
            {Array.from({ length: 16 }, (_, i) => (
              <rect key={i} x={8 + i * 46} y="20" width="38" height="22" rx="2"
                fill={sel ? "rgba(88,166,255,0.2)" : "rgba(88,166,255,0.07)"}
                stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            ))}
            <text x="381" y="54" textAnchor="middle" fill={sel ? "#79c0ff" : "#3d444d"} fontSize="8" letterSpacing="1">
              16 × 64 GB DDR4-3200 ECC · 1 TB · ~400 GB/s
            </text>
          </g>
        );
      })()}

      {/* CPU sockets */}
      {[0, 1].map((c) => {
        const sel = isSel("cpu");
        const isHov = hov === `cpu-${c}`;
        const x = 8, y = 62 + c * 170;
        return (
          <g key={c} className="cursor-pointer"
            onClick={() => { onSelect("cpu"); onDrillCPU(); }}
            onMouseEnter={() => setHov(`cpu-${c}`)}
            onMouseLeave={() => setHov(null)}>
            <rect x={x} y={y} width="180" height="155" rx="5"
              fill={isHov ? "rgba(255,166,87,0.12)" : "rgba(255,166,87,0.05)"}
              stroke={sel || isHov ? "#ffa657" : "rgba(255,166,87,0.3)"} strokeWidth={sel ? 1.5 : 1} />
            <text x={x + 8} y={y + 13} fill={isHov ? "#ffa657" : "#7d8590"} fontSize="8" letterSpacing="1.5">
              CPU {c} · EPYC 7742
            </text>
            {/* 8 CCDs grid */}
            {Array.from({ length: 8 }, (_, cc) => (
              <g key={cc}>
                <rect x={x + 8 + (cc % 4) * 42} y={y + 20 + Math.floor(cc / 4) * 52}
                  width="36" height="44" rx="2"
                  fill="rgba(255,166,87,0.12)" stroke="rgba(255,166,87,0.3)" strokeWidth="1" />
                {Array.from({ length: 8 }, (_, core) => (
                  <rect key={core}
                    x={x + 10 + (cc % 4) * 42 + (core % 4) * 8}
                    y={y + 24 + Math.floor(cc / 4) * 52 + Math.floor(core / 4) * 12}
                    width="5" height="8" rx="0.5" fill="rgba(255,166,87,0.35)" />
                ))}
              </g>
            ))}
            <text x={x + 90} y={y + 145} textAnchor="middle" fill={isHov ? "#ffa657" : "#3d444d"} fontSize="7">
              64 cores · 128 threads · 256 MB L3
            </text>
            {isHov && (
              <text x={x + 178} y={y + 145} textAnchor="end" fill="#ffa657" fontSize="7">explore →</text>
            )}
          </g>
        );
      })}

      {/* NVSwitch chips */}
      {(() => {
        const sel = isSel("nvswitch");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("nvswitch")}>
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={i} x={198 + i * 58} y="218" width="50" height="38" rx="3"
                fill={sel ? "rgba(0,255,132,0.12)" : "rgba(0,255,132,0.05)"}
                stroke={sel ? "#00ff84" : "rgba(0,255,132,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            ))}
            <text x="248" y="213" fill={sel ? "#00ff84" : "#3d444d"} fontSize="8" letterSpacing="1">
              NVSwitch × 6 · full-mesh · 4.8 TB/s
            </text>
            {/* NVLink connections to GPUs (suggestion lines) */}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={i} x1={198 + i * 58 + 25} y1="256" x2={198 + i * 58 + 25} y2="270"
                stroke="rgba(0,255,132,0.25)" strokeWidth="1" strokeDasharray="2,2" />
            ))}
          </g>
        );
      })()}

      {/* GPU grid 4×2 */}
      {Array.from({ length: 8 }, (_, g) => {
        const gc = g % 4, gr = Math.floor(g / 4);
        const x = 198 + gc * 142, y = 270 + gr * 110;
        const sel = isSel("chip");
        const isHov = hov === `gpu-${g}`;
        return (
          <g key={g} className="cursor-pointer"
            onClick={() => { onSelect("chip"); onDrillGPU(); }}
            onMouseEnter={() => setHov(`gpu-${g}`)}
            onMouseLeave={() => setHov(null)}>
            <rect x={x} y={y} width="134" height="98" rx="4"
              fill={isHov ? "rgba(0,255,132,0.12)" : "rgba(0,255,132,0.05)"}
              stroke={sel || isHov ? "#00ff84" : "rgba(0,255,132,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            {/* SM grid 6×3 */}
            {Array.from({ length: 18 }, (_, s) => (
              <rect key={s} x={x + 4 + (s % 6) * 21} y={y + 14 + Math.floor(s / 6) * 22}
                width="16" height="16" rx="1.5" fill="rgba(0,255,132,0.2)" />
            ))}
            {/* HBM indicator */}
            <rect x={x + 4} y={y + 76} width="126" height="14" rx="2"
              fill="rgba(88,166,255,0.2)" stroke="rgba(88,166,255,0.3)" strokeWidth="0.5" />
            <text x={x + 67} y={y + 87} textAnchor="middle" fill="#58a6ff" fontSize="7">HBM2e 80GB</text>
            <text x={x + 10} y={y + 10} fill={isHov ? "#00ff84" : "#3d444d"} fontSize="7">A100 GPU {g}</text>
            {isHov && (
              <text x={x + 132} y={y + 10} textAnchor="end" fill="#00ff84" fontSize="7">→</text>
            )}
          </g>
        );
      })}

      {/* NVMe SSDs */}
      {(() => {
        const sel = isSel("nvme");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("nvme")}>
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x={8 + i * 24} y="400" width="18" height="45" rx="2"
                fill={sel ? "rgba(125,133,144,0.2)" : "rgba(125,133,144,0.07)"}
                stroke={sel ? "#7d8590" : "rgba(125,133,144,0.2)"} strokeWidth={sel ? 1.5 : 1} />
            ))}
            <text x="100" y="456" fill={sel ? "#e6edf3" : "#3d444d"} fontSize="8">
              8 × 3.84 TB NVMe · 30 TB · 25 GB/s
            </text>
          </g>
        );
      })()}

      {/* Memory hierarchy bar */}
      <text x="382" y="476" textAnchor="middle" fill="#3d444d" fontSize="7" letterSpacing="2">BANDWIDTH HIERARCHY</text>
      {[
        { label: "GPU Regs", bw: "17 TB/s", col: "#ff7b72", w: 160 },
        { label: "HBM2e", bw: "2 TB/s", col: "#58a6ff", w: 90 },
        { label: "CPU DRAM", bw: "400 GB/s", col: "#79c0ff", w: 40 },
        { label: "NVMe", bw: "25 GB/s", col: "#7d8590", w: 14 },
        { label: "PCIe", bw: "64 GB/s", col: "#ffa657", w: 18 },
      ].reduce<{ els: React.ReactNode[]; offset: number }>(
        ({ els, offset }, item, i) => {
          const el = (
            <g key={i}>
              <rect x={198 + offset} y="483" width={item.w} height="16" rx="1"
                fill={`${item.col}30`} stroke={`${item.col}60`} strokeWidth="0.5" />
              <text x={198 + offset + item.w / 2} y="494" textAnchor="middle" fill={item.col} fontSize="6">
                {item.label}
              </text>
            </g>
          );
          return { els: [...els, el], offset: offset + item.w + 4 };
        },
        { els: [], offset: 0 }
      ).els}
      <text x="198" y="494" fill="#3d444d" fontSize="6">← faster</text>
    </svg>
  );
}

// ─── Chip SVG (GPU die) ───────────────────────────────────────────────────────

function ChipView({
  selected,
  onSelect,
}: {
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
}) {
  const [hovGpc, setHovGpc] = useState<number | null>(null);
  const [hovSm, setHovSm] = useState<string | null>(null);
  const isSel = (id: ComponentId) => selected === id;

  const gpcs = Array.from({ length: 8 }, (_, i) => ({ col: i % 4, row: Math.floor(i / 4), idx: i }));
  const gpcW = 168, gpcH = 118, gapX = 10, gapY = 10, startX = 16, startY = 16;
  const smW = 46, smH = 42, smGapX = 6, smGapY = 5, smPad = 10;

  return (
    <svg viewBox="0 0 762 510" className="w-full h-full" style={{ fontFamily: "var(--font-mono)" }}>
      <rect x="2" y="2" width="758" height="506" rx="8"
        fill="#0a1120" stroke={isSel("chip") ? "#00ff84" : "#21262d"}
        strokeWidth={isSel("chip") ? 2 : 1}
        className="cursor-pointer" onClick={() => onSelect("chip")} />
      <text x="381" y="498" textAnchor="middle" fill="#3d444d" fontSize="9" letterSpacing="2">
        GA100 · TSMC 7nm · 826 mm² · 54.2B transistors
      </text>

      {gpcs.map(({ col, row, idx }) => {
        const x = startX + col * (gpcW + gapX);
        const y = startY + row * (gpcH + gapY);
        const hov = hovGpc === idx;
        const sel = isSel("gpc");
        return (
          <g key={idx}>
            <rect x={x} y={y} width={gpcW} height={gpcH} rx="4"
              fill={sel || hov ? "rgba(188,140,255,0.08)" : "rgba(188,140,255,0.03)"}
              stroke={sel ? "#bc8cff" : hov ? "rgba(188,140,255,0.5)" : "rgba(188,140,255,0.2)"}
              strokeWidth={sel ? 1.5 : 1}
              className="cursor-pointer" onClick={() => onSelect("gpc")}
              onMouseEnter={() => setHovGpc(idx)} onMouseLeave={() => setHovGpc(null)} />
            <text x={x + 6} y={y + 11} fill={sel ? "#d2a8ff" : "#7d8590"} fontSize="8" letterSpacing="1">
              GPC {idx}
            </text>
            {Array.from({ length: 6 }, (_, si) => {
              const sc = si % 3, sr = Math.floor(si / 3);
              const sx = x + smPad + sc * (smW + smGapX);
              const sy = y + 16 + sr * (smH + smGapY);
              const smId = `${idx}-${si}`;
              const smHov = hovSm === smId;
              const smSel = isSel("sm");
              return (
                <g key={si}>
                  <rect x={sx} y={sy} width={smW} height={smH} rx="3"
                    fill={smSel || smHov ? "rgba(0,255,132,0.12)" : "rgba(0,255,132,0.04)"}
                    stroke={smSel ? "#00ff84" : smHov ? "rgba(0,255,132,0.6)" : "rgba(0,255,132,0.2)"}
                    strokeWidth={smSel ? 1.5 : 1}
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onSelect("sm"); }}
                    onMouseEnter={() => setHovSm(smId)} onMouseLeave={() => setHovSm(null)} />
                  {Array.from({ length: 8 }, (_, ci) => (
                    <rect key={ci} x={sx + 4 + (ci % 4) * 9} y={sy + 8 + Math.floor(ci / 4) * 9}
                      width="6" height="6" rx="1"
                      fill={smSel || smHov ? "rgba(0,255,132,0.5)" : "rgba(0,255,132,0.2)"}
                      className="pointer-events-none" />
                  ))}
                  <text x={sx + smW / 2} y={sy + smH - 4} textAnchor="middle"
                    fill={smSel || smHov ? "#56d364" : "#3d444d"} fontSize="7" className="pointer-events-none">
                    SM
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* L2 Cache */}
      {(() => {
        const sel = isSel("l2Cache");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("l2Cache")}>
            <rect x="16" y="264" width="730" height="36" rx="4"
              fill={sel ? "rgba(88,166,255,0.12)" : "rgba(88,166,255,0.05)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            <text x="381" y="278" textAnchor="middle" fill={sel ? "#79c0ff" : "#58a6ff"} fontSize="9" letterSpacing="1.5">L2 CACHE</text>
            <text x="381" y="291" textAnchor="middle" fill={sel ? "#58a6ff" : "#3d444d"} fontSize="8">40 MB · ~5 TB/s</text>
          </g>
        );
      })()}

      {/* HBM stacks */}
      {Array.from({ length: 6 }, (_, i) => {
        const sel = isSel("hbm");
        const w = 112, h = 68, gap = 10;
        const startXHBM = (762 - (6 * w + 5 * gap)) / 2;
        const x = startXHBM + i * (w + gap);
        return (
          <g key={i} className="cursor-pointer" onClick={() => onSelect("hbm")}>
            <rect x={x} y="312" width={w} height={h} rx="4"
              fill={sel ? "rgba(88,166,255,0.15)" : "rgba(88,166,255,0.06)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.3)"} strokeWidth={sel ? 1.5 : 1} />
            {[0, 1, 2, 3].map((d) => (
              <rect key={d} x={x + 6} y={312 + 8 + d * 13} width={w - 12} height="9" rx="1"
                fill={sel ? "rgba(88,166,255,0.3)" : "rgba(88,166,255,0.12)"} className="pointer-events-none" />
            ))}
            <text x={x + w / 2} y={312 + h - 4} textAnchor="middle"
              fill={sel ? "#79c0ff" : "#3d444d"} fontSize="7" className="pointer-events-none">
              HBM2e
            </text>
          </g>
        );
      })}

      {Array.from({ length: 6 }, (_, i) => {
        const w = 112, gap = 10;
        const startXHBM = (762 - (6 * w + 5 * gap)) / 2;
        const cx = startXHBM + i * (w + gap) + w / 2;
        return <line key={i} x1={cx} y1="300" x2={cx} y2="312"
          stroke="rgba(88,166,255,0.2)" strokeWidth="1" strokeDasharray="2,2" />;
      })}
      <text x="381" y="392" textAnchor="middle" fill="#3d444d" fontSize="8" letterSpacing="1">
        6 × 1024-bit · 2,039 GB/s · 80 GB total
      </text>

      {/* PCIe */}
      {(() => {
        const sel = isSel("pcie");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("pcie")}>
            <rect x="16" y="400" width="730" height="30" rx="4"
              fill={sel ? "rgba(255,166,87,0.12)" : "rgba(255,166,87,0.04)"}
              stroke={sel ? "#ffa657" : "rgba(255,166,87,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            {Array.from({ length: 30 }, (_, i) => (
              <rect key={i} x={22 + i * 24} y="424" width="10" height="6" rx="1"
                fill={sel ? "rgba(255,166,87,0.5)" : "rgba(255,166,87,0.2)"} />
            ))}
            <text x="180" y="417" fill={sel ? "#ffa657" : "#7d8590"} fontSize="8" letterSpacing="1">PCIe 4.0 ×16 · 64 GB/s</text>
            <text x="460" y="417" fill={sel ? "#ffa657" : "#7d8590"} fontSize="8" letterSpacing="1">NVLink 3.0 · 600 GB/s</text>
          </g>
        );
      })()}
      <text x="14" y="505" fill="#3d444d" fontSize="8">A100-SXM4-80GB</text>
    </svg>
  );
}

// ─── SM SVG ───────────────────────────────────────────────────────────────────

function SMView({ selected, onSelect }: { selected: ComponentId; onSelect: (id: ComponentId) => void }) {
  const isSel = (id: ComponentId) => selected === id;

  return (
    <svg viewBox="0 0 762 510" className="w-full h-full" style={{ fontFamily: "var(--font-mono)" }}>
      <rect x="2" y="2" width="758" height="506" rx="8" fill="#0a1120"
        stroke={isSel("sm") ? "#00ff84" : "#21262d"} strokeWidth={isSel("sm") ? 2 : 1} />
      <text x="14" y="15" fill="#3d444d" fontSize="8" letterSpacing="2">STREAMING MULTIPROCESSOR · AMPERE (SM_86)</text>

      {/* Warp Schedulers */}
      {[0, 1, 2, 3].map((i) => {
        const sel = isSel("warpScheduler");
        const x = 14 + i * 185;
        return (
          <g key={i} className="cursor-pointer" onClick={() => onSelect("warpScheduler")}>
            <rect x={x} y="22" width="175" height="90" rx="4"
              fill={sel ? "rgba(227,179,65,0.12)" : "rgba(227,179,65,0.05)"}
              stroke={sel ? "#e3b341" : "rgba(227,179,65,0.3)"} strokeWidth={sel ? 1.5 : 1} />
            <text x={x + 88} y="38" textAnchor="middle" fill={sel ? "#f0c350" : "#e3b341"} fontSize="9" letterSpacing="1">
              WARP SCHEDULER {i}
            </text>
            {[0, 1].map((d) => (
              <g key={d}>
                <rect x={x + 12 + d * 80} y="46" width="68" height="26" rx="3"
                  fill={sel ? "rgba(227,179,65,0.2)" : "rgba(227,179,65,0.08)"}
                  stroke={sel ? "rgba(227,179,65,0.6)" : "rgba(227,179,65,0.25)"} strokeWidth="1"
                  className="pointer-events-none" />
                <text x={x + 12 + d * 80 + 34} y="62" textAnchor="middle"
                  fill={sel ? "#f0c350" : "#7d8590"} fontSize="7" className="pointer-events-none">
                  Dispatch {d}
                </text>
              </g>
            ))}
            <text x={x + 88} y="100" textAnchor="middle" fill={sel ? "#e3b341" : "#3d444d"} fontSize="7"
              className="pointer-events-none">64 warps · 2,048 threads</text>
          </g>
        );
      })}

      {/* CUDA Cores */}
      {(() => {
        const sel = isSel("cudaCores");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("cudaCores")}>
            <rect x="14" y="124" width="358" height="130" rx="4"
              fill={sel ? "rgba(0,255,132,0.08)" : "rgba(0,255,132,0.03)"}
              stroke={sel ? "#00ff84" : "rgba(0,255,132,0.2)"} strokeWidth={sel ? 1.5 : 1} />
            <text x="20" y="137" fill={sel ? "#00ff84" : "#56d364"} fontSize="8" letterSpacing="1">FP32 × 64</text>
            {Array.from({ length: 64 }, (_, ci) => (
              <rect key={ci} x={20 + (ci % 8) * 18} y={142 + Math.floor(ci / 8) * 14}
                width="12" height="9" rx="2"
                fill={sel ? "rgba(0,255,132,0.5)" : "rgba(0,255,132,0.2)"} className="pointer-events-none" />
            ))}
            <text x="20" y="252" fill={sel ? "#56d364" : "#3d444d"} fontSize="8" letterSpacing="1">INT32 × 32</text>
            {Array.from({ length: 32 }, (_, ci) => (
              <rect key={ci} x={20 + (ci % 8) * 18} y={257 + Math.floor(ci / 8) * 14}
                width="12" height="9" rx="2"
                fill={sel ? "rgba(0,255,132,0.35)" : "rgba(0,255,132,0.12)"} className="pointer-events-none" />
            ))}
          </g>
        );
      })()}

      {/* Tensor Cores */}
      {(() => {
        const sel = isSel("tensorCores");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("tensorCores")}>
            <rect x="382" y="124" width="370" height="130" rx="4"
              fill={sel ? "rgba(88,166,255,0.12)" : "rgba(88,166,255,0.04)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            <text x="388" y="137" fill={sel ? "#79c0ff" : "#58a6ff"} fontSize="8" letterSpacing="1">TENSOR CORES × 4  (3rd Gen)</text>
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect x={390 + (i % 2) * 178} y={144 + Math.floor(i / 2) * 52}
                  width="162" height="44" rx="3"
                  fill={sel ? "rgba(88,166,255,0.18)" : "rgba(88,166,255,0.08)"}
                  stroke={sel ? "rgba(88,166,255,0.5)" : "rgba(88,166,255,0.2)"} strokeWidth="1"
                  className="pointer-events-none" />
                <text x={390 + (i % 2) * 178 + 81} y={144 + Math.floor(i / 2) * 52 + 18}
                  textAnchor="middle" fill={sel ? "#79c0ff" : "#3d444d"} fontSize="8" className="pointer-events-none">
                  TC {i}
                </text>
                <text x={390 + (i % 2) * 178 + 81} y={144 + Math.floor(i / 2) * 52 + 32}
                  textAnchor="middle" fill={sel ? "rgba(88,166,255,0.7)" : "#3d444d"} fontSize="7" className="pointer-events-none">
                  TF32 · BF16 · FP16 · INT8
                </text>
              </g>
            ))}
          </g>
        );
      })()}

      {/* Register File */}
      {(() => {
        const sel = isSel("registerFile");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("registerFile")}>
            <rect x="14" y="266" width="358" height="50" rx="4"
              fill={sel ? "rgba(255,123,114,0.12)" : "rgba(255,123,114,0.04)"}
              stroke={sel ? "#ff7b72" : "rgba(255,123,114,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            <text x="193" y="282" textAnchor="middle" fill={sel ? "#ff7b72" : "#7d8590"} fontSize="9" letterSpacing="1">REGISTER FILE</text>
            <text x="193" y="306" textAnchor="middle" fill={sel ? "#ff7b72" : "#3d444d"} fontSize="8">256 KB · 32-bit · ~17 TB/s</text>
          </g>
        );
      })()}

      {/* L1 / Shared Memory */}
      {(() => {
        const sel = isSel("sharedMem");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("sharedMem")}>
            <rect x="382" y="266" width="370" height="50" rx="4"
              fill={sel ? "rgba(88,166,255,0.12)" : "rgba(88,166,255,0.04)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"} strokeWidth={sel ? 1.5 : 1} />
            <text x="567" y="282" textAnchor="middle" fill={sel ? "#79c0ff" : "#7d8590"} fontSize="9" letterSpacing="1">L1 CACHE / SHARED MEM</text>
            <text x="567" y="306" textAnchor="middle" fill={sel ? "#58a6ff" : "#3d444d"} fontSize="8">192 KB · configurable · 32 banks</text>
          </g>
        );
      })()}

      {/* LD/ST */}
      {(() => {
        const sel = isSel("ldst");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("ldst")}>
            <rect x="14" y="328" width="738" height="50" rx="4"
              fill={sel ? "rgba(255,166,87,0.10)" : "rgba(255,166,87,0.03)"}
              stroke={sel ? "#ffa657" : "rgba(255,166,87,0.2)"} strokeWidth={sel ? 1.5 : 1} />
            <text x="383" y="346" textAnchor="middle" fill={sel ? "#ffa657" : "#7d8590"} fontSize="9" letterSpacing="1">LD/ST UNITS</text>
            {Array.from({ length: 32 }, (_, i) => (
              <rect key={i} x={20 + i * 22} y="352" width="16" height="18" rx="2"
                fill={sel ? "rgba(255,166,87,0.35)" : "rgba(255,166,87,0.12)"} className="pointer-events-none" />
            ))}
          </g>
        );
      })()}

      {/* SFU / misc */}
      <g>
        <rect x="14" y="390" width="738" height="34" rx="4" fill="rgba(61,68,77,0.3)" stroke="#21262d" />
        <text x="383" y="406" textAnchor="middle" fill="#3d444d" fontSize="8" letterSpacing="1">
          SFU × 16  ·  FP64 × 32  ·  Instruction Cache  ·  Constant Cache
        </text>
        <text x="383" y="418" textAnchor="middle" fill="#3d444d" fontSize="7">sin · cos · recip · sqrt · rsqrt · exp · log</text>
      </g>

      {/* Memory hierarchy */}
      <text x="14" y="440" fill="#3d444d" fontSize="7" letterSpacing="2">MEMORY HIERARCHY (fastest → slowest)</text>
      {[
        { label: "Registers", bw: "~17 TB/s", col: "#ff7b72" },
        { label: "Shared Mem", bw: "~15 TB/s", col: "#58a6ff" },
        { label: "L1 Cache", bw: "~15 TB/s", col: "#58a6ff" },
        { label: "L2 Cache", bw: "~5 TB/s", col: "#58a6ff" },
        { label: "HBM2e", bw: "2 TB/s", col: "#79c0ff" },
        { label: "PCIe (host)", bw: "64 GB/s", col: "#ffa657" },
      ].map(({ label, bw, col }, i) => (
        <g key={i}>
          <rect x={14 + i * 124} y="447" width="116" height="32" rx="3"
            fill="rgba(13,17,23,0.8)" stroke={`${col}40`} strokeWidth="1" />
          <text x={14 + i * 124 + 58} y="460" textAnchor="middle" fill={col} fontSize="8">{label}</text>
          <text x={14 + i * 124 + 58} y="473" textAnchor="middle" fill="#3d444d" fontSize="7">{bw}</text>
        </g>
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <text key={i} x={14 + (i + 1) * 124 - 3} y="466" fill="#3d444d" fontSize="9">›</text>
      ))}
      <text x="14" y="505" fill="#3d444d" fontSize="8">SM_86 · Ampere · 64 FP32 + 4 Tensor Cores + 256 KB RF</text>
    </svg>
  );
}

// ─── CPU SVG ──────────────────────────────────────────────────────────────────

function CPUView({ selected, onSelect }: { selected: ComponentId; onSelect: (id: ComponentId) => void }) {
  const [hovCore, setHovCore] = useState<string | null>(null);
  const isSel = (id: ComponentId) => selected === id;

  // AMD EPYC 7742 — 8 CCDs, 1 iOD
  // Layout: 4 CCDs top, iOD middle, 4 CCDs bottom
  const ccdW = 178, ccdH = 125;
  const ccdGap = 8;
  const ccdStartX = 10;
  const ccdTopY = 14;
  const iodY = ccdTopY + ccdH + ccdGap; // 147
  const iodH = 95;
  const ccdBotY = iodY + iodH + ccdGap; // 250

  return (
    <svg viewBox="0 0 762 510" className="w-full h-full" style={{ fontFamily: "var(--font-mono)" }}>
      <rect x="1" y="1" width="760" height="508" rx="8" fill="#080d14" stroke="#21262d" />
      <text x="14" y="14" fill="#3d444d" fontSize="8" letterSpacing="2">AMD EPYC 7742 (ROME) · CHIPLET ARCHITECTURE</text>

      {/* Package outline */}
      <rect x="6" y="8" width="750" height={ccdBotY + ccdH + 4} rx="6"
        fill="rgba(255,166,87,0.02)" stroke="rgba(255,166,87,0.15)" strokeWidth="1" />

      {/* CCDs — top row (0–3) and bottom row (4–7) */}
      {Array.from({ length: 8 }, (_, ci) => {
        const isTop = ci < 4;
        const col = ci % 4;
        const x = ccdStartX + col * (ccdW + ccdGap);
        const y = isTop ? ccdTopY : ccdBotY;
        const sel = isSel("cpuCore");
        const ccdSel = isSel("l3Cache");
        return (
          <g key={ci}>
            {/* CCD border */}
            <rect x={x} y={y} width={ccdW} height={ccdH} rx="4"
              fill="rgba(255,166,87,0.04)" stroke="rgba(255,166,87,0.2)" strokeWidth="1" />
            <text x={x + 6} y={y + 12} fill="#7d8590" fontSize="8" letterSpacing="1">CCD {ci}</text>

            {/* 8 cores (2×4) */}
            {Array.from({ length: 8 }, (_, core) => {
              const cc = core % 4, cr = Math.floor(core / 4);
              const cx = x + 6 + cc * 40, cy = y + 18 + cr * 38;
              const coreId = `${ci}-${core}`;
              const cHov = hovCore === coreId;
              return (
                <g key={core} className="cursor-pointer"
                  onClick={() => onSelect("cpuCore")}
                  onMouseEnter={() => setHovCore(coreId)}
                  onMouseLeave={() => setHovCore(null)}>
                  <rect x={cx} y={cy} width="35" height="32" rx="2"
                    fill={sel || cHov ? "rgba(255,166,87,0.2)" : "rgba(255,166,87,0.09)"}
                    stroke={sel || cHov ? "#ffa657" : "rgba(255,166,87,0.3)"} strokeWidth={cHov ? 1.5 : 1} />
                  {/* L1/L2 mini blocks */}
                  <rect x={cx + 3} y={cy + 3} width="14" height="10" rx="1"
                    fill="rgba(255,166,87,0.3)" className="pointer-events-none" />
                  <rect x={cx + 19} y={cy + 3} width="13" height="10" rx="1"
                    fill="rgba(255,166,87,0.2)" className="pointer-events-none" />
                  <text x={cx + 17} y={cy + 27} textAnchor="middle"
                    fill={cHov ? "#ffa657" : "#3d444d"} fontSize="6" className="pointer-events-none">
                    Zen2
                  </text>
                </g>
              );
            })}

            {/* L3 cache strip */}
            <g className="cursor-pointer" onClick={() => onSelect("l3Cache")}>
              <rect x={x + 6} y={y + ccdH - 24} width={ccdW - 12} height="18" rx="2"
                fill={ccdSel ? "rgba(255,166,87,0.2)" : "rgba(255,166,87,0.08)"}
                stroke={ccdSel ? "#ffa657" : "rgba(255,166,87,0.25)"} strokeWidth={ccdSel ? 1.5 : 1} />
              <text x={x + ccdW / 2} y={y + ccdH - 11} textAnchor="middle"
                fill={ccdSel ? "#ffa657" : "#3d444d"} fontSize="7" className="pointer-events-none">
                L3 · 16 MB
              </text>
            </g>

            {/* GMI link to iOD */}
            <line x1={x + ccdW / 2} y1={isTop ? y + ccdH : y}
              x2={x + ccdW / 2} y2={isTop ? iodY : iodY + iodH}
              stroke="rgba(255,166,87,0.25)" strokeWidth="2" strokeDasharray="3,3" />
          </g>
        );
      })}

      {/* iOD — I/O Die */}
      {(() => {
        const sel = isSel("dram");
        return (
          <g>
            <rect x="6" y={iodY} width="750" height={iodH} rx="4"
              fill="rgba(255,166,87,0.06)" stroke="rgba(255,166,87,0.25)" strokeWidth="1" />
            <text x="381" y={iodY + 14} textAnchor="middle" fill="#ffa657" fontSize="9" letterSpacing="2">
              iOD · I/O DIE · INFINITY FABRIC
            </text>

            {/* Memory controller blocks */}
            <g className="cursor-pointer" onClick={() => onSelect("dram")}>
              {Array.from({ length: 8 }, (_, i) => (
                <g key={i}>
                  <rect x={14 + i * 88} y={iodY + 20} width="80" height="30" rx="3"
                    fill={sel ? "rgba(88,166,255,0.2)" : "rgba(88,166,255,0.08)"}
                    stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"} strokeWidth={sel ? 1.5 : 1} />
                  <text x={14 + i * 88 + 40} y={iodY + 30} textAnchor="middle"
                    fill={sel ? "#79c0ff" : "#7d8590"} fontSize="7" className="pointer-events-none">
                    MC {i}
                  </text>
                  <text x={14 + i * 88 + 40} y={iodY + 42} textAnchor="middle"
                    fill={sel ? "#58a6ff" : "#3d444d"} fontSize="6" className="pointer-events-none">
                    DDR4
                  </text>
                </g>
              ))}
            </g>

            {/* PCIe lanes */}
            <g>
              <rect x="14" y={iodY + 58} width="340" height="26" rx="3"
                fill="rgba(255,166,87,0.08)" stroke="rgba(255,166,87,0.2)" strokeWidth="1" />
              <text x="184" y={iodY + 72} textAnchor="middle" fill="#7d8590" fontSize="8">
                PCIe Gen 4.0 · 128 lanes (to GPUs + NVMe)
              </text>
            </g>
            <g>
              <rect x="370" y={iodY + 58} width="380" height="26" rx="3"
                fill="rgba(188,140,255,0.06)" stroke="rgba(188,140,255,0.2)" strokeWidth="1" />
              <text x="560" y={iodY + 72} textAnchor="middle" fill="#7d8590" fontSize="8">
                Infinity Fabric (to second CPU socket)  ·  GMI links to 8 CCDs
              </text>
            </g>
          </g>
        );
      })()}

      {/* CPU vs GPU comparison */}
      <text x="14" y={ccdBotY + ccdH + 22} fill="#3d444d" fontSize="8" letterSpacing="2">
        CPU vs GPU — DESIGN PHILOSOPHY
      </text>
      {[
        { label: "Cores", cpu: "64 (complex, OOO)", gpu: "6,912 (simple, in-order)", cpuW: 140, gpuW: 220 },
        { label: "Clock", cpu: "3.4 GHz boost", gpu: "1.41 GHz", cpuW: 100, gpuW: 60 },
        { label: "Peak FP32", cpu: "~3.5 TFLOPS", gpu: "19.5 TFLOPS", cpuW: 30, gpuW: 180 },
        { label: "Cache", cpu: "256 MB L3", gpu: "40 MB L2", cpuW: 60, gpuW: 40 },
        { label: "DRAM BW", cpu: "204 GB/s", gpu: "2,039 GB/s (HBM)", cpuW: 15, gpuW: 160 },
        { label: "Threads", cpu: "128 (2 per core)", gpu: "221,184 max", cpuW: 10, gpuW: 190 },
      ].map(({ label, cpu, gpu, cpuW, gpuW }, i) => {
        const y = ccdBotY + ccdH + 32 + i * 24;
        return (
          <g key={i}>
            <text x="14" y={y + 11} fill="#3d444d" fontSize="8" letterSpacing="0.5">{label}</text>
            <rect x="110" y={y} width={cpuW} height="16" rx="2" fill="rgba(255,166,87,0.2)" stroke="rgba(255,166,87,0.3)" strokeWidth="0.5" />
            <text x={110 + cpuW + 5} y={y + 11} fill="#ffa657" fontSize="7">{cpu}</text>
            <rect x="430" y={y} width={gpuW} height="16" rx="2" fill="rgba(0,255,132,0.15)" stroke="rgba(0,255,132,0.25)" strokeWidth="0.5" />
            <text x={430 + gpuW + 5} y={y + 11} fill="#00ff84" fontSize="7">{gpu}</text>
          </g>
        );
      })}
      <text x="110" y={ccdBotY + ccdH + 29} fill="#ffa657" fontSize="7" letterSpacing="1">CPU (EPYC 7742)</text>
      <text x="430" y={ccdBotY + ccdH + 29} fill="#00ff84" fontSize="7" letterSpacing="1">GPU (A100)</text>
    </svg>
  );
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

function InfoPanel({
  componentId,
  view,
  onDrillSM,
  onDrillNode,
  onDrillGPU,
  onDrillCPU,
}: {
  componentId: ComponentId;
  view: View;
  onDrillSM: () => void;
  onDrillNode: () => void;
  onDrillGPU: () => void;
  onDrillCPU: () => void;
}) {
  const comp = COMPONENTS[componentId];

  const catColor: Record<string, string> = {
    Cluster: "#bc8cff", Node: "#bc8cff", Network: "#e3b341",
    Interconnect: "#ffa657", CPU: "#ffa657", Storage: "#7d8590",
    Die: "#00ff84", Compute: "#00ff84", Control: "#e3b341",
    Memory: "#58a6ff",
  };
  const catCol = catColor[comp.category] ?? "#7d8590";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="font-mono text-[10px] px-2 py-0.5 rounded uppercase tracking-widest"
          style={{ background: `${catCol}18`, color: catCol, border: `1px solid ${catCol}30` }}>
          {comp.category}
        </span>
      </div>

      <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] leading-snug mb-3 flex-shrink-0">
        {comp.name}
      </h2>

      <div className="rounded-lg border border-[var(--border)] overflow-hidden mb-4 flex-shrink-0"
        style={{ background: "var(--bg-surface)" }}>
        {comp.stats.map(({ label, value }, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] last:border-b-0">
            <span className="text-[10px] text-[var(--text-muted)] font-mono">{label}</span>
            <span className="text-[10px] font-mono font-semibold" style={{ color: comp.color }}>{value}</span>
          </div>
        ))}
      </div>

      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed mb-4 overflow-y-auto flex-1 min-h-0">
        {comp.description}
      </p>

      <div className="flex flex-col gap-2 mt-auto flex-shrink-0">
        {"drillable" in comp && comp.drillable && (
          <>
            {componentId === "dgxNode" && (
              <button onClick={onDrillNode}
                className="w-full py-2 rounded-lg font-mono text-xs font-semibold transition-all"
                style={{ background: "rgba(188,140,255,0.1)", border: "1px solid rgba(188,140,255,0.3)", color: "#bc8cff" }}>
                Explore node internals →
              </button>
            )}
            {componentId === "sm" && (
              <button onClick={onDrillSM}
                className="w-full py-2 rounded-lg font-mono text-xs font-semibold transition-all"
                style={{ background: "rgba(0,255,132,0.1)", border: "1px solid rgba(0,255,132,0.3)", color: "#00ff84" }}>
                Explore SM internals →
              </button>
            )}
            {componentId === "cpu" && (
              <button onClick={onDrillCPU}
                className="w-full py-2 rounded-lg font-mono text-xs font-semibold transition-all"
                style={{ background: "rgba(255,166,87,0.1)", border: "1px solid rgba(255,166,87,0.3)", color: "#ffa657" }}>
                Explore CPU die →
              </button>
            )}
          </>
        )}
        {(componentId === "chip" || componentId === "gpc") && view === "node" && (
          <button onClick={onDrillGPU}
            className="w-full py-2 rounded-lg font-mono text-xs font-semibold transition-all"
            style={{ background: "rgba(0,255,132,0.1)", border: "1px solid rgba(0,255,132,0.3)", color: "#00ff84" }}>
            Explore GPU die →
          </button>
        )}
        {"conceptSlug" in comp && comp.conceptSlug && (
          <Link href={`/concepts/${comp.conceptSlug}`}
            className="w-full py-2 rounded-lg font-mono text-xs text-center transition-colors"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            Read concept →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

const VIEW_CRUMBS: Record<View, { label: string; view: View }[]> = {
  cluster: [{ label: "Cluster", view: "cluster" }],
  node: [{ label: "Cluster", view: "cluster" }, { label: "Node", view: "node" }],
  gpu: [{ label: "Cluster", view: "cluster" }, { label: "Node", view: "node" }, { label: "GPU Die", view: "gpu" }],
  sm: [{ label: "Cluster", view: "cluster" }, { label: "Node", view: "node" }, { label: "GPU Die", view: "gpu" }, { label: "SM", view: "sm" }],
  cpu: [{ label: "Cluster", view: "cluster" }, { label: "Node", view: "node" }, { label: "CPU", view: "cpu" }],
};

const VIEW_QUICK: Record<View, ComponentId[]> = {
  cluster: ["clusterFabric", "dgxNode", "infiniband", "nvswitch", "nvme"],
  node: ["dgxNode", "cpu", "chip", "dram", "nvswitch", "nvme"],
  gpu: ["chip", "gpc", "sm", "l2Cache", "hbm", "pcie"],
  sm: ["sm", "warpScheduler", "cudaCores", "tensorCores", "registerFile", "sharedMem", "ldst"],
  cpu: ["cpu", "cpuCore", "l3Cache", "dram"],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GPUPage() {
  const [view, setView] = useState<View>("cluster");
  const [selected, setSelected] = useState<ComponentId>("clusterFabric");

  const navigateTo = (v: View, sel: ComponentId) => {
    setView(v);
    setSelected(sel);
  };

  const handleDrillNode = () => navigateTo("node", "dgxNode");
  const handleDrillGPU = () => navigateTo("gpu", "chip");
  const handleDrillCPU = () => navigateTo("cpu", "cpu");
  const handleDrillSM = () => navigateTo("sm", "sm");

  const viewTitles: Record<View, string> = {
    cluster: "AI Training Cluster",
    node: "DGX A100 Node",
    gpu: "GPU Die — A100",
    sm: "Streaming Multiprocessor",
    cpu: "CPU Die — EPYC 7742",
  };

  const viewSubtitles: Record<View, string> = {
    cluster: "Click a node to drill in, or click any component to learn about it.",
    node: "Click a GPU to explore its die, or a CPU to see the chiplet layout.",
    gpu: "Click any region to learn more. Click an SM to zoom in.",
    sm: "Every CUDA kernel runs here. Click sub-units to explore.",
    cpu: "64-core Zen 2 chiplet CPU. Compare design philosophy with the GPU.",
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Nav active="gpu" />

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {VIEW_CRUMBS[view].map((crumb, i, arr) => (
              <span key={crumb.view} className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const defaults: Record<View, ComponentId> = {
                      cluster: "clusterFabric", node: "dgxNode",
                      gpu: "chip", sm: "sm", cpu: "cpu",
                    };
                    navigateTo(crumb.view, defaults[crumb.view]);
                  }}
                  className="font-mono text-xs transition-colors"
                  style={{ color: i === arr.length - 1 ? "var(--text-primary)" : "var(--text-muted)" }}
                >
                  {crumb.label}
                </button>
                {i < arr.length - 1 && <span className="text-[var(--text-subtle)] font-mono text-xs">›</span>}
              </span>
            ))}
          </div>
          <h1 className="font-mono text-2xl font-semibold text-[var(--text-primary)]">{viewTitles[view]}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{viewSubtitles[view]}</p>
        </div>

        {/* Main layout */}
        <div className="flex gap-5" style={{ height: "calc(100vh - 230px)", minHeight: "500px" }}>
          {/* SVG panel */}
          <div className="flex-1 rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: "#080d14" }}>
            {view === "cluster" && (
              <ClusterView selected={selected} onSelect={setSelected} onDrillNode={handleDrillNode} />
            )}
            {view === "node" && (
              <NodeView selected={selected} onSelect={setSelected} onDrillGPU={handleDrillGPU} onDrillCPU={handleDrillCPU} />
            )}
            {view === "gpu" && (
              <ChipView selected={selected} onSelect={setSelected} />
            )}
            {view === "sm" && (
              <SMView selected={selected} onSelect={setSelected} />
            )}
            {view === "cpu" && (
              <CPUView selected={selected} onSelect={setSelected} />
            )}
          </div>

          {/* Info panel */}
          <div className="w-72 flex-shrink-0 rounded-xl border border-[var(--border)] p-4"
            style={{ background: "var(--bg-surface)" }}>
            <InfoPanel
              componentId={selected}
              view={view}
              onDrillSM={handleDrillSM}
              onDrillNode={handleDrillNode}
              onDrillGPU={handleDrillGPU}
              onDrillCPU={handleDrillCPU}
            />
          </div>
        </div>

        {/* Quick-select chips */}
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          {VIEW_QUICK[view].map((id) => {
            const comp = COMPONENTS[id];
            const active = selected === id;
            return (
              <button key={id} onClick={() => setSelected(id)}
                className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all"
                style={{
                  background: active ? `${comp.color}18` : "var(--bg-raised)",
                  border: `1px solid ${active ? comp.color + "50" : "var(--border)"}`,
                  color: active ? comp.color : "var(--text-muted)",
                }}>
                {comp.name.split("—")[0].split("(")[0].trim()}
              </button>
            );
          })}

          {/* Drill-down shortcut buttons */}
          <div className="ml-auto flex gap-2">
            {view === "cluster" && (
              <button onClick={handleDrillNode}
                className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all"
                style={{ background: "rgba(188,140,255,0.08)", border: "1px solid rgba(188,140,255,0.3)", color: "#bc8cff" }}>
                Explore Node →
              </button>
            )}
            {view === "node" && (
              <>
                <button onClick={handleDrillCPU}
                  className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all"
                  style={{ background: "rgba(255,166,87,0.08)", border: "1px solid rgba(255,166,87,0.3)", color: "#ffa657" }}>
                  CPU Die →
                </button>
                <button onClick={handleDrillGPU}
                  className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all"
                  style={{ background: "rgba(0,255,132,0.08)", border: "1px solid rgba(0,255,132,0.3)", color: "#00ff84" }}>
                  GPU Die →
                </button>
              </>
            )}
            {view === "gpu" && (
              <button onClick={handleDrillSM}
                className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all"
                style={{ background: "rgba(0,255,132,0.08)", border: "1px solid rgba(0,255,132,0.3)", color: "#00ff84" }}>
                Explore SM →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
