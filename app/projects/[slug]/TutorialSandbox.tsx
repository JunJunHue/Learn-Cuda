"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount } from "@monaco-editor/react";
import type { TutorialStep } from "@/data/projects";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center" style={{ height: 400, background: "#0d1117" }}>
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

const THEME_NAME = "cuda-dark";

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

const statusMap = {
  completed: { label: "exited 0",    cls: "text-[var(--accent)]" },
  failed:    { label: "build failed", cls: "text-[var(--red)]" },
  timeout:   { label: "timeout",      cls: "text-[var(--yellow)]" },
  error:     { label: "error",        cls: "text-[var(--red)]" },
};

// ── Simple inline markdown renderer for instructions ──────────────────────
function renderInstruction(text: string) {
  // Split on code fences first
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const code = part.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return (
        <pre key={i} className="mt-2 mb-2 p-3 rounded bg-[#080d14] border border-[var(--border)] font-mono text-xs text-[var(--text-primary)] leading-5 overflow-x-auto">
          <code>{code}</code>
        </pre>
      );
    }
    // Inline elements within non-code parts
    return (
      <span key={i}>
        {part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((seg, j) => {
          if (seg.startsWith("`") && seg.endsWith("`")) {
            return (
              <code key={j} className="font-mono text-xs text-[var(--accent)] bg-[var(--bg-raised)] border border-[var(--border)] px-1 py-0.5 rounded">
                {seg.slice(1, -1)}
              </code>
            );
          }
          if (seg.startsWith("**") && seg.endsWith("**")) {
            return <strong key={j} className="font-semibold text-[var(--text-primary)]">{seg.slice(2, -2)}</strong>;
          }
          // Handle newlines as line breaks
          return seg.split("\n").map((line, k, arr) => (
            <span key={k}>{line}{k < arr.length - 1 ? <br /> : null}</span>
          ));
        })}
      </span>
    );
  });
}

export default function TutorialSandbox({ steps }: { steps: TutorialStep[] }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [codes, setCodes] = useState<string[]>(steps.map((s) => s.starterCode));
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "errors">("output");
  const [showHint, setShowHint] = useState(false);

  const step = steps[stepIdx];
  const code = codes[stepIdx];

  function setCode(val: string) {
    setCodes((prev) => { const next = [...prev]; next[stepIdx] = val; return next; });
  }

  function goToStep(idx: number) {
    setStepIdx(idx);
    setResult(null);
    setShowHint(false);
    setActiveTab("output");
  }

  function resetStep() {
    setCode(step.starterCode);
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
      setResult({ status: "error", stderr: err instanceof Error ? err.message : "Unknown error" });
      setActiveTab("errors");
    } finally {
      setRunning(false);
    }
  }

  const hasOutput = !!(result?.stdout?.trim());
  const hasErrors = !!(result?.stderr?.trim());

  return (
    <div className="space-y-0 border border-[var(--border)] rounded-lg overflow-hidden">

      {/* ── Step navigation bar ───────────────────────────────── */}
      <div className="bg-[var(--bg)] border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Step dots */}
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => goToStep(i)}
                title={s.title}
                className={`transition-all duration-150 cursor-pointer rounded-full ${
                  i === stepIdx
                    ? "w-6 h-2.5 bg-[var(--accent)]"
                    : i < stepIdx
                    ? "w-2.5 h-2.5 bg-[var(--accent)]/40 hover:bg-[var(--accent)]/60"
                    : "w-2.5 h-2.5 bg-[var(--border)] hover:bg-[var(--text-subtle)]"
                }`}
                aria-label={`Go to ${s.title}`}
              />
            ))}
            <span className="font-mono text-xs text-[var(--text-subtle)] ml-1">
              {stepIdx + 1} / {steps.length}
            </span>
          </div>

          {/* Prev / Next */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToStep(stepIdx - 1)}
              disabled={stepIdx === 0}
              className="font-mono text-xs px-2.5 py-1 rounded border border-[var(--border)] text-[var(--text-subtle)] hover:text-[var(--text-muted)] hover:border-[var(--text-subtle)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
            >
              ← prev
            </button>
            <button
              onClick={() => goToStep(stepIdx + 1)}
              disabled={stepIdx === steps.length - 1}
              className="font-mono text-xs px-2.5 py-1 rounded border border-[var(--border)] text-[var(--text-subtle)] hover:text-[var(--text-muted)] hover:border-[var(--text-subtle)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
            >
              next →
            </button>
          </div>
        </div>
      </div>

      {/* ── Step instruction ─────────────────────────────────── */}
      <div className="bg-[var(--bg-surface)] border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)] leading-snug">
            {step.title}
          </h3>
          {step.hint && (
            <button
              onClick={() => setShowHint((v) => !v)}
              className="shrink-0 font-mono text-xs px-2.5 py-1 rounded border border-[var(--border)] text-[var(--text-subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors duration-150 cursor-pointer"
            >
              {showHint ? "hide hint" : "show hint ▾"}
            </button>
          )}
        </div>
        <div className="font-sans text-sm text-[var(--text-muted)] leading-relaxed space-y-1">
          {renderInstruction(step.instruction)}
        </div>
        {showHint && step.hint && (
          <div className="mt-3 p-3 rounded border border-[var(--accent)]/20 bg-[var(--accent-bg)]">
            <p className="font-mono text-xs text-[var(--accent)] mb-1.5">hint:</p>
            <div className="font-sans text-sm text-[var(--text-muted)] leading-relaxed">
              {renderInstruction(step.hint)}
            </div>
          </div>
        )}
      </div>

      {/* ── Editor titlebar ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-xs text-[var(--text-subtle)]">main.cu</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetStep}
            className="font-mono text-xs text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors duration-150 cursor-pointer"
          >
            reset
          </button>
          <button
            onClick={runCode}
            disabled={running}
            className={`inline-flex items-center gap-2 font-mono font-semibold text-xs px-3.5 py-1.5 rounded transition-all duration-150 cursor-pointer ${
              running
                ? "bg-[var(--bg-hover)] text-[var(--text-subtle)] cursor-not-allowed"
                : "bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)]"
            }`}
          >
            {running ? (
              <>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                running…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                run
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Monaco editor ─────────────────────────────────────── */}
      <MonacoEditor
        height={400}
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

      {/* ── Output panel ─────────────────────────────────────── */}
      {(result || running) && (
        <div className="border-t border-[var(--border)]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]" style={{ background: "#080d14" }}>
            <div className="flex gap-4" role="tablist">
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
          <div role="tabpanel" className="p-4 font-mono text-sm min-h-[80px] max-h-[240px] overflow-y-auto" style={{ background: "#080d14" }}>
            {running && (
              <span className="text-[var(--text-subtle)]">
                compiling and running on GPU<span className="animate-blink ml-0.5">_</span>
              </span>
            )}
            {!running && result && (
              <>
                {activeTab === "output" && (
                  <pre className="text-[#56d364] whitespace-pre-wrap leading-relaxed">
                    {hasOutput ? result.stdout : <span className="text-[var(--text-subtle)]">// no output</span>}
                  </pre>
                )}
                {activeTab === "errors" && (
                  <pre className="text-[#ff7b72] whitespace-pre-wrap leading-relaxed">
                    {hasErrors ? result.stderr : <span className="text-[var(--text-subtle)]">// no errors</span>}
                  </pre>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Expected output (reference) ───────────────────────── */}
      {step.expectedOutput && (
        <div className="border-t border-[var(--border)] px-4 py-3 bg-[var(--bg-surface)]">
          <p className="font-mono text-xs text-[var(--text-subtle)] mb-2">// expected output</p>
          <pre className="font-mono text-xs text-[var(--text-subtle)] whitespace-pre-wrap leading-5">
            {step.expectedOutput}
          </pre>
        </div>
      )}
    </div>
  );
}
