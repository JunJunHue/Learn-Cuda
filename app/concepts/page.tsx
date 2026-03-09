"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Nav from "@/app/components/Nav";
import { CONCEPTS, searchConcepts } from "@/data/concepts";

const CATEGORIES = Array.from(new Set(CONCEPTS.map((c) => c.category))).sort();

const CATEGORY_CLS: Record<string, string> = {
  Parallelism: "badge-parallelism",
  Memory: "badge-memory",
  Optimization: "badge-optimization",
};

export default function ConceptsPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filtered = useMemo(() => {
    let list = query.trim() ? searchConcepts(query) : [...CONCEPTS];
    if (activeCategory !== "All") list = list.filter((c) => c.category === activeCategory);
    return list.sort((a, b) => a.order - b.order);
  }, [query, activeCategory]);

  const grouped = useMemo(() => {
    if (activeCategory !== "All") return null;
    const map: Record<string, typeof filtered> = {};
    for (const c of filtered) {
      if (!map[c.category]) map[c.category] = [];
      map[c.category].push(c);
    }
    return map;
  }, [filtered, activeCategory]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Nav active="concepts" />

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="font-mono text-xs text-[var(--text-subtle)] mb-2">// CONCEPT REFERENCE</div>
          <h1 className="font-mono text-3xl font-bold mb-2">Concepts</h1>
          <p className="text-[var(--text-muted)]">
            {CONCEPTS.length} in-depth guides · GPU architecture, memory, parallelism, and optimization
          </p>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
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
              placeholder="Search concepts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search concepts"
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-md pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors duration-150 font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {["All", ...CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`inline-flex items-center font-mono text-xs px-2.5 py-1 rounded border transition-all duration-150 cursor-pointer ${
                  activeCategory === cat
                    ? cat === "All"
                      ? "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent-bg)]"
                      : `${CATEGORY_CLS[cat] ?? ""} opacity-100`
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)] hover:text-[var(--text-primary)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-[var(--text-subtle)]">
            <div className="font-mono text-4xl mb-4">∅</div>
            <p className="font-mono text-sm">No concepts match this query</p>
          </div>
        ) : grouped ? (
          /* Grouped by category */
          <div className="space-y-10">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${CATEGORY_CLS[cat] ?? "border-[var(--border)] text-[var(--text-muted)]"}`}>
                    {cat}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((concept) => (
                    <ConceptCard key={concept.slug} concept={concept} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Flat filtered list */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((concept) => (
              <ConceptCard key={concept.slug} concept={concept} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptCard({ concept }: { concept: { slug: string; title: string; category: string; relatedProjects: string[]; relatedConcepts: string[]; content: string } }) {
  // Grab the first non-heading, non-empty line as a teaser
  const teaser = concept.content
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("#"))
    ?.replace(/\*\*/g, "")
    .trim() ?? "";

  return (
    <Link
      href={`/concepts/${concept.slug}`}
      className="group flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--text-subtle)] hover:bg-[var(--bg-raised)] transition-all duration-150 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${CATEGORY_CLS[concept.category] ?? "border-[var(--border)] text-[var(--text-muted)]"}`}>
          {concept.category}
        </span>
        <svg
          className="w-3.5 h-3.5 text-[var(--text-subtle)] group-hover:text-[var(--accent)] transition-colors duration-150 mt-0.5"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>

      <h3 className="font-mono font-semibold text-sm mb-2 group-hover:text-[var(--accent)] transition-colors duration-150 leading-snug">
        {concept.title}
      </h3>

      {teaser && (
        <p className="text-sm text-[var(--text-muted)] leading-relaxed flex-1 line-clamp-2">
          {teaser}
        </p>
      )}

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[var(--border-muted)] font-mono text-xs text-[var(--text-subtle)]">
        {concept.relatedProjects.length > 0 && (
          <span>{concept.relatedProjects.length} project{concept.relatedProjects.length !== 1 ? "s" : ""}</span>
        )}
        {concept.relatedConcepts.length > 0 && (
          <span>{concept.relatedConcepts.length} related</span>
        )}
      </div>
    </Link>
  );
}
