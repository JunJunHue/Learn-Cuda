import Nav from "@/app/components/Nav";
import { PROJECTS } from "@/data/projects";
import SandboxClient from "./SandboxClient";

export const metadata = {
  title: "GPU Sandbox · cuda.learn",
  description: "Write and run CUDA C++ on a cloud GPU directly in your browser.",
};

export default function SandboxPage() {
  const projects = PROJECTS.map(({ slug, title, difficulty, category, starterCode }) => ({
    slug,
    title,
    difficulty,
    category,
    starterCode,
  }));

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Nav active="sandbox" />
      <SandboxClient projects={projects} />
    </div>
  );
}
