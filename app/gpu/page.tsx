"use client";

import { useState } from "react";
import Nav from "../components/Nav";
import Link from "next/link";

// ─── Component data ───────────────────────────────────────────────────────────

const COMPONENTS = {
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
      { label: "SMs per TPC", value: "2" },
    ],
    description:
      "A GPC is the largest subdivision of the GPU die. The A100 has 8 GPCs. Each GPC shares instruction caches and a raster engine across its SMs. GPCs also improve manufacturing yield: the full GA100 die has 128 SMs, but chips ship with 108 — defective GPCs are disabled while the rest remains functional. This is why binned SKUs (A100 40 GB, A100 80 GB) have slightly different SM counts.",
    conceptSlug: "gpu-thread-hierarchy",
  },
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
      "The SM is where all CUDA code executes. When you launch a kernel, CUDA assigns thread blocks to SMs. Each SM runs up to 64 warps (2,048 threads) concurrently by multiplexing them across 4 warp schedulers. When one warp stalls on a memory access, the scheduler instantly switches to another eligible warp — this latency hiding is the fundamental performance model of the GPU. Click 'Explore SM internals' to zoom in.",
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
      "Each SM contains 4 independent warp schedulers. Every clock cycle, each scheduler selects one eligible warp from its pool and issues up to 2 independent instructions via its dual dispatch units. A warp becomes eligible once all its dependencies resolve. With 64 resident warps, the schedulers can hide hundreds of cycles of memory latency by always having something useful to run.",
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
      "Each FP32 CUDA core executes one floating-point multiply or add per clock. A warp of 32 threads maps to 32 cores executing in lockstep (SIMT — Single Instruction, Multiple Threads). All threads in a warp execute the same instruction but on different data. In Ampere, the FP32 and INT32 pipelines are fully independent: you can run 64 FP32 ops while simultaneously running 32 INT32 ops, enabling overlap of address arithmetic with math.",
    conceptSlug: "gpu-thread-hierarchy",
  },
  tensorCores: {
    name: "Tensor Cores (3rd Gen)",
    category: "Compute",
    color: "#58a6ff",
    stats: [
      { label: "Tensor Cores per SM", value: "4" },
      { label: "Total on A100", value: "432" },
      { label: "Supported dtypes", value: "TF32, BF16, FP16, INT8, INT4, INT1" },
      { label: "Peak FP16 (dense)", value: "312 TFLOPS" },
      { label: "Peak FP16 (2:4 sparse)", value: "624 TFLOPS" },
      { label: "Fragment op (FP16)", value: "16×16×16 wmma" },
    ],
    description:
      "Tensor Cores are specialized matrix multiply-accumulate units introduced in Volta (2017) and improved each generation. An entire warp cooperates to compute a matrix fragment multiply in a single instruction — for FP16 that's a 16×16×16 operation per clock. This is how cuBLAS, cuDNN, and Flash Attention achieve hundreds of TFLOPS. The 3rd-gen cores in Ampere added TF32 (full FP32 precision range at 10× throughput) and 2:4 structured sparsity for an additional 2× speedup.",
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
      { label: "Max per block", value: "65,536 registers" },
      { label: "Bandwidth", value: "~17 TB/s (per SM)" },
    ],
    description:
      "The register file is the fastest memory on the GPU. Every local variable in your kernel lives here. With 256 KB and up to 255 registers per thread, there is a real occupancy tension: more registers per thread means fewer threads can be simultaneously resident, reducing the scheduler's ability to hide latency. Nsight Compute shows register usage per kernel — this is one of the most impactful tuning parameters for high-throughput kernels.",
    conceptSlug: "occupancy",
  },
  sharedMem: {
    name: "L1 Cache / Shared Memory",
    category: "Memory",
    color: "#58a6ff",
    stats: [
      { label: "Total SRAM per SM", value: "192 KB" },
      { label: "Configurable split", value: "Yes" },
      { label: "Default (L1 / Shared)", value: "128 KB / 64 KB" },
      { label: "Max Shared Memory", value: "164 KB (with carveout)" },
      { label: "Shared memory banks", value: "32 (4-byte width)" },
    ],
    description:
      "The 192 KB on-chip SRAM is split between a hardware-managed L1 cache and a software-managed scratchpad (shared memory). Shared memory is explicitly managed with __shared__ variables and is as fast as registers when accessed without bank conflicts. It is the key to tiled algorithms: SGEMM, Flash Attention, and parallel scan all depend on it. If multiple threads in a warp access the same bank simultaneously, accesses serialize (a bank conflict).",
    conceptSlug: "shared-memory",
  },
  ldst: {
    name: "LD/ST Units (Load/Store)",
    category: "Compute",
    color: "#ffa657",
    stats: [
      { label: "LD/ST units per SM", value: "32" },
      { label: "Memory spaces handled", value: "Global, shared, local, const" },
      { label: "Cache line width", value: "128 bytes" },
    ],
    description:
      "LD/ST units handle all memory traffic: loads from global/shared/local memory, stores, and atomic operations. When a warp of 32 threads executes a load, all 32 addresses are fed into the LD/ST units simultaneously. If the addresses fall into consecutive 128-byte cache lines, they merge into 1–4 requests (coalesced). Scattered addresses can generate up to 32 separate cache line requests, killing throughput.",
    conceptSlug: "global-memory-coalescing",
  },
  l2Cache: {
    name: "L2 Cache",
    category: "Memory",
    color: "#58a6ff",
    stats: [
      { label: "Total on A100", value: "40 MB" },
      { label: "Bandwidth", value: "~5 TB/s" },
      { label: "Partitions", value: "2 cross-bar halves" },
      { label: "Residence control", value: "Yes (CUDA 11.1+)" },
    ],
    description:
      "The L2 is shared across all 108 SMs. At 40 MB it is 6× larger than Volta's — many inference workloads fit their entire activation tensors here, eliminating HBM traffic. CUDA 11.1 introduced L2 residence controls (cudaAccessPolicyWindow) that let you pin hot data (e.g., embedding tables, bias vectors) into a reserved L2 partition to prevent eviction by other kernels.",
    conceptSlug: "cuda-memory-hierarchy",
  },
  hbm: {
    name: "HBM2e — High Bandwidth Memory",
    category: "Memory",
    color: "#58a6ff",
    stats: [
      { label: "Capacity", value: "80 GB" },
      { label: "Bandwidth", value: "2,039 GB/s" },
      { label: "HBM2e stacks", value: "6" },
      { label: "Bus width", value: "6 × 1024-bit = 6,144-bit" },
      { label: "Latency", value: "~200 ns (vs ~5 ns for L1)" },
    ],
    description:
      "HBM (High Bandwidth Memory) stacks DRAM dies vertically and connects them via a silicon interposer. Compared to GDDR6X in gaming GPUs, HBM2e offers ~2× the bandwidth at lower power, but at much higher cost. This is global memory in CUDA — your device arrays live here. Coalesced, 128-byte aligned accesses are essential for approaching the 2 TB/s peak. Uncoalesced scatter-gather patterns can reduce effective bandwidth to under 100 GB/s.",
    conceptSlug: "global-memory-coalescing",
  },
  pcie: {
    name: "PCIe 4.0 / NVLink 3.0",
    category: "Interconnect",
    color: "#ffa657",
    stats: [
      { label: "PCIe bandwidth", value: "64 GB/s bidirectional" },
      { label: "NVLink bandwidth", value: "600 GB/s bidirectional" },
      { label: "NVLink version", value: "3.0 (12 links)" },
    ],
    description:
      "PCIe connects the GPU to the CPU host. Every cudaMemcpy uses this bus. At 64 GB/s it is ~32× slower than HBM — minimizing host↔device transfers is critical. In DGX A100 systems, NVLink replaces PCIe for GPU-to-GPU communication at 600 GB/s, fast enough for model-parallel training of large LLMs. NVSwitch creates a fully non-blocking fabric between all 8 GPUs in the node.",
    conceptSlug: "multi-gpu",
  },
} as const;

type ComponentId = keyof typeof COMPONENTS;

// ─── Chip SVG ─────────────────────────────────────────────────────────────────

function ChipView({
  selected,
  onSelect,
  onDrillSM,
}: {
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
  onDrillSM: () => void;
}) {
  const [hoveredGpc, setHoveredGpc] = useState<number | null>(null);
  const [hoveredSm, setHoveredSm] = useState<string | null>(null);

  const isSelected = (id: ComponentId) => selected === id;

  // 8 GPCs in 2 rows × 4 cols
  const gpcs = Array.from({ length: 8 }, (_, i) => ({
    col: i % 4,
    row: Math.floor(i / 4),
    idx: i,
  }));

  const gpcW = 168, gpcH = 118, gpcGapX = 10, gpcGapY = 10;
  const gpcStartX = 16, gpcStartY = 16;

  // 6 SMs per GPC (3×2)
  const smW = 46, smH = 42, smGapX = 6, smGapY = 5;
  const smPad = 10;

  return (
    <svg
      viewBox="0 0 762 510"
      className="w-full h-full"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {/* Die background */}
      <rect
        x="2" y="2" width="758" height="506" rx="8"
        fill="#0a1120" stroke={isSelected("chip") ? "#00ff84" : "#21262d"}
        strokeWidth={isSelected("chip") ? 2 : 1}
        className="cursor-pointer"
        onClick={() => onSelect("chip")}
      />
      {/* Die label */}
      <text x="381" y="498" textAnchor="middle" fill="#3d444d" fontSize="9" letterSpacing="2">
        GA100 · TSMC 7nm · 826 mm² · 54.2B transistors
      </text>

      {/* GPCs */}
      {gpcs.map(({ col, row, idx }) => {
        const x = gpcStartX + col * (gpcW + gpcGapX);
        const y = gpcStartY + row * (gpcH + gpcGapY);
        const hov = hoveredGpc === idx;
        const sel = isSelected("gpc");
        return (
          <g key={idx}>
            <rect
              x={x} y={y} width={gpcW} height={gpcH} rx="4"
              fill={sel || hov ? "rgba(188,140,255,0.08)" : "rgba(188,140,255,0.03)"}
              stroke={sel ? "#bc8cff" : hov ? "rgba(188,140,255,0.5)" : "rgba(188,140,255,0.2)"}
              strokeWidth={sel ? 1.5 : 1}
              className="cursor-pointer transition-all"
              onClick={() => onSelect("gpc")}
              onMouseEnter={() => setHoveredGpc(idx)}
              onMouseLeave={() => setHoveredGpc(null)}
            />
            <text x={x + 6} y={y + 11} fill={sel ? "#d2a8ff" : "#7d8590"} fontSize="8" letterSpacing="1">
              GPC {idx}
            </text>

            {/* SMs inside GPC */}
            {Array.from({ length: 6 }, (_, si) => {
              const sc = si % 3, sr = Math.floor(si / 3);
              const sx = x + smPad + sc * (smW + smGapX);
              const sy = y + 16 + sr * (smH + smGapY);
              const smId = `${idx}-${si}`;
              const smHov = hoveredSm === smId;
              const smSel = isSelected("sm");
              return (
                <g key={si}>
                  <rect
                    x={sx} y={sy} width={smW} height={smH} rx="3"
                    fill={smSel || smHov ? "rgba(0,255,132,0.12)" : "rgba(0,255,132,0.04)"}
                    stroke={smSel ? "#00ff84" : smHov ? "rgba(0,255,132,0.6)" : "rgba(0,255,132,0.2)"}
                    strokeWidth={smSel ? 1.5 : 1}
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onSelect("sm"); }}
                    onMouseEnter={() => setHoveredSm(smId)}
                    onMouseLeave={() => setHoveredSm(null)}
                  />
                  {/* SM mini cores grid */}
                  {Array.from({ length: 8 }, (_, ci) => (
                    <rect
                      key={ci}
                      x={sx + 4 + (ci % 4) * 9}
                      y={sy + 8 + Math.floor(ci / 4) * 9}
                      width="6" height="6" rx="1"
                      fill={smSel || smHov ? "rgba(0,255,132,0.5)" : "rgba(0,255,132,0.2)"}
                      className="pointer-events-none"
                    />
                  ))}
                  <text
                    x={sx + smW / 2} y={sy + smH - 4}
                    textAnchor="middle" fill={smSel || smHov ? "#56d364" : "#3d444d"} fontSize="7"
                    className="pointer-events-none"
                  >
                    SM
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* L2 Cache stripe */}
      {(() => {
        const sel = isSelected("l2Cache");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("l2Cache")}>
            <rect
              x="16" y="264" width="730" height="36" rx="4"
              fill={sel ? "rgba(88,166,255,0.12)" : "rgba(88,166,255,0.05)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            <text x="381" y="278" textAnchor="middle" fill={sel ? "#79c0ff" : "#58a6ff"} fontSize="9" letterSpacing="1.5">
              L2 CACHE
            </text>
            <text x="381" y="291" textAnchor="middle" fill={sel ? "#58a6ff" : "#3d444d"} fontSize="8">
              40 MB · ~5 TB/s
            </text>
          </g>
        );
      })()}

      {/* HBM stacks */}
      {Array.from({ length: 6 }, (_, i) => {
        const sel = isSelected("hbm");
        const w = 112, h = 68, gap = 10;
        const totalW = 6 * w + 5 * gap;
        const startX = (762 - totalW) / 2;
        const x = startX + i * (w + gap);
        return (
          <g key={i} className="cursor-pointer" onClick={() => onSelect("hbm")}>
            <rect
              x={x} y="312" width={w} height={h} rx="4"
              fill={sel ? "rgba(88,166,255,0.15)" : "rgba(88,166,255,0.06)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.3)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            {/* HBM die lines */}
            {[0, 1, 2, 3].map((d) => (
              <rect
                key={d}
                x={x + 6} y={312 + 8 + d * 13}
                width={w - 12} height="9" rx="1"
                fill={sel ? "rgba(88,166,255,0.3)" : "rgba(88,166,255,0.12)"}
                className="pointer-events-none"
              />
            ))}
            <text
              x={x + w / 2} y={312 + h - 4}
              textAnchor="middle" fill={sel ? "#79c0ff" : "#3d444d"} fontSize="7"
              className="pointer-events-none"
            >
              HBM2e
            </text>
          </g>
        );
      })}

      {/* Memory bus lines */}
      {Array.from({ length: 6 }, (_, i) => {
        const w = 112, gap = 10;
        const totalW = 6 * w + 5 * gap;
        const startX = (762 - totalW) / 2;
        const cx = startX + i * (w + gap) + w / 2;
        return (
          <line
            key={i} x1={cx} y1="300" x2={cx} y2="312"
            stroke="rgba(88,166,255,0.2)" strokeWidth="1" strokeDasharray="2,2"
            className="pointer-events-none"
          />
        );
      })}
      <text x="381" y="392" textAnchor="middle" fill="#3d444d" fontSize="8" letterSpacing="1">
        6 × 1024-bit · 2,039 GB/s
      </text>

      {/* PCIe / NVLink bar */}
      {(() => {
        const sel = isSelected("pcie");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("pcie")}>
            <rect
              x="16" y="393" width="730" height="30" rx="4"
              fill={sel ? "rgba(255,166,87,0.12)" : "rgba(255,166,87,0.04)"}
              stroke={sel ? "#ffa657" : "rgba(255,166,87,0.25)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            {/* PCIe fingers */}
            {Array.from({ length: 30 }, (_, i) => (
              <rect
                key={i} x={22 + i * 24} y="417" width="10" height="6" rx="1"
                fill={sel ? "rgba(255,166,87,0.5)" : "rgba(255,166,87,0.2)"}
                className="pointer-events-none"
              />
            ))}
            <text x="160" y="409" fill={sel ? "#ffa657" : "#7d8590"} fontSize="8" letterSpacing="1">
              PCIe 4.0 ×16 · 64 GB/s
            </text>
            <text x="440" y="409" fill={sel ? "#ffa657" : "#7d8590"} fontSize="8" letterSpacing="1">
              NVLink 3.0 · 600 GB/s
            </text>
          </g>
        );
      })()}

      {/* Corner label */}
      <text x="14" y="505" fill="#3d444d" fontSize="8">A100-SXM4-80GB</text>
    </svg>
  );
}

// ─── SM SVG ───────────────────────────────────────────────────────────────────

function SMView({
  selected,
  onSelect,
}: {
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
}) {
  const isSelected = (id: ComponentId) => selected === id;

  const wsLabels = ["Warp\nSched 0", "Warp\nSched 1", "Warp\nSched 2", "Warp\nSched 3"];

  return (
    <svg
      viewBox="0 0 762 510"
      className="w-full h-full"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {/* SM border */}
      <rect
        x="2" y="2" width="758" height="506" rx="8"
        fill="#0a1120" stroke={isSelected("sm") ? "#00ff84" : "#21262d"}
        strokeWidth={isSelected("sm") ? 2 : 1}
      />
      <text x="14" y="15" fill="#3d444d" fontSize="8" letterSpacing="2">STREAMING MULTIPROCESSOR · AMPERE (SM_86)</text>

      {/* Warp Schedulers — 4 across */}
      {wsLabels.map((label, i) => {
        const sel = isSelected("warpScheduler");
        const x = 14 + i * 185;
        return (
          <g key={i} className="cursor-pointer" onClick={() => onSelect("warpScheduler")}>
            <rect
              x={x} y="22" width="175" height="90" rx="4"
              fill={sel ? "rgba(227,179,65,0.12)" : "rgba(227,179,65,0.05)"}
              stroke={sel ? "#e3b341" : "rgba(227,179,65,0.3)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            <text x={x + 88} y="38" textAnchor="middle" fill={sel ? "#f0c350" : "#e3b341"} fontSize="9" letterSpacing="1">
              WARP SCHEDULER {i}
            </text>
            {/* Dispatch units */}
            {[0, 1].map((d) => (
              <g key={d}>
                <rect
                  x={x + 12 + d * 80} y="46" width="68" height="26" rx="3"
                  fill={sel ? "rgba(227,179,65,0.2)" : "rgba(227,179,65,0.08)"}
                  stroke={sel ? "rgba(227,179,65,0.6)" : "rgba(227,179,65,0.25)"}
                  strokeWidth="1"
                  className="pointer-events-none"
                />
                <text
                  x={x + 12 + d * 80 + 34} y="62" textAnchor="middle"
                  fill={sel ? "#f0c350" : "#7d8590"} fontSize="7"
                  className="pointer-events-none"
                >
                  Dispatch {d}
                </text>
              </g>
            ))}
            <text x={x + 88} y="100" textAnchor="middle" fill={sel ? "#e3b341" : "#3d444d"} fontSize="7"
              className="pointer-events-none">
              64 warps · 2,048 threads
            </text>
          </g>
        );
      })}

      {/* CUDA Cores section */}
      {(() => {
        const sel = isSelected("cudaCores");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("cudaCores")}>
            <rect
              x="14" y="124" width="358" height="130" rx="4"
              fill={sel ? "rgba(0,255,132,0.08)" : "rgba(0,255,132,0.03)"}
              stroke={sel ? "#00ff84" : "rgba(0,255,132,0.2)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            <text x="20" y="137" fill={sel ? "#00ff84" : "#56d364"} fontSize="8" letterSpacing="1">FP32 × 64</text>
            {/* FP32 dots: 8×8 */}
            {Array.from({ length: 64 }, (_, ci) => (
              <rect
                key={ci}
                x={20 + (ci % 8) * 18}
                y={142 + Math.floor(ci / 8) * 14}
                width="12" height="9" rx="2"
                fill={sel ? "rgba(0,255,132,0.5)" : "rgba(0,255,132,0.2)"}
                className="pointer-events-none"
              />
            ))}
            <text x="20" y="252" fill={sel ? "#56d364" : "#3d444d"} fontSize="8" letterSpacing="1">INT32 × 32</text>
            {/* INT32 dots: 8×4 */}
            {Array.from({ length: 32 }, (_, ci) => (
              <rect
                key={ci}
                x={20 + (ci % 8) * 18}
                y={148 + 98 + Math.floor(ci / 8) * 14}
                width="12" height="9" rx="2"
                fill={sel ? "rgba(0,255,132,0.35)" : "rgba(0,255,132,0.12)"}
                className="pointer-events-none"
              />
            ))}
          </g>
        );
      })()}

      {/* Tensor Cores */}
      {(() => {
        const sel = isSelected("tensorCores");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("tensorCores")}>
            <rect
              x="382" y="124" width="370" height="130" rx="4"
              fill={sel ? "rgba(88,166,255,0.12)" : "rgba(88,166,255,0.04)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            <text x="388" y="137" fill={sel ? "#79c0ff" : "#58a6ff"} fontSize="8" letterSpacing="1">TENSOR CORES × 4  (3rd Gen)</text>
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect
                  x={390 + (i % 2) * 178}
                  y={144 + Math.floor(i / 2) * 52}
                  width="162" height="44" rx="3"
                  fill={sel ? "rgba(88,166,255,0.18)" : "rgba(88,166,255,0.08)"}
                  stroke={sel ? "rgba(88,166,255,0.5)" : "rgba(88,166,255,0.2)"}
                  strokeWidth="1"
                  className="pointer-events-none"
                />
                <text
                  x={390 + (i % 2) * 178 + 81}
                  y={144 + Math.floor(i / 2) * 52 + 18}
                  textAnchor="middle" fill={sel ? "#79c0ff" : "#3d444d"} fontSize="8"
                  className="pointer-events-none"
                >
                  TC {i}
                </text>
                <text
                  x={390 + (i % 2) * 178 + 81}
                  y={144 + Math.floor(i / 2) * 52 + 32}
                  textAnchor="middle" fill={sel ? "rgba(88,166,255,0.7)" : "#3d444d"} fontSize="7"
                  className="pointer-events-none"
                >
                  TF32 · BF16 · FP16 · INT8
                </text>
              </g>
            ))}
          </g>
        );
      })()}

      {/* Register File */}
      {(() => {
        const sel = isSelected("registerFile");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("registerFile")}>
            <rect
              x="14" y="266" width="358" height="50" rx="4"
              fill={sel ? "rgba(255,123,114,0.12)" : "rgba(255,123,114,0.04)"}
              stroke={sel ? "#ff7b72" : "rgba(255,123,114,0.25)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            <text x="193" y="282" textAnchor="middle" fill={sel ? "#ff7b72" : "#7d8590"} fontSize="9" letterSpacing="1">
              REGISTER FILE
            </text>
            <text x="193" y="306" textAnchor="middle" fill={sel ? "#ff7b72" : "#3d444d"} fontSize="8">
              256 KB · 32-bit · ~17 TB/s
            </text>
          </g>
        );
      })()}

      {/* L1 / Shared Memory */}
      {(() => {
        const sel = isSelected("sharedMem");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("sharedMem")}>
            <rect
              x="382" y="266" width="370" height="50" rx="4"
              fill={sel ? "rgba(88,166,255,0.12)" : "rgba(88,166,255,0.04)"}
              stroke={sel ? "#58a6ff" : "rgba(88,166,255,0.25)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            <text x="567" y="282" textAnchor="middle" fill={sel ? "#79c0ff" : "#7d8590"} fontSize="9" letterSpacing="1">
              L1 CACHE / SHARED MEMORY
            </text>
            <text x="567" y="306" textAnchor="middle" fill={sel ? "#58a6ff" : "#3d444d"} fontSize="8">
              192 KB · configurable split · 32 banks
            </text>
          </g>
        );
      })()}

      {/* LD/ST Units */}
      {(() => {
        const sel = isSelected("ldst");
        return (
          <g className="cursor-pointer" onClick={() => onSelect("ldst")}>
            <rect
              x="14" y="328" width="738" height="50" rx="4"
              fill={sel ? "rgba(255,166,87,0.10)" : "rgba(255,166,87,0.03)"}
              stroke={sel ? "#ffa657" : "rgba(255,166,87,0.2)"}
              strokeWidth={sel ? 1.5 : 1}
            />
            <text x="383" y="346" textAnchor="middle" fill={sel ? "#ffa657" : "#7d8590"} fontSize="9" letterSpacing="1">
              LD/ST UNITS
            </text>
            {/* 32 unit bars */}
            {Array.from({ length: 32 }, (_, i) => (
              <rect
                key={i}
                x={20 + i * 22} y="352" width="16" height="18" rx="2"
                fill={sel ? "rgba(255,166,87,0.35)" : "rgba(255,166,87,0.12)"}
                className="pointer-events-none"
              />
            ))}
          </g>
        );
      })()}

      {/* SFU row */}
      <g>
        <rect x="14" y="390" width="738" height="34" rx="4"
          fill="rgba(61,68,77,0.3)" stroke="#21262d" strokeWidth="1" />
        <text x="383" y="406" textAnchor="middle" fill="#3d444d" fontSize="8" letterSpacing="1">
          SFU (Special Function Units) × 16  ·  FP64 × 32  ·  Instruction Cache  ·  Constant Cache
        </text>
        <text x="383" y="418" textAnchor="middle" fill="#3d444d" fontSize="7">
          sin · cos · recip · sqrt · rsqrt · exp · log
        </text>
      </g>

      {/* Memory hierarchy arrows */}
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
          <rect
            x={14 + i * 124} y="447" width="116" height="32" rx="3"
            fill="rgba(13,17,23,0.8)" stroke={`${col}40`} strokeWidth="1"
          />
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

// ─── Info Panel ───────────────────────────────────────────────────────────────

function InfoPanel({
  componentId,
  view,
  onDrillSM,
  onBack,
}: {
  componentId: ComponentId;
  view: "chip" | "sm";
  onDrillSM: () => void;
  onBack: () => void;
}) {
  const comp = COMPONENTS[componentId];

  const categoryColor: Record<string, string> = {
    Die: "#00ff84",
    Cluster: "#bc8cff",
    Compute: "#00ff84",
    Memory: "#58a6ff",
    Control: "#e3b341",
    Interconnect: "#ffa657",
  };
  const catCol = categoryColor[comp.category] ?? "#7d8590";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Category badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="font-mono text-[10px] px-2 py-0.5 rounded uppercase tracking-widest"
          style={{ background: `${catCol}18`, color: catCol, border: `1px solid ${catCol}30` }}
        >
          {comp.category}
        </span>
        {view === "sm" && (
          <button
            onClick={onBack}
            className="ml-auto text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-colors"
          >
            ← chip view
          </button>
        )}
      </div>

      {/* Name */}
      <h2 className="font-mono text-base font-semibold text-[var(--text-primary)] leading-snug mb-3">
        {comp.name}
      </h2>

      {/* Stats */}
      <div
        className="rounded-lg border border-[var(--border)] overflow-hidden mb-4"
        style={{ background: "var(--bg-surface)" }}
      >
        {comp.stats.map(({ label, value }, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] last:border-b-0"
          >
            <span className="text-[11px] text-[var(--text-muted)] font-mono">{label}</span>
            <span
              className="text-[11px] font-mono font-semibold"
              style={{ color: comp.color }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Description */}
      <p className="text-[13px] text-[var(--text-muted)] leading-relaxed mb-4 flex-1 overflow-y-auto">
        {comp.description}
      </p>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-auto">
        {"drillable" in comp && comp.drillable && view === "chip" && (
          <button
            onClick={onDrillSM}
            className="w-full py-2 rounded-lg font-mono text-xs font-semibold transition-all"
            style={{
              background: "rgba(0,255,132,0.1)",
              border: "1px solid rgba(0,255,132,0.3)",
              color: "#00ff84",
            }}
          >
            Explore SM internals →
          </button>
        )}
        {"conceptSlug" in comp && comp.conceptSlug && (
          <Link
            href={`/concepts/${comp.conceptSlug}`}
            className="w-full py-2 rounded-lg font-mono text-xs text-center transition-colors"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            Read concept →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GPUPage() {
  const [selected, setSelected] = useState<ComponentId>("chip");
  const [view, setView] = useState<"chip" | "sm">("chip");

  const handleSelect = (id: ComponentId) => setSelected(id);
  const handleDrillSM = () => {
    setSelected("sm");
    setView("sm");
  };
  const handleBack = () => {
    setView("chip");
    setSelected("chip");
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Nav active="gpu" />

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            {view === "sm" && (
              <button
                onClick={handleBack}
                className="text-xs font-mono text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                GPU Die
              </button>
            )}
            {view === "sm" && <span className="text-[var(--text-subtle)] text-xs font-mono">›</span>}
            <span className="text-xs font-mono text-[var(--text-muted)]">
              {view === "chip" ? "GPU Die" : "Streaming Multiprocessor"}
            </span>
          </div>
          <h1 className="font-mono text-2xl font-semibold text-[var(--text-primary)]">
            {view === "chip" ? "GPU Architecture" : "SM — Streaming Multiprocessor"}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {view === "chip"
              ? "Click any component to explore its role in the CUDA execution model."
              : "The SM is where all CUDA code runs. Click any sub-unit to learn more."}
          </p>
        </div>

        {/* Main layout */}
        <div className="flex gap-5" style={{ height: "calc(100vh - 220px)", minHeight: "520px" }}>
          {/* SVG panel */}
          <div
            className="flex-1 rounded-xl border border-[var(--border)] overflow-hidden"
            style={{ background: "#080d14" }}
          >
            {view === "chip" ? (
              <ChipView
                selected={selected}
                onSelect={handleSelect}
                onDrillSM={handleDrillSM}
              />
            ) : (
              <SMView selected={selected} onSelect={handleSelect} />
            )}
          </div>

          {/* Info panel */}
          <div
            className="w-80 flex-shrink-0 rounded-xl border border-[var(--border)] p-5"
            style={{ background: "var(--bg-surface)" }}
          >
            <InfoPanel
              componentId={selected}
              view={view}
              onDrillSM={handleDrillSM}
              onBack={handleBack}
            />
          </div>
        </div>

        {/* Quick-select chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(view === "chip"
            ? (["chip", "gpc", "sm", "l2Cache", "hbm", "pcie"] as ComponentId[])
            : (["sm", "warpScheduler", "cudaCores", "tensorCores", "registerFile", "sharedMem", "ldst"] as ComponentId[])
          ).map((id) => {
            const comp = COMPONENTS[id];
            const active = selected === id;
            return (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all"
                style={{
                  background: active ? `${comp.color}18` : "var(--bg-raised)",
                  border: `1px solid ${active ? comp.color + "50" : "var(--border)"}`,
                  color: active ? comp.color : "var(--text-muted)",
                }}
              >
                {comp.name.split("—")[0].trim()}
              </button>
            );
          })}
          {view === "chip" && (
            <button
              onClick={handleDrillSM}
              className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all ml-auto"
              style={{
                background: "rgba(0,255,132,0.08)",
                border: "1px solid rgba(0,255,132,0.3)",
                color: "#00ff84",
              }}
            >
              Explore SM →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
