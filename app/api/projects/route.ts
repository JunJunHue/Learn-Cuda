import { NextRequest, NextResponse } from "next/server";
import {
  PROJECTS,
  getProjectsByCategory,
  getProjectsByDifficulty,
  searchProjects,
  type Category,
  type Difficulty,
} from "@/data/projects";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as Category | null;
  const difficulty = searchParams.get("difficulty") as Difficulty | null;
  const q = searchParams.get("q");
  const sort = searchParams.get("sort") ?? "default";

  let projects = PROJECTS;

  if (q) {
    projects = searchProjects(q);
  } else if (category) {
    projects = getProjectsByCategory(category);
  } else if (difficulty) {
    projects = getProjectsByDifficulty(difficulty);
  }

  if (sort === "difficulty") {
    const order: Record<string, number> = {
      Beginner: 0,
      Intermediate: 1,
      Advanced: 2,
    };
    projects = [...projects].sort(
      (a, b) => order[a.difficulty] - order[b.difficulty]
    );
  }

  return NextResponse.json({
    projects,
    total: projects.length,
  });
}
