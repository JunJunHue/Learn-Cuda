import { NextRequest, NextResponse } from "next/server";
import { getConceptBySlug } from "@/data/concepts";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const concept = getConceptBySlug(slug);

  if (!concept) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  return NextResponse.json({ concept });
}
