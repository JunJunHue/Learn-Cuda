"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount } from "@monaco-editor/react";
import type { ProjectData } from "@/data/projects";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center flex-1"
      style={{ background: "#0d1117", minHeight: 480 }}
    >
      <span className="font-mono text-xs text-[var(--text-subtle)]">loading editor…</span>
    </div>
  ),
});

interface SandboxResult {
  status: "completed" | "failed" | "timeout" | "error";
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

interface Props {
  projects: Pick<ProjectData, "slug" | "title" | "difficulty" | "category" | "starterCode">[];
}

const THEME_NAME = "cuda-dark";

const DEFAULT_CODE = `#include <stdio.h>

__global__ void hello(int n) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid < n) {
        printf("Hello from thread %d\\n", tid);
    }
}

int main() {
    int n = 8;
    hello<<<1, n>>>(n);
    cudaDeviceSynchronize();
    return 0;
}
`;

const beforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "3d444d", fontStyle: "italic" },
      { token: "keyword", foreground: "ff7b72" },
      { token: "string", foreground: "a5d6ff" },
      { token: "number", foreground: "79c0ff" },
      { token: "type.identifier", foreground: "ffa657" },
      { token: "delimiter", foreground: "7d8590" },
    ],
    colors: {
      "editor.background": "#0d1117",
      "editor.foreground": "#e6edf3",
      "editor.lineHighlightBackground": "#161b2280",
      "editorLineNumber.foreground": "#3d444d",
      "editorLineNumber.activeForeground": "#7d8590",
      "editor.selectionBackground": "#264f7880",
      "editorCursor.foreground": "#00ff84",
      "editorIndentGuide.background1": "#21262d",
      "editorIndentGuide.activeBackground1": "#3d444d",
      "editorWidget.background": "#161b22",
      "editorSuggestWidget.background": "#161b22",
      "editorSuggestWidget.border": "#21262d",
    },
  });
};

const DIFF_DOT: Record<string, string> = {
  Beginner: "bg-[#56d364]",
  Intermediate: "bg-[var(--yellow)]",
  Advanced: "bg-[var(--red)]",
};

const statusMap = {
  completed: { label: "exited 0",    cls: "text-[var(--accent)]" },
  failed:    { label: "build failed", cls: "text-[var(--red)]" },
  timeout:   { label: "timeout",      cls: "text-[var(--yellow)]" },
  error:     { label: "error",        cls: "text-[var(--red)]" },
};

export default function SandboxClient({ projects }: Props) {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "errors">("output");

  function loadProject(slug: string) {
    const proj = projects.find((p) => p.slug === slug);
    if (!proj) return;
    setSelectedSlug(slug);
    setCode(proj.starterCode);
    setResult(null);
  }

  function resetCode() {
    if (selectedSlug) {
      const proj = projects.find((p) => p.slug === selectedSlug);
      if (proj) { setCode(proj.starterCode); setResult(null); return; }
    }
    setCode(DEFAULT_CODE);
    setResult(null);
  }

  async function runCode() {
    if (running) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Execution failed");
      setResult(data);
      setActiveTab(data.stderr?.trim() ? "errors" : "output");
    } catch (err) {
      setResult({
        status: "error",
        stderr: err instanceof Error ? err.message : "Unknown error",
      });
      setActiveTab("errors");
    } finally {
      setRunning(false);
    }
  }

  const hasOutput = !!(result?.stdout?.trim());
  const hasErrors = !!(result?.stderr?.trim());
  const selectedProject = projects.find((p) => p.slug === selectedSlug);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold text-[var(--text-primary)] mb-1">
            GPU Sandbox
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Write and execute CUDA C++ directly on a cloud GPU — no local setup required.
          </p>
        </div>

        {/* GPU indicator */}
        <div className="font-mono text-xs text-[var(--accent)] flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-dot" />
          GPU execution
        </div>
      </div>

      {/* ── Toolbar: project selector ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--text-subtle)]">load project:</span>
          <select
            value={selectedSlug}
            onChange={(e) => loadProject(e.target.value)}
            className="font-mono text-xs bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] rounded px-2.5 py-1.5 focus:outline-none focus:border-[var(--accent)]/50 transition-colors duration-150 cursor-pointer"
            aria-label="Load project starter code"
          >
            <option value="">— blank template —</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {selectedProject && (
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DIFF_DOT[selectedProject.difficulty] ?? "bg-[var(--border)]"}`} />
            <span className="font-mono text-xs text-[var(--text-subtle)]">
              {selectedProject.difficulty} · {selectedProject.category}
            </span>
          </div>
        )}
      </div>

      {/* ── Editor panel ─────────────────────────────────────── */}
      <div className="border border-[var(--border)] rounded-lg overflow-hidden" style={{ background: "#0d1117" }}>
        {/* Titlebar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="font-mono text-xs text-[var(--text-subtle)]">
              {selectedProject ? `${selectedProject.slug}.cu` : "scratch.cu"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={resetCode}
              className="font-mono text-xs text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors duration-150 cursor-pointer"
              aria-label="Reset to starter code"
            >
              reset
            </button>
            <button
              onClick={runCode}
              disabled={running}
              aria-label={running ? "Running…" : "Run code on GPU"}
              className={`inline-flex items-center gap-2 font-mono font-semibold text-xs px-3.5 py-1.5 rounded transition-all duration-150 cursor-pointer ${
                running
                  ? "bg-[var(--bg-hover)] text-[var(--text-subtle)] cursor-not-allowed"
                  : "bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)]"
              }`}
            >
              {running ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  running…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  run
                </>
              )}
            </button>
          </div>
        </div>

        {/* Monaco */}
        <MonacoEditor
          height={520}
          language="cpp"
          value={code}
          onChange={(v) => setCode(v ?? "")}
          theme={THEME_NAME}
          beforeMount={beforeMount}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontLigatures: true,
            lineHeight: 24,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "off",
            tabSize: 4,
            insertSpaces: true,
            renderLineHighlight: "line",
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            padding: { top: 16, bottom: 16 },
            overviewRulerLanes: 0,
            smoothScrolling: true,
            cursorBlinking: "phase",
            cursorSmoothCaretAnimation: "on",
          }}
        />

        {/* ── Output ───────────────────────────────────────────── */}
        {(result || running) && (
          <div className="border-t border-[var(--border)]">
            <div
              className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]"
              style={{ background: "#080d14" }}
            >
              <div className="flex gap-4" role="tablist" aria-label="Output tabs">
                {(["output", "errors"] as const).map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                    className={`font-mono text-xs pb-0.5 transition-colors duration-150 cursor-pointer ${
                      activeTab === tab
                        ? tab === "output"
                          ? "text-[var(--text-primary)] border-b border-[var(--accent)]"
                          : "text-[var(--text-primary)] border-b border-[var(--red)]"
                        : "text-[var(--text-subtle)] hover:text-[var(--text-muted)]"
                    }`}
                  >
                    {tab}
                    {tab === "output" && hasOutput && (
                      <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] inline-block" />
                    )}
                    {tab === "errors" && hasErrors && (
                      <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[var(--red)] inline-block" />
                    )}
                  </button>
                ))}
              </div>

              {result && (
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className={statusMap[result.status]?.cls ?? "text-[var(--text-muted)]"}>
                    {statusMap[result.status]?.label}
                  </span>
                  {result.durationMs !== undefined && (
                    <span className="text-[var(--text-subtle)]">{result.durationMs}ms</span>
                  )}
                </div>
              )}
            </div>

            <div
              role="tabpanel"
              className="p-4 font-mono text-sm min-h-[100px] max-h-[280px] overflow-y-auto"
              style={{ background: "#080d14" }}
            >
              {running && (
                <span className="text-[var(--text-subtle)]">
                  compiling and running on GPU
                  <span className="animate-blink ml-0.5">_</span>
                </span>
              )}
              {!running && result && (
                <>
                  {activeTab === "output" && (
                    <pre className="text-[#56d364] whitespace-pre-wrap leading-relaxed">
                      {hasOutput
                        ? result.stdout
                        : <span className="text-[var(--text-subtle)]">// no output</span>}
                    </pre>
                  )}
                  {activeTab === "errors" && (
                    <pre className="text-[#ff7b72] whitespace-pre-wrap leading-relaxed">
                      {hasErrors
                        ? result.stderr
                        : <span className="text-[var(--text-subtle)]">// no errors</span>}
                    </pre>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Usage notes ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Timeout", value: "30s per execution" },
          { label: "Rate limit", value: "20 runs / hour (auth)" },
          { label: "GPU", value: "NVIDIA T4 · CUDA 12.x" },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <span className="font-mono text-xs text-[var(--text-subtle)]">{label}</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
