import { NextRequest, NextResponse } from "next/server";
import { getProjectBySlug } from "@/data/projects";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}
