"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { ArchifyDiagram } from "@/components/agents/archify-diagram";
import { MermaidDiagram } from "@/components/agents/mermaid-diagram";
import { useHighlightedCode } from "@/hooks/use-highlighted-code";
import { cn } from "@/lib/utils";

/**
 * Assistant replies arrive as markdown, so they are rendered as markdown:
 * headings, lists, tables, quotes, links and fenced code. Raw HTML is skipped
 * (the model's output is data, not markup) and react-markdown's default URL
 * transform keeps links to http, https, mailto and tel only.
 *
 * Fenced code goes through the same shiki highlighter the rest of the app uses
 * and gets a copy button, so a snippet is readable while it streams in.
 */

type HastNode = {
  type?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

function languageOf(node: HastNode | undefined): string {
  const className = node?.properties?.className;
  const list = Array.isArray(className)
    ? className
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];

  for (const entry of list) {
    const match = /^language-([\w-]+)$/.exec(String(entry));
    if (match) return match[1].toLowerCase();
  }

  return "";
}

function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
  const lines = useHighlightedCode(code, language || "text");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/70 bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/50 px-2.5 py-1">
        <span className="font-mono text-[0.6rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(code)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
          aria-label={copied ? "Copied" : "Copy code"}
          className="grid size-5 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3 text-emerald-600" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      </div>

      <pre className="overflow-x-auto px-3 py-2.5 text-[0.74rem] leading-relaxed">
        <code className="font-mono">
          {lines.map((line, index) => (
            <span key={index} className="block min-h-[1.15em]">
              {line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

const components: Components = {
  p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mt-3 mb-1.5 text-[0.98rem] font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 mb-1.5 text-[0.92rem] font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2.5 mb-1 text-[0.87rem] font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2.5 mb-1 text-[0.83rem] font-semibold first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-2 mb-1 text-[0.82rem] font-semibold first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mt-2 mb-1 text-[0.78rem] font-semibold text-muted-foreground uppercase first:mt-0">
      {children}
    </h6>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-1 pl-4 marker:text-muted-foreground [&_ol]:my-1 [&_ul]:my-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-1 pl-4 marker:text-muted-foreground [&_ol]:my-1 [&_ul]:my-1">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5 leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-muted-foreground line-through">{children}</del>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-brand-border pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border/60" />,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium break-words text-brand-ink underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.78em]">{children}</code>
  ),
  pre: ({ node, children }) => {
    // `node` is the hast <pre><code class="language-…">…</code></pre> element.
    const codeNode = (node as unknown as HastNode | undefined)?.children?.[0];
    const language = languageOf(codeNode);
    const code = hastText(codeNode).replace(/\n$/, "");

    if (!code.trim()) return <pre className="my-2">{children}</pre>;

    // Diagrams get a real picture; everything else stays a highlighted snippet.
    // ```archify holds Archify JSON IR; ```mermaid is the legacy form and still
    // renders for old transcripts.
    if (language === "archify") return <ArchifyDiagram source={code} autoHeight />;
    if (language === "mermaid") return <MermaidDiagram code={code} />;

    return <MarkdownCodeBlock code={code} language={language} />;
  },
  table: ({ children }) => (
    <div className="my-2 w-full max-w-full overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full min-w-full border-collapse text-left text-[0.76rem]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border/60 px-2 py-1 font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/40 px-2 py-1 align-top last:border-b-0">{children}</td>
  ),
  // eslint-disable-next-line @next/next/no-img-element -- markdown images are rare and not worth the optimizer
  img: ({ src, alt }) => (
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      className="my-2 max-h-64 max-w-full h-auto rounded-lg border border-border/60 object-contain"
    />
  ),
  input: ({ checked }) => (
    <span
      aria-hidden
      className={cn(
        "mr-1.5 inline-block size-3 translate-y-px rounded-[3px] border border-border align-middle",
        checked && "border-brand-border bg-brand-soft",
      )}
    />
  ),
};

export function MarkdownMessage({
  content,
  className,
  caret = false,
}: {
  content: string;
  className?: string;
  /** While a reply streams, a blinking caret follows the last block. */
  caret?: boolean;
}) {
  return (
    <div className={cn("min-w-0 break-words", caret && "agent-caret-tail", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
