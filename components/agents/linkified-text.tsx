import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
/** Punctuation that ends a sentence rather than the URL. */
const TRAILING = /[.,;:!?)\]]+$/;

/**
 * Plain text with clickable links. Chat replies often cite sources, so any
 * http(s) URL becomes an anchor that opens in a new tab with no referrer.
 */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    let trailing = "";

    const punctuation = TRAILING.exec(url);
    if (punctuation) {
      trailing = punctuation[0];
      url = url.slice(0, -trailing.length);
    }

    if (start > cursor) nodes.push(text.slice(cursor, start));

    nodes.push(
      <a
        key={`link-${start}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium break-all text-brand-ink underline underline-offset-2 hover:text-foreground"
      >
        {url}
      </a>,
    );

    if (trailing) nodes.push(trailing);

    cursor = start + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <span className={cn("whitespace-pre-wrap", className)}>{nodes}</span>;
}
