import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/app/components/Nav";
import { CONCEPTS, getConceptBySlug } from "@/data/concepts";
import { getProjectBySlug } from "@/data/projects";
import ConceptContent from "./ConceptContent";
import SandboxPanel from "@/app/projects/[slug]/SandboxPanel";

const CATEGORY_CLS: Record<string, string> = {
  Parallelism: "badge-parallelism",
  Memory: "badge-memory",
  Optimization: "badge-optimization",
};

export async function generateStaticParams() {
  return CONCEPTS.map((c) => ({ slug: c.slug }));
}

export default async function ConceptPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const concept = getConceptBySlug(slug);
  if (!concept) notFound();

  const relatedProjects = concept.relatedProjects
    .map((s) => getProjectBySlug(s))
    .filter(Boolean);

  const relatedConcepts = concept.relatedConcepts
    .map((s) => getConceptBySlug(s))
    .filter(Boolean);

  // Determine prev/next in ordered list
  const sorted = [...CONCEPTS].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.slug === slug);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Nav active="concepts" />

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-xs text-[var(--text-subtle)] mb-8">
          <Link href="/concepts" className="hover:text-[var(--text-muted)] transition-colors duration-150 cursor-pointer">
            concepts
          </Link>
          <span>/</span>
          <span className="text-[var(--text-muted)]">{concept.slug}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* ── Main content ───────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title block */}
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-4">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${CATEGORY_CLS[concept.category] ?? "border-[var(--border)] text-[var(--text-muted)]"}`}>
                  {concept.category}
                </span>
              </div>
              <h1 className="font-mono text-3xl font-bold mb-3 leading-tight">{concept.title}</h1>
            </div>

            {/* Markdown content */}
            <ConceptContent content={concept.content} codeExample={concept.codeExample} />

            {/* Runnable sandbox */}
            {concept.codeExample && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-xs text-[var(--text-subtle)]">// TRY IT</p>
                  <span className="font-mono text-xs text-[var(--accent)] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-dot" />
                    GPU execution
                  </span>
                </div>
                <SandboxPanel starterCode={concept.codeExample} height={320} />
              </div>
            )}

            {/* Prev / Next navigation */}
            {(prev || next) && (
              <div className="flex items-center justify-between pt-6 border-t border-[var(--border)] font-mono text-xs">
                {prev ? (
                  <Link
                    href={`/concepts/${prev.slug}`}
                    className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors duration-150 cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    {prev.title}
                  </Link>
                ) : <span />}
                {next ? (
                  <Link
                    href={`/concepts/${next.slug}`}
                    className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors duration-150 cursor-pointer"
                  >
                    {next.title}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : <span />}
              </div>
            )}
          </div>

          {/* ── Sidebar ─────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Related Projects */}
            {relatedProjects.length > 0 && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
                <p className="font-mono text-xs text-[var(--text-subtle)] mb-4">// PRACTICE PROJECTS</p>
                <div className="space-y-3">
                  {relatedProjects.map((proj) => proj && (
                    <Link
                      key={proj.slug}
                      href={`/projects/${proj.slug}`}
                      className="block group cursor-pointer"
                    >
                      <p className="font-mono text-sm font-medium text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors duration-150 mb-0.5 leading-snug">
                        {proj.title}
                      </p>
                      <p className="font-mono text-xs text-[var(--text-subtle)]">
                        {proj.difficulty} · ~{proj.estimatedMinutes} min
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Related Concepts */}
            {relatedConcepts.length > 0 && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
                <p className="font-mono text-xs text-[var(--text-subtle)] mb-4">// RELATED CONCEPTS</p>
                <div className="space-y-2">
                  {relatedConcepts.map((rel) => rel && (
                    <Link
                      key={rel.slug}
                      href={`/concepts/${rel.slug}`}
                      className="flex items-center justify-between group cursor-pointer py-1"
                    >
                      <span className="font-mono text-sm text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors duration-150">
                        {rel.title}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-subtle)] group-hover:text-[var(--accent)] transition-colors duration-150 shrink-0" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back to all concepts */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-5">
              <p className="font-mono text-xs text-[var(--text-subtle)] mb-3">// ALL CONCEPTS</p>
              <Link
                href="/concepts"
                className="font-mono text-sm text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors duration-150 flex items-center gap-1.5 cursor-pointer"
              >
                Browse reference
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
