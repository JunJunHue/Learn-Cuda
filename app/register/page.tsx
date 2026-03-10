"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/app/components/Nav";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }
      router.push("/login?registered=1");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Nav />

      <div className="flex items-center justify-center min-h-[calc(100vh-56px)] px-4">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-8">
            {/* Header */}
            <div className="mb-8">
              <div className="font-mono text-xs text-[var(--text-subtle)] mb-2">// CREATE ACCOUNT</div>
              <h1 className="font-mono text-xl font-bold">Sign up for free</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                Track progress across all projects and concepts.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-xs text-[var(--text-subtle)] mb-1.5" htmlFor="name">
                  NAME <span className="text-[var(--text-subtle)]">(optional)</span>
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ada Lovelace"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors duration-150 font-mono"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--text-subtle)] mb-1.5" htmlFor="email">
                  EMAIL
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors duration-150 font-mono"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--text-subtle)] mb-1.5" htmlFor="password">
                  PASSWORD
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="min 8 characters"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors duration-150 font-mono"
                />
                <p className="mt-1.5 font-mono text-xs text-[var(--text-subtle)]">
                  8+ chars · 1 uppercase · 1 number
                </p>
              </div>

              {error && (
                <div className="font-mono text-xs text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/20 rounded px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full font-mono font-semibold text-sm px-4 py-2.5 rounded bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
              >
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
              Already have an account?{" "}
              <Link href="/login" className="font-mono text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors duration-150">
                Log in
              </Link>
            </p>
          </div>

          {/* Terms note */}
          <p className="mt-4 text-center font-mono text-xs text-[var(--text-subtle)]">
            No credit card required · open source
          </p>
        </div>
      </div>
    </div>
  );
}
