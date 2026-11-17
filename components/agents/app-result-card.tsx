import type { ReactNode } from "react";

import { Check, ListChecks, Table2, Text } from "lucide-react";

import type { AgentResultCard as ResultCard } from "@/lib/apps/results";
import { cn } from "@/lib/utils";

/**
 * Renders app action results from data only.
 *
 * Every value here came through `buildResultCard`, which strips tags and caps
 * lengths. This component never uses `dangerouslySetInnerHTML`: a hostile
 * email subject or file name stays text.
 */

function CardShell({
  icon: Icon,
  title,
  children,
  footer,
}: {
  icon: typeof Check;
  title: string;
  children: ReactNode;
  footer?: string;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border/60 bg-card ring-1 ring-border/40">
      <figcaption className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-3 py-1.5">
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[0.7rem] font-semibold">{title}</span>
      </figcaption>
      <div className="px-3 py-2">{children}</div>
      {footer ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-[0.62rem] text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </figure>
  );
}

export function AppResultCard({ card }: { card: ResultCard }) {
  if (card.kind === "text") {
    return (
      <CardShell icon={Text} title={card.title}>
        <p className="max-h-64 overflow-y-auto text-[0.76rem] leading-relaxed whitespace-pre-wrap text-foreground/90">
          {card.text}
        </p>
      </CardShell>
    );
  }

  if (card.kind === "fields") {
    return (
      <CardShell icon={ListChecks} title={card.title}>
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {card.fields.map((field, index) => (
            <div key={`${field.label}-${index}`} className="min-w-0">
              <dt className="text-[0.6rem] font-medium tracking-wide text-muted-foreground uppercase">
                {field.label}
              </dt>
              <dd className="truncate text-[0.76rem] text-foreground/90" title={field.value}>
                {field.value || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </CardShell>
    );
  }

  if (card.kind === "list") {
    return (
      <CardShell icon={ListChecks} title={card.title} footer={`${card.items.length} result${card.items.length === 1 ? "" : "s"}`}>
        <ul className="divide-y divide-border/50">
          {card.items.map((item, index) => (
            <li key={`${item.title}-${index}`} className="py-1.5 first:pt-0 last:pb-0">
              <p className="truncate text-[0.76rem] font-medium" title={item.title}>
                {item.title}
              </p>
              {item.subtitle ? (
                <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                  {item.subtitle}
                </p>
              ) : null}
              {item.meta ? (
                <p className="mt-0.5 text-[0.62rem] text-muted-foreground/80">{item.meta}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardShell>
    );
  }

  return (
    <CardShell
      icon={Table2}
      title={card.title}
      footer={`${card.rows.length} row${card.rows.length === 1 ? "" : "s"}`}
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-left">
          <thead>
            <tr>
              {card.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-border/60 px-1.5 py-1 text-[0.6rem] font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-muted/20">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={cn(
                      "max-w-52 truncate border-b border-border/40 px-1.5 py-1 text-[0.72rem] text-foreground/90",
                    )}
                    title={cell}
                  >
                    {cell || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}
