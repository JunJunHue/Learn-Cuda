export interface SandboxRequest {
  code: string;
  userId?: string;
}

export interface SandboxResult {
  status: "completed" | "failed" | "timeout" | "error";
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  executionId?: string;
}

// ── Validation ────────────────────────────────────────────────────────────

export function validateSandboxCode(code: string): { valid: boolean; reason?: string } {
  if (!code || code.trim().length === 0) {
    return { valid: false, reason: "Code cannot be empty" };
  }
  if (code.length > 50_000) {
    return { valid: false, reason: "Code exceeds 50KB limit" };
  }
  const blocked = [
    /\bsystem\s*\(/,
    /\bpopen\s*\(/,
    /\bfork\s*\(\)/,
    /\bexec\s*\(/,
    /\bexecv[pe]?\s*\(/,
  ];
  for (const pattern of blocked) {
    if (pattern.test(code)) {
      return { valid: false, reason: "Code contains disallowed system calls" };
    }
  }
  return { valid: true };
}

// ── RunPod serverless integration ──────────────────────────────────────────
//
// Required env vars:
//   RUNPOD_API_KEY      — your RunPod API key
//   RUNPOD_ENDPOINT_ID  — the serverless endpoint ID running the CUDA worker
//
// The worker accepts { code: string, timeout: number } and returns
//   { exit_code: number, stdout: string, stderr: string }
//
// See runpod-worker/handler.py for the reference worker implementation.

interface RunPodOutput {
  exit_code: number;
  stdout: string;
  stderr: string;
}

async function runOnRunPod(
  code: string,
  apiKey: string,
  endpointId: string
): Promise<SandboxResult> {
  const start = Date.now();

  const res = await fetch(`https://api.runpod.io/v2/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: { code, timeout: 25 } }),
    signal: AbortSignal.timeout(35_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RunPod HTTP ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    id?: string;
    status?: string;
    output?: RunPodOutput;
    error?: string;
  };
  const elapsed = Date.now() - start;

  if (data.status === "COMPLETED" && data.output != null) {
    return mapRunPodOutput(data.output, elapsed);
  }
  if (data.id) {
    return pollRunPod(data.id, apiKey, endpointId, start);
  }
  if (data.status === "FAILED") {
    return { status: "error", stderr: data.error ?? "RunPod job failed", durationMs: elapsed };
  }

  throw new Error(`Unexpected RunPod response: ${JSON.stringify(data)}`);
}

async function pollRunPod(
  jobId: string,
  apiKey: string,
  endpointId: string,
  startTime: number
): Promise<SandboxResult> {
  const maxWaitMs = 30_000;
  const pollIntervalMs = 1_200;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise<void>((r) => setTimeout(r, pollIntervalMs));

    const res = await fetch(`https://api.runpod.io/v2/${endpointId}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json() as {
      status?: string;
      output?: RunPodOutput;
      error?: string;
    };

    if (data.status === "COMPLETED" && data.output != null) {
      return mapRunPodOutput(data.output, Date.now() - startTime);
    }
    if (data.status === "FAILED" || data.status === "CANCELLED") {
      return { status: "error", stderr: data.error ?? "Job failed", durationMs: Date.now() - startTime };
    }
  }

  return { status: "timeout", durationMs: maxWaitMs };
}

function mapRunPodOutput(output: RunPodOutput, durationMs: number): SandboxResult {
  const { exit_code, stdout = "", stderr = "" } = output;
  if (exit_code === 0) {
    return { status: "completed", stdout, stderr, durationMs };
  }
  const isCompileError =
    stderr.includes("nvcc") ||
    stderr.includes(": error:") ||
    stderr.includes("undefined reference") ||
    stderr.includes("expected") ||
    stderr.includes("undeclared");
  return { status: isCompileError ? "failed" : "error", stdout, stderr, durationMs };
}

// ── Realistic development mock ─────────────────────────────────────────────
//
// When no GPU provider is configured, simulates nvcc compilation checks
// and generates context-aware output based on code patterns.

export function buildMockSandboxResult(code: string): SandboxResult {
  const compileError = checkCompileErrors(code);
  if (compileError) {
    return { status: "failed", stderr: compileError, durationMs: 80 + (Math.random() * 40 | 0) };
  }
  const stdout = generateMockOutput(code);
  return { status: "completed", stdout, stderr: "", durationMs: 180 + (Math.random() * 320 | 0) };
}

function checkCompileErrors(code: string): string | null {
  if (!code.includes("int main")) {
    return `main.cu:1:1: error: 'main' function not found\nnvcc fatal   : Compilation failed.`;
  }
  const opens = (code.match(/\{/g) ?? []).length;
  const closes = (code.match(/\}/g) ?? []).length;
  if (opens !== closes) {
    return `main.cu: error: expected '}' at end of input\nnvcc fatal   : Compilation failed.`;
  }

  // Detect kernels that are stubs (body has only comments/whitespace/TODOs)
  const kernelBodies = [...code.matchAll(/__global__\s+\w+\s+\w+[^{]*\{([^}]*)\}/g)];
  if (kernelBodies.length > 0) {
    const kernelCode = kernelBodies.map(([, body]) => body.replace(/\/\/[^\n]*/g, "").trim()).join("");
    if (!kernelCode) {
      return `main.cu: note: all kernels are empty — fill in the TODO sections to see output\n(this is not a real compile error — submit when ready)`;
    }
  }

  return null;
}

function generateMockOutput(code: string): string {
  const lines: string[] = [];

  if (code.match(/printf\s*\(\s*"Hello from the GPU/)) {
    lines.push("Hello from the GPU!");
  } else if (code.match(/printf[^;]*Hello from thread[^;]*threadIdx/i) || code.match(/printf[^;]*threadIdx[^;]*Hello from thread/i)) {
    const { blocks, tpb } = extractLaunch(code);
    for (let i = 0; i < Math.min(blocks * tpb, 32); i++) {
      lines.push(`Hello from thread ${i}`);
    }
  } else if (code.match(/printf[^;]*Block[^;]*Thread[^;]*Global/i)) {
    const { blocks, tpb } = extractLaunch(code);
    for (let b = 0; b < Math.min(blocks, 8); b++) {
      for (let t = 0; t < Math.min(tpb, 16); t++) {
        lines.push(`Block ${b}  Thread ${t}  \u2192  Global ID ${b * tpb + t}`);
      }
    }
  } else if (code.match(/out\s*\[\s*i\s*\]\s*=\s*i\s*\*\s*i/) && code.match(/printf[^;]*\^2/)) {
    const N = extractConst(code, "N") ?? 10;
    for (let i = 0; i < Math.min(N, 16); i++) lines.push(`${i}^2 = ${i * i}`);
  } else if (code.match(/transposeShared/i) && code.match(/cudaEventElapsedTime/)) {
    lines.push("Naive:            14.2 ms  (~142 GB/s)");
    lines.push("Shared memory:     4.8 ms  (~419 GB/s)");
    lines.push("No bank conflicts: 3.6 ms  (~558 GB/s)");
    lines.push("All results correct: YES");
  } else if (code.match(/transpose/i) && code.match(/printf[^;]*(CORRECT|WRONG|PASS|FAIL)/i)) {
    lines.push("Naive transpose: CORRECT");
  } else if (code.includes("printf")) {
    const m = code.match(/printf\s*\(\s*"([^"]{1,120})"/);
    if (m) {
      const fmt = m[1].replace(/\\n/g, "\n").replace(/%d/g, "42").replace(/%f/g, "3.14").replace(/%s/g, "str");
      lines.push(fmt.trim());
    }
  }

  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

function extractLaunch(code: string): { blocks: number; tpb: number } {
  const m = code.match(/<<<\s*(\d+)\s*,\s*(\d+)\s*>>>/);
  if (m) return { blocks: parseInt(m[1]), tpb: parseInt(m[2]) };
  return { blocks: 3, tpb: 4 };
}

function extractConst(code: string, name: string): number | null {
  const m1 = code.match(new RegExp(`\\bconst\\s+int\\s+${name}\\s*=\\s*(\\d+)`));
  if (m1) return parseInt(m1[1]);
  const m2 = code.match(new RegExp(`#define\\s+${name}\\s+(\\d+)`));
  if (m2) return parseInt(m2[1]);
  return null;
}

// ── Entry point ───────────────────────────────────────────────────────────

export async function submitToGPUProvider(
  code: string,
  provider: "runpod" | "modal" = "runpod"
): Promise<SandboxResult> {
  if (provider === "runpod") {
    const apiKey = process.env.RUNPOD_API_KEY;
    const endpointId = process.env.RUNPOD_ENDPOINT_ID;
    if (apiKey && endpointId) {
      return runOnRunPod(code, apiKey, endpointId);
    }
  }
  return buildMockSandboxResult(code);
}

export function getRateLimit(userId?: string): {
  maxPerHour: number;
  maxCodeLength: number;
  maxTimeoutSeconds: number;
} {
  if (userId) return { maxPerHour: 20, maxCodeLength: 50_000, maxTimeoutSeconds: 30 };
  return { maxPerHour: 5, maxCodeLength: 10_000, maxTimeoutSeconds: 15 };
}
