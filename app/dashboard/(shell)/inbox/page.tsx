import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Inbox as InboxIcon,
  ShieldAlert,
} from "lucide-react";

import { EmptyCalendar } from "@/components/aui/illustrations/empty-calendar";
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { listInboxForUser, type InboxItem } from "@/lib/inbox";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbox" };

const KIND_LOOK: Record<InboxItem["kind"], { icon: typeof ShieldAlert; tone: string; word: string }> =
  {
    approval: {
      icon: ShieldAlert,
      tone: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
      word: "Approval",
    },
    review: {
      icon: ClipboardCheck,
      tone: "bg-brand-soft text-brand-ink ring-brand-border",
      word: "Review",
    },
    schedule_run: {
      icon: AlertTriangle,
      tone: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
      word: "Scheduled run",
    },
    task_run: {
      icon: AlertTriangle,
      tone: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
      word: "Task run",
    },
    widget_refresh: {
      icon: AlertTriangle,
      tone: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
      word: "Widget update",
    },
  };

/** "just now", "12m ago", "3h ago", "2d ago", then the date. */
function when(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Row({ item }: { item: InboxItem }) {
  const look = KIND_LOOK[item.kind];
  const Icon = look.icon;

  return (
    <Link
      href={item.href}
      className="group flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-brand-border hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ring-1", look.tone)}
        aria-hidden="true"
      >
        <Icon className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium">{item.title}</span>
          <span className="shrink-0 text-[0.58rem] text-muted-foreground tabular-nums">
            {when(item.at)}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[0.7rem] leading-relaxed text-muted-foreground">
          {item.detail}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[0.56rem] uppercase tracking-[0.1em] text-muted-foreground">
          {look.word}
          {item.agent ? <span className="normal-case tracking-normal">· {item.agent.name}</span> : null}
        </span>
      </span>

      <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export default async function InboxPage() {
  const user = await requireUser();
  const profile = await ensureUserRecord(user);
  const inbox = await listInboxForUser(profile.id);

  const active = inbox.groups.filter((group) => group.items.length > 0);
  const total = active.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="aui-page max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Workspace</p>
          <h1 className="aui-title mt-2">Inbox</h1>
          <p className="aui-subtitle mt-2">
            What is waiting on you, what needs a read-through, what failed and what finished on its
            own. Every row is a stored approval, card or run — nothing here is a summary the
            workspace made up.
          </p>
        </div>

        <span className="aui-chip text-[0.72rem]">
          <InboxIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{inbox.needsYou}</span> need
          you
          {total > 0 ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums">{total}</span> listed
            </>
          ) : null}
        </span>
      </div>

      {total === 0 ? (
        <IllustratedEmpty
          className="mt-6 py-10"
          art={<EmptyCalendar />}
          artClassName="w-32"
          title="Nothing is waiting on you"
          text="Approvals, review cards and failed runs land here as they happen. Work that runs on its own clock appears once it finishes."
          action={
            <Link
              href="/dashboard/tasks"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[0.74rem] font-medium transition-colors hover:bg-muted"
            >
              Open the task board
              <ArrowUpRight className="size-3" />
            </Link>
          }
        />
      ) : (
        <div className="mt-6 space-y-6">
          {active.map((group) => (
            <section key={group.id} aria-labelledby={`inbox-${group.id}`}>
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <h2
                  id={`inbox-${group.id}`}
                  className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                >
                  {group.label}
                </h2>
                <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                  {group.items.length}
                  {group.truncated ? "+" : ""}
                </span>
              </div>
              <p className="mt-1 px-0.5 text-[0.66rem] leading-relaxed text-muted-foreground">
                {group.hint}
              </p>

              <div className="mt-2 space-y-1.5">
                {group.items.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </div>

              {group.truncated ? (
                <p className="mt-1.5 px-0.5 text-[0.62rem] text-muted-foreground">
                  Newest shown. {group.id === "finished" ? "Older results stay in each agent's history." : "Older rows stay on the surface that owns them."}
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 flex items-start gap-1.5 text-[0.66rem] leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span>
          A run counts as finished when the agent recorded a reply — not because a card says
          &ldquo;done&rdquo;. Approvals are only listed while their single-use token can still be
          used; once one expires, it leaves this list.
        </span>
      </p>
    </div>
  );
}
