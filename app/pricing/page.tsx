import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { Wordmark } from "@/components/brand/logo";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { buttonVariants } from "@/components/ui/button";
import { GridBackground } from "@/components/ui/grid-background";
import { PLANS, formatTokens } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple pricing for AI agents, live widgets and model tokens. Start on Free and move to Pro when your workspace grows.",
};

const included = [
  {
    title: "AI agents that do the work",
    body: "Chat, run tasks on a schedule and keep a visible transcript of every step, tool call and result.",
  },
  {
    title: "1,700+ app connections",
    body: "Connect Gmail, Slack, Notion, Linear and the rest of the Composio catalog without leaving the workspace.",
  },
  {
    title: "A real cloud browser",
    body: "Agents can open pages, fill forms and keep their sign-ins between sessions with a saved browser profile.",
  },
  {
    title: "Approval-gated actions",
    body: "Read-only steps run immediately. Anything that changes your systems waits for your approval first.",
  },
  {
    title: "MCP, skills and plugins",
    body: "Bring your own MCP servers, workspace skills, HTTP plugins and OpenAI-compatible models.",
  },
  {
    title: "Live dashboard widgets",
    body: "Turn an answer into a widget and let it refresh itself from the sources you choose.",
  },
];

const faqs = [
  {
    question: "What counts as a token?",
    answer:
      "Model input plus output for every agent turn. The monthly total resets on the 1st at 00:00 UTC.",
  },
  {
    question: "What happens when I reach a limit?",
    answer:
      "Creating another agent or widget stops with a clear message, and a run stops before it calls the model. Your existing agents, widgets and data stay exactly where they are.",
  },
  {
    question: "Can I bring my own model?",
    answer:
      "Yes. Open an agent's AI Model section, choose Add custom model and connect any OpenAI-compatible endpoint with your own key. Keys are encrypted before they are stored.",
  },
  {
    question: "How do I move to Pro?",
    answer:
      "Pro is activated per workspace. Start on Free, then open Settings → Plan & pricing to see the current limits and arrange the upgrade for your workspace.",
  },
];

import { LandingNav } from "@/components/landing-nav";

export default function PricingPage() {
  const plans = [PLANS.free, PLANS.pro];

  return (
    <div className="relative min-h-svh overflow-x-hidden bg-background">
      <LandingNav currentPath="/pricing" />

      <main>
        <section className="relative overflow-hidden border-b border-border/80">
          <div className="pointer-events-none absolute inset-0 opacity-50">
            <GridBackground size={48} speed={22} fade={80} className="h-full" />
          </div>
          <div className="pointer-events-none absolute top-[-14rem] left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-brand-soft blur-3xl" />

          <div className="relative mx-auto w-full max-w-6xl px-4 py-12 text-center sm:px-8 sm:py-16 lg:py-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[0.7rem] font-medium text-foreground shadow-sm">
              <Sparkles className="size-3 text-brand-ink" />
              Plans that scale with the work
            </span>
            <h1 className="mx-auto mt-5 max-w-3xl text-3xl sm:text-5xl lg:text-6xl leading-[1.04] sm:leading-[1.02] font-semibold tracking-[-0.05em] text-balance">
              Start free. Add room when your agents earn it.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-[0.85rem] sm:text-[0.9rem] leading-6 sm:leading-7 text-muted-foreground">
              Every plan includes the full agent workspace — tools, apps, cloud browser, schedules
              and approvals. The only difference is how many agents, widgets and model tokens you
              get.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 lg:py-16">
          <div className="grid gap-5 md:grid-cols-2">
            {plans.map((plan) => {
              const isPro = plan.id === "pro";

              return (
                <article
                  key={plan.id}
                  className={cn(
                    "premium-panel relative flex flex-col rounded-3xl p-6 sm:p-7",
                    isPro && "ring-2 ring-brand-ink/25",
                  )}
                >
                  {isPro ? (
                    <span className="absolute -top-3 right-6 rounded-full bg-foreground px-2.5 py-1 text-[0.6rem] font-semibold tracking-[0.08em] text-background uppercase">
                      Best for growing teams
                    </span>
                  ) : null}

                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-[-0.02em]">{plan.name}</h2>
                    <p className="text-right">
                      <span className="text-4xl font-semibold tracking-[-0.05em]">
                        ${plan.price}
                      </span>
                      <span className="text-[0.72rem] text-muted-foreground">/month</span>
                    </p>
                  </div>

                  <p className="mt-2 text-[0.8rem] leading-6 text-muted-foreground">
                    {isPro
                      ? "For workspaces running several agents, widgets and scheduled tasks every day."
                      : "For trying the workspace, building your first agents and keeping a few widgets live."}
                  </p>

                  <div className="mt-6 space-y-2.5 border-t border-border/60 pt-5">
                    {isPro ? (
                      <p className="flex items-start gap-2 text-[0.8rem] font-medium">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                        Everything in Free
                      </p>
                    ) : null}
                    <p className="flex items-start gap-2 text-[0.8rem]">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      {plan.agents} AI agents
                    </p>
                    <p className="flex items-start gap-2 text-[0.8rem]">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      {plan.widgets} live dashboard widgets
                    </p>
                    <p className="flex items-start gap-2 text-[0.8rem]">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      {formatTokens(plan.tokens)} model tokens each month
                    </p>
                    <p className="flex items-start gap-2 text-[0.8rem]">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      Full workspace: tools, apps, MCP, browser and schedules
                    </p>
                  </div>

                  <div className="mt-7">
                    {isPro ? (
                      <Link
                        href="/dashboard/settings#plan"
                        className={buttonVariants({
                          className:
                            "h-10 w-full rounded-xl brand-gradient text-[0.82rem] font-semibold text-brand-on shadow-sm hover:opacity-90",
                        })}
                      >
                        Upgrade in Settings
                        <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href="/sign-up"
                        className={buttonVariants({
                          className:
                            "h-10 w-full rounded-xl bg-foreground text-[0.82rem] font-semibold text-background shadow-sm hover:bg-foreground/90",
                        })}
                      >
                        Start free
                        <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                    <p className="mt-2.5 text-center text-[0.66rem] text-muted-foreground">
                      {isPro
                        ? "Create a workspace, then activate Pro from Settings."
                        : "No card required. Tokens reset on the 1st (UTC)."}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border/80 bg-card/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-[0.66rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Every plan includes
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                The whole workspace, not a feature list with holes.
              </h2>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {included.map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-border/70 bg-background p-4"
                >
                  <div className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand-ink ring-1 ring-brand-border">
                    <Check className="size-3.5" strokeWidth={3} />
                  </div>
                  <h3 className="mt-3 text-[0.84rem] font-semibold">{item.title}</h3>
                  <p className="mt-1 text-[0.74rem] leading-6 text-muted-foreground">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8">
          <p className="text-[0.66rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Questions
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Before you pick a plan</h2>

          <div className="mt-6 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
            {faqs.map((item) => (
              <details key={item.question} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.84rem] font-medium">
                  {item.question}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-2xl text-[0.78rem] leading-6 text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-border/70 bg-background p-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-[0.88rem] font-semibold">Ready to put an agent to work?</p>
              <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                Start on Free. You can change plans once your workspace is running.
              </p>
            </div>
            <Link
              href="/sign-up"
              className={buttonVariants({
                className:
                  "h-9 shrink-0 rounded-xl bg-foreground px-4 text-[0.8rem] font-semibold text-background hover:bg-foreground/90",
              })}
            >
              Create free account
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/80 bg-card/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark />
          <div className="flex flex-wrap items-center gap-4 text-[0.72rem] text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-foreground">
              Pricing
            </Link>
            <Link href="/sign-in" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <span>© {new Date().getFullYear()} Alcatraz</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
