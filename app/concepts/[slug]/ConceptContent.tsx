"use client";

import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
  codeExample?: string;
}

export default function ConceptContent({ content, codeExample }: Props) {
  return (
    <div className="space-y-6">
      {/* Markdown prose */}
      <div className="prose-concept">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="font-mono text-2xl font-bold text-[var(--text-primary)] mb-4 mt-8 first:mt-0 leading-tight">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="font-mono text-lg font-semibold text-[var(--text-primary)] mb-3 mt-7 first:mt-0 leading-snug border-b border-[var(--border)] pb-2">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-mono text-base font-semibold text-[var(--text-muted)] mb-2 mt-5 first:mt-0">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-[var(--text-muted)] leading-relaxed text-base mb-4">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <div className="my-4 rounded-lg overflow-hidden border border-[var(--border)]">
                    <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg)] border-b border-[var(--border)]">
                      <span className="font-mono text-xs text-[var(--text-subtle)]">
                        {className?.replace("language-", "") ?? "code"}
                      </span>
                    </div>
                    <pre className="p-4 overflow-x-auto bg-[#0d1117]">
                      <code className="font-mono text-sm text-[var(--text-primary)] leading-6">
                        {children}
                      </code>
                    </pre>
                  </div>
                );
              }
              return (
                <code className="font-mono text-sm text-[var(--accent)] bg-[var(--bg-surface)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <>{children}</>,
            ul: ({ children }) => (
              <ul className="list-none space-y-1.5 mb-4 text-[var(--text-muted)]">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-1.5 mb-4 text-[var(--text-muted)]">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="flex items-start gap-2 text-base leading-relaxed">
                <span className="text-[var(--accent)] mt-1.5 shrink-0">▸</span>
                <span>{children}</span>
              </li>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-[var(--accent)]/50 pl-4 my-4 text-[var(--text-subtle)] italic">
                {children}
              </blockquote>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

      {/* Code example */}
      {codeExample && (
        <div>
          <p className="font-mono text-xs text-[var(--text-subtle)] mb-3">// CODE EXAMPLE</p>
          <div className="rounded-lg overflow-hidden border border-[var(--border)]">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg)] border-b border-[var(--border)]">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <span className="font-mono text-xs text-[var(--text-subtle)]">example.cu</span>
            </div>
            <pre className="p-5 overflow-x-auto bg-[#0d1117] scanlines">
              <code className="font-mono text-sm text-[var(--text-primary)] leading-6">
                {codeExample}
              </code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
