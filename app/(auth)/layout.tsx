import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Globe2, ShieldCheck, Workflow } from "lucide-react";

import { Wordmark } from "@/components/brand/logo";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { GridBackground } from "@/components/ui/grid-background";
import { TextReveal } from "@/components/ui/text-reveal";

const highlights = [
  {
    icon: Workflow,
    title: "See every step",
    body: "Tool calls, browser actions and results stay attached to the run.",
  },
  {
    icon: ShieldCheck,
    title: "Approve what matters",
    body: "Data-changing actions wait for a single-use approval.",
  },
  {
    icon: Globe2,
    title: "Keep the context",
    body: "Browser sessions and app connections survive between visits.",
  },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="ink-panel relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="premium-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
        <div className="pointer-events-none absolute -top-32 left-1/4 size-[28rem] rounded-full bg-brand-soft/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-sky-400/10 blur-3xl" />

        <Link
          href="/"
          className="relative z-10 inline-flex w-fit items-center gap-2 text-[0.78rem] font-medium text-white/55 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Back home
        </Link>

        <div className="relative z-10 max-w-md">
          <Wordmark className="[&>span:first-child]:bg-white [&>span:first-child]:text-[#111113] [&>span:last-child]:text-white" />

          <TextReveal
            as="h2"
            text="The control room for agents that do real work."
            by="word"
            stagger={55}
            delay={80}
            className="mt-10 text-[2.8rem] leading-[1.02] font-semibold tracking-[-0.05em] text-balance text-white"
          />
          <p className="mt-4 max-w-sm text-[0.9rem] leading-7 text-white/55">
            Sign in to watch runs, review approvals and keep every connected app under control.
          </p>

          <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="font-mono text-[0.6rem] text-white/45">run_8f2c · live</span>
              <span className="inline-flex items-center gap-1.5 text-[0.6rem] font-medium text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                On track
              </span>
            </div>
            <div className="mt-3 space-y-2.5">
              {[
                ["Browser", "Pricing page opened"],
                ["Notion", "Launch brief read"],
                ["Approval", "Waiting for you"],
              ].map(([tool, action], index) => (
                <div key={tool} className="flex items-center gap-2.5 text-[0.72rem]">
                  <span className="grid size-5 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 font-mono text-[0.55rem] text-white/45">
                    {index + 1}
                  </span>
                  <span className="w-16 shrink-0 font-medium text-white/80">{tool}</span>
                  <span className="truncate text-white/40">{action}</span>
                  {index < 2 ? (
                    <Check className="ml-auto size-3 text-white/35" strokeWidth={2.5} />
                  ) : (
                    <span className="ml-auto rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[0.55rem] font-semibold text-amber-200">
                      Needs you
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/75">
                  <Icon className="size-3.5" />
                </span>
                <div>
                  <p className="text-[0.8rem] font-semibold text-white/90">{title}</p>
                  <p className="mt-0.5 text-[0.72rem] leading-5 text-white/40">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-2 font-mono text-[0.62rem] text-white/30">
          <span>CloudHike Auth</span>
          <span>·</span>
          <span>Postgres</span>
          <span>·</span>
          <span>Browserbase</span>
        </div>
      </aside>

      <main className="relative flex items-center justify-center overflow-hidden px-5 py-12 sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-35 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]">
          <GridBackground size={40} speed={26} fade={76} className="h-full" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,var(--brand-soft),transparent)]" />
        <div className="absolute top-4 right-4 z-10">
          <ThemeMenu />
        </div>

        <div className="relative w-full max-w-[26rem]">
          <Link href="/" className="mb-9 flex justify-center lg:hidden">
            <Wordmark />
          </Link>

          <div className="premium-panel rounded-2xl p-5 sm:p-8">{children}</div>

          <p className="mt-5 text-center text-[0.68rem] text-muted-foreground">
            Protected by CloudHike Auth · Email verification · No credit card
          </p>
        </div>
      </main>
    </div>
  );
}
