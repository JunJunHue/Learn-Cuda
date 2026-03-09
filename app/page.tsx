import Link from "next/link";
import Nav from "@/app/components/Nav";
import { PROJECTS, CATEGORIES } from "@/data/projects";
import { CONCEPTS } from "@/data/concepts";

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

const HERO_SNIPPET = `__global__ void vectorAdd(
    float *a, float *b, float *c, int n
) {
    int i = blockIdx.x * blockDim.x
          + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}`;

export default function Home() {
  const featuredProjects = PROJECTS.slice(0, 3);
  const featuredConcepts = CONCEPTS.slice(0, 3);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Nav />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40 pointer-events-none" />
        {/* Green radial glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center top, rgba(0,255,132,0.07) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left */}
            <div>
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 font-mono text-xs text-[var(--accent)] bg-[var(--accent-bg)] border border-[var(--accent)]/20 rounded px-3 py-1.5 mb-8 animate-fade-up">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-dot" />
                GPU sandboxes · real hardware · zero setup
              </div>

              <h1 className="font-mono text-4xl lg:text-5xl font-bold leading-tight tracking-tight mb-5 animate-fade-up-d1">
                Learn CUDA.<br />
                <span className="text-[var(--accent)] glow-accent">No GPU required.</span>
              </h1>

              <p className="text-[var(--text-muted)] text-lg leading-relaxed mb-8 max-w-md animate-fade-up-d2">
                Structured projects, concept guides, and browser-based GPU sandboxes
                for C/C++ developers who want to master parallel computing.
              </p>

              <div className="flex flex-wrap gap-3 animate-fade-up-d3">
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 font-mono font-semibold text-sm px-5 py-2.5 rounded bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)] transition-colors duration-150 cursor-pointer"
                >
                  Browse projects
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="/sandbox"
                  className="inline-flex items-center gap-2 font-mono text-sm px-5 py-2.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors duration-150 cursor-pointer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Open sandbox
                </Link>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-8 mt-12 animate-fade-up-d4">
                {[
                  { n: PROJECTS.length, label: "projects" },
                  { n: CONCEPTS.length, label: "concept guides" },
                  { n: CATEGORIES.length, label: "categories" },
                ].map(({ n, label }) => (
                  <div key={label}>
                    <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">{n}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — code preview */}
            <div className="hidden lg:block animate-fade-up-d2">
              <div className="rounded-lg border border-[var(--border)] overflow-hidden shadow-2xl">
                {/* Window chrome */}
                <div className="flex items-center gap-1.5 px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-3 font-mono text-xs text-[var(--text-subtle)]">vector_add.cu</span>
                  <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-[var(--accent)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-dot" />
                    GPU ready
                  </span>
                </div>
                {/* Code */}
                <div className="bg-[var(--bg-surface)] p-5">
                  <pre className="font-mono text-sm leading-6 text-[var(--text-muted)]">
                    <span className="text-[#d2a8ff]">__global__</span>
                    {" "}<span className="text-[#79c0ff]">void</span>
                    {" "}<span className="text-[var(--accent)]">vectorAdd</span>
                    {"(\n    "}
                    <span className="text-[#79c0ff]">float</span>
                    {" *a, "}
                    <span className="text-[#79c0ff]">float</span>
                    {" *b, "}
                    <span className="text-[#79c0ff]">float</span>
                    {" *c, "}
                    <span className="text-[#79c0ff]">int</span>
                    {" n\n) {\n    "}
                    <span className="text-[#79c0ff]">int</span>
                    {" i = "}
                    <span className="text-[#ffa657]">blockIdx</span>
                    {".x * "}
                    <span className="text-[#ffa657]">blockDim</span>
                    {".x\n          + "}
                    <span className="text-[#ffa657]">threadIdx</span>
                    {".x;\n    "}
                    <span className="text-[#ff7b72]">if</span>
                    {" (i < n) c[i] = a[i] + b[i];\n}"}
                  </pre>
                  {/* Output preview */}
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-[var(--text-subtle)]">stdout</span>
                      <span className="font-mono text-xs text-[var(--accent)] flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        completed · 142ms
                      </span>
                    </div>
                    <div className="font-mono text-xs text-[#56d364]">
                      Vector addition successful.<br />Max error: 0.000000
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Category strip ────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-[var(--text-subtle)] mr-2">TOPICS</span>
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={`/projects?category=${cat}`}
              className={`text-xs font-medium px-2.5 py-1 rounded border cursor-pointer transition-opacity duration-150 hover:opacity-80 ${BADGE[cat] ?? "bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)]"}`}
            >
              {cat}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Featured Projects ─────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="font-mono text-xs text-[var(--text-subtle)] mb-2">// PROJECTS</div>
            <h2 className="font-mono text-xl font-semibold">Featured Projects</h2>
          </div>
          <Link
            href="/projects"
            className="font-mono text-sm text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors duration-150 flex items-center gap-1 cursor-pointer"
          >
            View all {PROJECTS.length}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {featuredProjects.map((project) => (
            <Link
              key={project.slug}
              href={`/projects/${project.slug}`}
              className="group block bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--text-subtle)] hover:bg-[var(--bg-raised)] transition-all duration-150 cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${BADGE[project.category] ?? ""}`}>
                  {project.category}
                </span>
                <span className={`text-xs flex items-center gap-1.5 ${DIFF_CLS[project.difficulty] ?? "text-[var(--text-muted)]"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLS[project.difficulty] ?? ""}`} />
                  {project.difficulty}
                </span>
              </div>

              <h3 className="font-mono font-semibold text-sm mb-2 group-hover:text-[var(--accent)] transition-colors duration-150">
                {project.title}
              </h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed line-clamp-2">
                {project.description}
              </p>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-muted)] text-xs text-[var(--text-subtle)] font-mono">
                <span>~{project.estimatedMinutes} min</span>
                {project.prerequisites.length > 0 && (
                  <span>{project.prerequisites.length} prereq{project.prerequisites.length > 1 ? "s" : ""}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Featured Concepts ─────────────────────────────────── */}
      <section className="border-t border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="font-mono text-xs text-[var(--text-subtle)] mb-2">// CONCEPTS</div>
              <h2 className="font-mono text-xl font-semibold">Concept Guides</h2>
            </div>
            <Link
              href="/concepts"
              className="font-mono text-sm text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors duration-150 flex items-center gap-1 cursor-pointer"
            >
              View all {CONCEPTS.length}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredConcepts.map((concept) => (
              <Link
                key={concept.slug}
                href={`/concepts/${concept.slug}`}
                className="group block bg-[var(--bg)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--text-subtle)] transition-all duration-150 cursor-pointer"
              >
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${BADGE[concept.category] ?? "bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)]"}`}>
                  {concept.category}
                </span>
                <h3 className="font-mono font-semibold text-sm mt-3 mb-2 group-hover:text-[var(--accent)] transition-colors duration-150">
                  {concept.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed line-clamp-2">
                  {concept.content.replace(/[#`*\[\]]/g, "").trim().slice(0, 110)}…
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="font-mono text-xs text-[var(--text-subtle)] mb-4">// GET STARTED</div>
          <h2 className="font-mono text-3xl font-bold mb-4">
            Ready to write your first kernel?
          </h2>
          <p className="text-[var(--text-muted)] mb-8 max-w-md mx-auto leading-relaxed">
            Sign up free and track your progress across every project and concept guide.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 font-mono font-semibold text-sm px-6 py-3 rounded bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)] transition-colors duration-150 cursor-pointer"
          >
            Create free account
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-[var(--text-subtle)] font-mono">
          <span>cuda<span className="text-[var(--accent)]">.learn</span></span>
          <span>Next.js · Prisma · RunPod</span>
        </div>
      </footer>
    </div>
  );
}
