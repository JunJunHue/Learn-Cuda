import { NextRequest, NextResponse } from "next/server";
import { CONCEPTS, getConceptsByCategory, searchConcepts } from "@/data/concepts";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  let concepts = CONCEPTS;

  if (q) {
    concepts = searchConcepts(q);
  } else if (category) {
    concepts = getConceptsByCategory(category);
  }

  return NextResponse.json({ concepts, total: concepts.length });
}
