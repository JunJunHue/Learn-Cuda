import Link from "next/link";

export default function Nav({ active }: { active?: "projects" | "concepts" | "sandbox" | "gpu" }) {
  const linkCls = (page: typeof active) =>
    `text-sm transition-colors duration-150 ${
      active === page
        ? "text-[var(--text-primary)] font-medium"
        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group" aria-label="cuda.learn home">
          <span className="w-6 h-6 rounded flex items-center justify-center bg-[var(--accent-bg)] border border-[var(--accent)]/20 group-hover:border-[var(--accent)]/50 transition-colors duration-150">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="0.5" fill="var(--accent)" />
              <rect x="7" y="1" width="4" height="4" rx="0.5" fill="var(--accent)" opacity="0.5" />
              <rect x="1" y="7" width="4" height="4" rx="0.5" fill="var(--accent)" opacity="0.3" />
              <rect x="7" y="7" width="4" height="4" rx="0.5" fill="var(--accent)" opacity="0.7" />
            </svg>
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            cuda<span className="text-[var(--accent)]">.learn</span>
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1">
          <Link href="/projects" className={`${linkCls("projects")} px-3 py-1.5 rounded hover:bg-[var(--bg-hover)]`}>
            Projects
          </Link>
          <Link href="/concepts" className={`${linkCls("concepts")} px-3 py-1.5 rounded hover:bg-[var(--bg-hover)]`}>
            Concepts
          </Link>
          <Link href="/sandbox" className={`${linkCls("sandbox")} px-3 py-1.5 rounded hover:bg-[var(--bg-hover)]`}>
            Sandbox
          </Link>
          <Link href="/gpu" className={`${linkCls("gpu")} px-3 py-1.5 rounded hover:bg-[var(--bg-hover)]`}>
            GPU
          </Link>

          <div className="w-px h-4 bg-[var(--border)] mx-2" />

          <Link
            href="/login"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded transition-colors duration-150"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold font-mono px-3 py-1.5 rounded bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)] transition-colors duration-150 cursor-pointer"
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
