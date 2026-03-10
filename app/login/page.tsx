"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/app/components/Nav";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // next-auth credentials sign-in
      const { signIn } = await import("next-auth/react");
      const result = await signIn("credentials", {
        redirect: false,
        email: form.email,
        password: form.password,
      });
      if (result?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/");
        router.refresh();
      }
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
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-8">
            {/* Header */}
            <div className="mb-8">
              <div className="font-mono text-xs text-[var(--text-subtle)] mb-2">// WELCOME BACK</div>
              <h1 className="font-mono text-xl font-bold">Log in</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                Continue where you left off.
              </p>
            </div>

            {justRegistered && (
              <div className="mb-4 font-mono text-xs text-[var(--accent)] bg-[var(--accent-bg)] border border-[var(--accent)]/20 rounded px-3 py-2">
                Account created — log in to get started.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors duration-150 font-mono"
                />
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
                {loading ? "Logging in…" : "Log in"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-mono text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors duration-150">
                Sign up free
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
