import { NextRequest, NextResponse } from "next/server";
import { validateSandboxCode, submitToGPUProvider } from "@/lib/sandbox";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, userId } = body;

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const validation = validateSandboxCode(code);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.reason },
        { status: 400 }
      );
    }

    // Record execution start
    const execution = await prisma.sandboxExecution.create({
      data: { code, userId: userId ?? null, status: "pending" },
    });

    // Update to running
    await prisma.sandboxExecution.update({
      where: { id: execution.id },
      data: { status: "running" },
    });

    const result = await submitToGPUProvider(code);

    // Record completion
    await prisma.sandboxExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        stdout: result.stdout ?? null,
        stderr: result.stderr ?? null,
        durationMs: result.durationMs ?? null,
      },
    });

    return NextResponse.json({ ...result, executionId: execution.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const executionId = searchParams.get("id");

  if (!executionId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const execution = await prisma.sandboxExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  return NextResponse.json({ execution });
}
