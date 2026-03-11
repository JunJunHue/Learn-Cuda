"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type { TestCase } from "@/data/projects";
import { evaluateTestCases, type TestCaseResult } from "@/lib/sandbox";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center"
      style={{ height: 400, background: "#0d1117" }}
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
  starterCode: string;
  height?: number;
  runTests?: TestCase[];
  submitTests?: TestCase[];
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

const onMount: OnMount = (editor) => {
  editor.focus();
};

export default function SandboxPanel({ starterCode, height = 400, runTests, submitTests }: Props) {
  const [code, setCode] = useState(starterCode);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "errors" | "tests">("output");
  const [testResults, setTestResults] = useState<{ passed: number; total: number; results: TestCaseResult[]; mode: "run" | "submit" } | null>(null);

  async function executeCode() {
    const res = await fetch("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Execution failed");
    return data as SandboxResult;
  }

  async function runCode() {
    if (running || submitting) return;
    setRunning(true);
    setResult(null);
    setTestResults(null);
    try {
      const data = await executeCode();
      setResult(data);
      if (runTests && runTests.length > 0 && data.status === "completed") {
        const tr = evaluateTestCases(data.stdout ?? "", runTests);
        setTestResults({ ...tr, mode: "run" });
        setActiveTab("tests");
      } else {
        setActiveTab(data.stderr?.trim() ? "errors" : "output");
      }
    } catch (err) {
      setResult({ status: "error", stderr: err instanceof Error ? err.message : "Unknown error" });
      setActiveTab("errors");
    } finally {
      setRunning(false);
    }
  }

  async function submitCode() {
    if (running || submitting) return;
    setSubmitting(true);
    setResult(null);
    setTestResults(null);
    try {
      const data = await executeCode();
      setResult(data);
      const tests = submitTests ?? runTests ?? [];
      if (tests.length > 0 && data.status === "completed") {
        const tr = evaluateTestCases(data.stdout ?? "", tests);
        setTestResults({ ...tr, mode: "submit" });
      } else if (tests.length > 0) {
        setTestResults({ passed: 0, total: tests.length, results: tests.map(tc => ({ id: tc.id, description: tc.description, passed: false, hidden: !!tc.hidden })), mode: "submit" });
      }
      setActiveTab("tests");
    } catch (err) {
      setResult({ status: "error", stderr: err instanceof Error ? err.message : "Unknown error" });
      setActiveTab("errors");
    } finally {
      setSubmitting(false);
    }
  }

  const hasOutput = !!(result?.stdout?.trim());
  const hasErrors = !!(result?.stderr?.trim());
  const hasTests = !!(testResults);

  const statusMap = {
    completed: { label: "exited 0",    cls: "text-[var(--accent)]" },
    failed:    { label: "build failed", cls: "text-[var(--red)]" },
    timeout:   { label: "timeout",      cls: "text-[var(--yellow)]" },
    error:     { label: "error",        cls: "text-[var(--red)]" },
  };

  const isActive = running || submitting;

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden" style={{ background: "var(--bg-surface)" }}>
      {/* ── Titlebar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-xs text-[var(--text-subtle)]">main.cu</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCode(starterCode); setResult(null); setTestResults(null); }}
            className="font-mono text-xs text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors duration-150 cursor-pointer"
            aria-label="Reset code to starter"
          >
            reset
          </button>
          {/* Run button — 3 tests */}
          <button
            onClick={runCode}
            disabled={isActive}
            aria-label={running ? "Running…" : "Run code (3 tests)"}
            className={`inline-flex items-center gap-2 font-mono font-semibold text-xs px-3.5 py-1.5 rounded transition-all duration-150 cursor-pointer ${
              isActive
                ? "bg-[var(--bg-hover)] text-[var(--text-subtle)] cursor-not-allowed"
                : "bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
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
          {/* Submit button — full test suite */}
          {(submitTests || runTests) && (
            <button
              onClick={submitCode}
              disabled={isActive}
              aria-label={submitting ? "Submitting…" : `Submit (${(submitTests ?? runTests ?? []).length} tests)`}
              className={`inline-flex items-center gap-2 font-mono font-semibold text-xs px-3.5 py-1.5 rounded transition-all duration-150 cursor-pointer ${
                isActive
                  ? "bg-[var(--bg-hover)] text-[var(--text-subtle)] cursor-not-allowed"
                  : "bg-[var(--accent)] text-[#080d14] hover:bg-[var(--accent-dim)]"
              }`}
            >
              {submitting ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  submitting…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                  submit
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Monaco Editor ─────────────────────────────────────── */}
      <MonacoEditor
        height={height}
        language="cpp"
        value={code}
        onChange={(v) => setCode(v ?? "")}
        theme={THEME_NAME}
        beforeMount={beforeMount}
        onMount={onMount}
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
          renderWhitespace: "none",
          smoothScrolling: true,
          cursorBlinking: "phase",
          cursorSmoothCaretAnimation: "on",
        }}
      />

      {/* ── Output ───────────────────────────────────────────── */}
      {(result || isActive) && (
        <div className="border-t border-[var(--border)]">
          {/* Tab bar */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]"
            style={{ background: "#080d14" }}
          >
            <div className="flex gap-4" role="tablist" aria-label="Output tabs">
              {(["output", "errors", "tests"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`font-mono text-xs pb-0.5 transition-colors duration-150 cursor-pointer ${
                    activeTab === tab
                      ? tab === "errors"
                        ? "text-[var(--text-primary)] border-b border-[var(--red)]"
                        : tab === "tests"
                        ? "text-[var(--text-primary)] border-b border-[var(--accent)]"
                        : "text-[var(--text-primary)] border-b border-[var(--accent)]"
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
                  {tab === "tests" && hasTests && (
                    <span className={`ml-1.5 font-mono text-[10px] ${testResults!.passed === testResults!.total ? "text-[var(--accent)]" : "text-[var(--red)]"}`}>
                      {testResults!.passed}/{testResults!.total}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {result && (
              <div className="flex items-center gap-3 font-mono text-xs">
                {testResults && (
                  <span className={testResults.passed === testResults.total ? "text-[var(--accent)]" : "text-[var(--red)]"}>
                    {testResults.passed}/{testResults.total} passed
                  </span>
                )}
                <span className={statusMap[result.status]?.cls ?? "text-[var(--text-muted)]"}>
                  {statusMap[result.status]?.label}
                </span>
                {result.durationMs !== undefined && (
                  <span className="text-[var(--text-subtle)]">{result.durationMs}ms</span>
                )}
              </div>
            )}
          </div>

          {/* Output content */}
          <div
            role="tabpanel"
            className="p-4 font-mono text-sm min-h-[80px] max-h-[320px] overflow-y-auto"
            style={{ background: "#080d14" }}
          >
            {isActive && (
              <span className="text-[var(--text-subtle)]">
                {submitting ? "running full test suite on GPU" : "compiling and running on GPU"}
                <span className="animate-blink ml-0.5">_</span>
              </span>
            )}
            {!isActive && result && (
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
                {activeTab === "tests" && testResults && (
                  <div className="space-y-1">
                    {/* Summary banner */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded mb-3 font-mono text-xs ${
                      testResults.passed === testResults.total
                        ? "bg-[#0d2818] text-[var(--accent)] border border-[#1a4731]"
                        : "bg-[#2a0d0d] text-[#ff7b72] border border-[#4a1a1a]"
                    }`}>
                      <span className="text-base">{testResults.passed === testResults.total ? "✓" : "✗"}</span>
                      <span className="font-semibold">
                        {testResults.passed}/{testResults.total} test cases passed
                        {testResults.mode === "run" ? " (run)" : " (submit)"}
                      </span>
                      {testResults.passed < testResults.total && (
                        <span className="ml-auto text-[var(--text-subtle)]">
                          {testResults.total - testResults.passed} failing
                        </span>
                      )}
                    </div>

                    {/* Per-test results */}
                    {testResults.results.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                          r.passed ? "text-[#56d364]" : "text-[#ff7b72]"
                        }`}
                      >
                        <span className="font-mono mt-0.5 shrink-0">{r.passed ? "✓" : "✗"}</span>
                        <span className="font-mono text-[var(--text-subtle)] w-16 shrink-0">{r.id}</span>
                        <span className={r.hidden && !r.passed ? "italic text-[var(--text-subtle)]" : ""}>
                          {r.hidden && testResults.mode !== "submit" ? "hidden test" : r.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {activeTab === "tests" && !testResults && (
                  <span className="text-[var(--text-subtle)]">// run or submit to see test results</span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
