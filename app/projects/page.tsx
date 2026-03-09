"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Nav from "@/app/components/Nav";
import {
  PROJECTS,
  CATEGORIES,
  DIFFICULTIES,
  searchProjects,
  type Category,
  type Difficulty,
} from "@/data/projects";

const BADGE: Record<string, string> = {
  Memory: "badge-memory",
  Parallelism: "badge-parallelism",
  Optimization: "badge-optimization",
  Algorithms: "badge-algorithms",
  "Multi-GPU": "badge-multi-gpu",
  Interoperability: "badge-interop",
};

const DIFF_CLS: Record<string, string> = {
  Beginner: "diff-beginner",
  Intermediate: "diff-intermediate",
  Advanced: "diff-advanced",
};

const DOT_CLS: Record<string, string> = {
  Beginner: "dot-beginner",
  Intermediate: "dot-intermediate",
  Advanced: "dot-advanced",
};

export default function ProjectsPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | "All">("All");
  const [sort, setSort] = useState<"default" | "difficulty">("default");

  const filtered = useMemo(() => {
    let list = query.trim() ? searchProjects(query) : [...PROJECTS];
    if (activeCategory !== "All") list = list.filter((p) => p.category === activeCategory);
    if (activeDifficulty !== "All") list = list.filter((p) => p.difficulty === activeDifficulty);
    if (sort === "difficulty") {
      const order: Record<string, number> = { Beginner: 0, Intermediate: 1, Advanced: 2 };
      list = [...list].sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    }
    return list;
  }, [query, activeCategory, activeDifficulty, sort]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Nav active="projects" />

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="font-mono text-xs text-[var(--text-subtle)] mb-2">// PROJECT DATABASE</div>
          <h1 className="font-mono text-3xl font-bold mb-2">Projects</h1>
          <p className="text-[var(--text-muted)]">
            {PROJECTS.length} hands-on CUDA projects · from first kernel to advanced optimization
          </p>
        </div>

        {/* Search + Sort row */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)]"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="search"
              placeholder="Search by title, tag, description…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search projects"
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-md pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors duration-150 font-mono"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "default" | "difficulty")}
            aria-label="Sort projects"
            className="text-sm bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] rounded-md px-3 py-2 focus:outline-none focus:border-[var(--text-subtle)] font-mono cursor-pointer"
          >
            <option value="default">Sort: default</option>
            <option value="difficulty">Sort: difficulty</option>
          </select>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-6 mb-8 pb-8 border-b border-[var(--border)]">
          {/* Category */}
          <div>
            <p className="font-mono text-xs text-[var(--text-subtle)] mb-2.5">CATEGORY</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                label="All"
                active={activeCategory === "All"}
                onClick={() => setActiveCategory("All")}
              />
              {CATEGORIES.map((cat) => (
                <FilterChip
                  key={cat}
                  label={cat}
                  active={activeCategory === cat}
                  activeClass={BADGE[cat]}
                  onClick={() => setActiveCategory(cat === activeCategory ? "All" : cat)}
                />
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <p className="font-mono text-xs text-[var(--text-subtle)] mb-2.5">DIFFICULTY</p>
            <div className="flex gap-1.5">
              <FilterChip
                label="All"
                active={activeDifficulty === "All"}
                onClick={() => setActiveDifficulty("All")}
              />
              {DIFFICULTIES.map((d) => (
                <FilterChip
                  key={d}
                  label={d}
                  active={activeDifficulty === d}
                  dot={DOT_CLS[d]}
                  activeClass={activeDifficulty === d ? `border-[var(--text-subtle)] text-[var(--text-primary)] bg-[var(--bg-hover)]` : ""}
                  onClick={() => setActiveDifficulty(d === activeDifficulty ? "All" : d)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Count */}
        <p className="font-mono text-xs text-[var(--text-subtle)] mb-5">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          {query && <> for &ldquo;{query}&rdquo;</>}
        </p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-[var(--text-subtle)]">
            <div className="font-mono text-4xl mb-4">∅</div>
            <p className="font-mono text-sm">No projects match these filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <Link
                key={project.slug}
                href={`/projects/${project.slug}`}
                className="group flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--text-subtle)] hover:bg-[var(--bg-raised)] transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${BADGE[project.category] ?? "bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)]"}`}>
                    {project.category}
                  </span>
                  <span className={`text-xs flex items-center gap-1.5 ${DIFF_CLS[project.difficulty] ?? "text-[var(--text-muted)]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLS[project.difficulty] ?? ""}`} />
                    {project.difficulty}
                  </span>
                </div>

                <h3 className="font-mono font-semibold text-sm mb-2 group-hover:text-[var(--accent)] transition-colors duration-150 leading-snug">
                  {project.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed flex-1 line-clamp-3">
                  {project.description}
                </p>

                {project.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {project.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="font-mono text-xs text-[var(--text-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                    {project.tags.length > 3 && (
                      <span className="font-mono text-xs text-[var(--text-subtle)]">+{project.tags.length - 3}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-muted)] font-mono text-xs text-[var(--text-subtle)]">
                  <span>~{project.estimatedMinutes} min</span>
                  {project.prerequisites.length > 0 && (
                    <span>{project.prerequisites.length} prereq{project.prerequisites.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label, active, onClick, activeClass, dot,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass?: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded border transition-all duration-150 cursor-pointer ${
        active
          ? activeClass || "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent-bg)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)] hover:text-[var(--text-primary)]"
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
    </button>
  );
}
