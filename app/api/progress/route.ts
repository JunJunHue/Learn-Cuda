import { NextRequest, NextResponse } from "next/server";
import {
  markProjectProgress,
  markConceptRead,
  getDashboardStats,
  getProgressByCategory,
} from "@/lib/progress";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const view = searchParams.get("view") ?? "dashboard";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (view === "categories") {
    const categories = await getProgressByCategory(userId);
    return NextResponse.json({ categories });
  }

  const stats = await getDashboardStats(userId);
  return NextResponse.json({ stats });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, projectId, conceptPageId, status } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (projectId) {
      if (!["started", "completed"].includes(status)) {
        return NextResponse.json(
          { error: "status must be 'started' or 'completed' for projects" },
          { status: 400 }
        );
      }
      const progress = await markProjectProgress(userId, projectId, status);
      return NextResponse.json({ progress });
    }

    if (conceptPageId) {
      const progress = await markConceptRead(userId, conceptPageId);
      return NextResponse.json({ progress });
    }

    return NextResponse.json(
      { error: "projectId or conceptPageId is required" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update progress";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
