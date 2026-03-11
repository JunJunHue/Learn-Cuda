import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/app/components/Nav";
import { getProjectBySlug, PROJECTS } from "@/data/projects";
import { getConceptBySlug } from "@/data/concepts";
import SandboxPanel from "@/app/projects/[slug]/SandboxPanel";
import TutorialSandbox from "@/app/projects/[slug]/TutorialSandbox";

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

export async function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  const prereqProjects = project.prerequisites
    .map((s) => getProjectBySlug(s))
    .filter(Boolean);

  const related = PROJECTS.filter(
    (p) => p.category === project.category && p.slug !== project.slug
  ).slice(0, 3);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Nav active="projects" />

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-xs text-[var(--text-subtle)] mb-8">
          <Link href="/projects" className="hover:text-[var(--text-muted)] transition-colors duration-150 cursor-pointer">
            projects
          </Link>
          <span>/</span>
          <span className="text-[var(--text-muted)]">{project.slug}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* ── Main ──────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-7">
            {/* Title block */}
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-4">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${BADGE[project.category] ?? ""}`}>
                  {project.category}
                </span>
                <span className={`font-mono text-xs flex items-center gap-1.5 ${DIFF_CLS[project.difficulty] ?? "text-[var(--text-muted)]"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLS[project.difficulty] ?? ""}`} />
                  {project.difficulty}
                </span>
                <span className="font-mono text-xs text-[var(--text-subtle)]">~{project.estimatedMinutes} min</span>
              </div>
              <h1 className="font-mono text-3xl font-bold mb-3 leading-tight">{project.title}</h1>
              <p className="text-[var(--text-muted)] leading-relaxed text-base">{project.description}</p>
            </div>

            {/* Tags */}
            {project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span key={tag} className="font-mono text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border)] px-2.5 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Prerequisites */}
            {prereqProjects.length > 0 && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
                <p className="font-mono text-xs text-[var(--text-subtle)] mb-3">// PREREQUISITES</p>
                <div className="flex flex-wrap gap-2">
                  {prereqProjects.map((prereq) => prereq && (
                    <Link
                      key={prereq.slug}
                      href={`/projects/${prereq.slug}`}
                      className="inline-flex items-center gap-2 font-mono text-xs text-[var(--text-muted)] bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)] border border-[var(--border)] px-3 py-1.5 rounded transition-colors duration-150 cursor-pointer"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLS[prereq.difficulty] ?? ""}`} />
                      {prereq.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Phases — shown only for non-tutorial projects */}
            {!project.steps && project.phases && project.phases.length > 0 && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
                <p className="font-mono text-xs text-[var(--text-subtle)] mb-4">// PROJECT PHASES</p>
                <ol className="space-y-4">
                  {project.phases.map((phase, i) => (
                    <li key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full border border-[var(--border)] bg-[var(--bg-raised)] flex items-center justify-center font-mono text-xs text-[var(--text-subtle)] shrink-0">
                          {i + 1}
                        </div>
                        {i < project.phases.length - 1 && (
                          <div className="w-px flex-1 bg-[var(--border)] mt-2" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="font-mono text-sm font-semibold text-[var(--text-primary)] mb-1">{phase.title}</p>
                        <p className="text-sm text-[var(--text-muted)] leading-relaxed">{phase.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Sandbox / Tutorial */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-xs text-[var(--text-subtle)]">
                  {project.steps ? "// TUTORIAL" : "// SANDBOX"}
                </p>
                <span className="font-mono text-xs text-[var(--accent)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-dot" />
                  GPU execution
                </span>
              </div>
              {project.steps ? (
                <TutorialSandbox steps={project.steps} />
              ) : (
                <SandboxPanel
                  starterCode={project.starterCode}
                  runTests={project.runTests}
                  submitTests={project.submitTests}
                />
              )}
            </div>

            {/* Expected output — only for non-tutorial projects */}
            {!project.steps && project.expectedOutput && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
                <p className="font-mono text-xs text-[var(--text-subtle)] mb-3">// EXPECTED OUTPUT</p>
                <pre className="font-mono text-sm text-[#56d364] whitespace-pre-wrap leading-relaxed">
                  {project.expectedOutput}
                </pre>
              </div>
            )}
          </div>

          {/* ── Sidebar ───────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Progress card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
              <p className="font-mono text-xs text-[var(--text-subtle)] mb-4">// YOUR PROGRESS</p>
              <div className="space-y-2">
                <button
                  className="w-full font-mono font-semibold text-sm py-2.5 rounded bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)] transition-colors duration-150 cursor-pointer"
                  aria-label="Mark project as complete"
                >
                  Mark complete
                </button>
                <button
                  className="w-full font-mono text-sm py-2.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors duration-150 cursor-pointer"
                  aria-label="Mark project as started"
                >
                  Mark started
                </button>
              </div>
              <p className="font-mono text-xs text-[var(--text-subtle)] mt-3 text-center">
                <Link href="/login" className="hover:text-[var(--text-muted)] transition-colors cursor-pointer">
                  Log in
                </Link>{" "}to save progress
              </p>
            </div>

            {/* Details */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
              <p className="font-mono text-xs text-[var(--text-subtle)] mb-4">// DETAILS</p>
              <dl className="space-y-3 font-mono text-sm">
                {[
                  { label: "Category", value: project.category },
                  { label: "Difficulty", value: project.difficulty, cls: DIFF_CLS[project.difficulty] },
                  { label: "Est. time", value: `~${project.estimatedMinutes} min` },
                  { label: "Prerequisites", value: project.prerequisites.length === 0 ? "None" : String(project.prerequisites.length) },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-[var(--text-subtle)]">{label}</dt>
                    <dd className={cls ?? "text-[var(--text-muted)]"}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Related */}
            {related.length > 0 && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
                <p className="font-mono text-xs text-[var(--text-subtle)] mb-4">// MORE IN {project.category.toUpperCase()}</p>
                <div className="space-y-3">
                  {related.map((rel) => (
                    <Link
                      key={rel.slug}
                      href={`/projects/${rel.slug}`}
                      className="block group cursor-pointer"
                    >
                      <p className="font-mono text-sm font-medium text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors duration-150 mb-0.5 leading-snug">
                        {rel.title}
                      </p>
                      <p className="font-mono text-xs text-[var(--text-subtle)] flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLS[rel.difficulty] ?? ""}`} />
                        {rel.difficulty} · ~{rel.estimatedMinutes} min
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Concepts link */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
              <p className="font-mono text-xs text-[var(--text-subtle)] mb-3">// LEARN THE THEORY</p>
              <Link
                href="/concepts"
                className="font-mono text-sm text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors duration-150 flex items-center gap-1.5 cursor-pointer"
              >
                {project.category} concepts
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
