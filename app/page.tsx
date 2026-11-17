import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Check,
  CircleCheck,
  Clock3,
  Globe2,
  Layers3,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";

import { AgentTeam } from "@/components/agent-team";
import { LogoMarquee } from "@/components/logo-marquee";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { ChangeSummary } from "@/components/ui/change-summary";
import { GridBackground } from "@/components/ui/grid-background";
import { IntegrationBeam } from "@/components/integration-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ProgressTracker } from "@/components/ui/progress-tracker";
import { TextReveal } from "@/components/ui/text-reveal";
import { buttonVariants } from "@/components/ui/button";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { getIntegration } from "@/lib/apps/catalog";

import { LandingNav } from "@/components/landing-nav";

const integrationStrip = ["gmail", "slack", "notion", "github", "linear", "stripe"].flatMap(
  (slug) => {
    const app = getIntegration(slug);
    return app ? [app] : [];
  },
);

const integrationLogos = integrationStrip.map((app) => ({
  name: app.name,
  src: app.logo ?? `https://logos.composio.dev/api/${app.slug}`,
  color: app.color,
}));

const teamAvatar = (background: string, ink: string, accent: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="${background}"/><circle cx="48" cy="38" r="17" fill="${ink}"/><path d="M20 82c3-18 14-27 28-27s25 9 28 27" fill="${ink}"/><circle cx="41" cy="37" r="3" fill="${accent}"/><circle cx="55" cy="37" r="3" fill="${accent}"/><path d="M41 47c4 4 10 4 14 0" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  )}`;

const beamTools = integrationStrip.map((app) => ({
  name: app.name,
  logo: (
    <img
      src={app.logo ?? `https://logos.composio.dev/api/${app.slug}`}
      alt=""
      className="size-7 rounded-[0.35rem] object-contain"
      loading="lazy"
    />
  ),
}));

const loop = [
  {
    step: "01",
    title: "Give the agent a job",
    body: "Chat, schedule it, or trigger a run. The agent gets tools, apps and a browser — not a blank prompt.",
  },
  {
    step: "02",
    title: "Watch it work",
    body: "Streamed answers, tool calls, browser frames and run history. Every step is visible while it happens.",
  },
  {
    step: "03",
    title: "Stay in control",
    body: "Read-only actions run immediately. Anything that changes your systems waits for your approval.",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-svh overflow-x-hidden bg-background">
      <LandingNav currentPath="/" />

      <main>
        <section className="relative overflow-hidden border-b border-border/80">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <GridBackground size={48} speed={22} fade={82} className="h-full" />
          </div>
          <div className="pointer-events-none absolute top-[-12rem] left-1/2 size-[34rem] -translate-x-1/2 rounded-full bg-brand-soft blur-3xl" />

          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-8 sm:gap-14 sm:py-16 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-12 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[0.7rem] font-medium text-foreground shadow-sm">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
                Agent operations, without the noise
              </span>

              <h1 className="mt-5 max-w-[43rem] text-3xl sm:text-5xl lg:text-[4.15rem] leading-[1.05] sm:leading-[0.98] font-semibold tracking-[-0.05em] text-balance">
                Your agents, in one{" "}
                <span className="relative inline-block">
                  calm
                  <span className="absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-brand-ink/80 sm:-bottom-2" />
                </span>{" "}
                control room.
              </h1>

              <TextReveal
                as="p"
                text="Run agents that browse, call your apps and come back with work you can trust. Watch every step, approve what matters, and keep the whole operation in one place."
                stagger={15}
                className="mt-6 max-w-[34rem] text-[0.98rem] leading-7 text-muted-foreground sm:text-[1.05rem]"
              />

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/sign-up"
                  className={buttonVariants({
                    className:
                      "h-11 rounded-xl bg-foreground px-5 text-[0.9rem] font-semibold text-background shadow-sm hover:bg-foreground/90",
                  })}
                >
                  Start building
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className={buttonVariants({
                    variant: "outline",
                    className:
                      "h-11 rounded-xl border-border bg-card px-5 text-[0.9rem] font-semibold text-foreground hover:bg-muted",
                  })}
                >
                  Sign in
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.72rem] text-muted-foreground">
                {["Free while in beta", "Email, Google and GitHub", "No credit card"].map(
                  (item) => (
                    <span key={item} className="inline-flex items-center gap-1.5">
                      <Check className="size-3.5 text-brand-ink" strokeWidth={2.4} />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-7 -z-10 rounded-[2.5rem] bg-[radial-gradient(55%_55%_at_55%_35%,var(--brand-soft),transparent_72%)] blur-2xl" />

              <div className="rounded-[1.45rem] border border-border bg-muted/70 p-1.5 shadow-[0_28px_80px_-48px_rgba(24,24,27,0.55)]">
                <div className="overflow-hidden rounded-[1.05rem] border border-border bg-card">
                  <div className="flex h-11 items-center gap-2 border-b border-border/80 px-3.5">
                    <span className="flex gap-1.5">
                      <span className="size-2 rounded-full bg-border" />
                      <span className="size-2 rounded-full bg-border" />
                      <span className="size-2 rounded-full bg-border" />
                    </span>
                    <span className="mx-auto hidden items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 font-mono text-[0.62rem] text-muted-foreground sm:flex">
                      <Bot className="size-3" />
                      workspace / agents
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[0.6rem] font-semibold tracking-wide text-emerald-700 uppercase">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Live
                    </span>
                  </div>

                  <div className="p-3.5 sm:p-4">
                    <div className="flex items-start justify-between gap-4 px-1 pb-3">
                      <div>
                        <p className="text-[0.86rem] font-semibold tracking-tight">Launch week</p>
                        <p className="mt-0.5 text-[0.66rem] text-muted-foreground">
                          Workspace health · product preview
                        </p>
                      </div>
                      <span className="rounded-full border border-border bg-background px-2 py-1 font-mono text-[0.58rem] text-muted-foreground">
                        3 agents
                      </span>
                    </div>

                    <ChangeSummary
                      title="Run health"
                      period="Last 24h"
                      changes={[
                        { label: "Success rate", change: "Up 1.2% to 99.4%", tone: "good" },
                        { label: "p95 latency", change: "Down 180ms", tone: "good", direction: "down" },
                        { label: "Spend", change: "62% of monthly budget", tone: "neutral" },
                      ]}
                    />

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border bg-background p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[0.7rem] font-semibold">Running now</p>
                          <Clock3 className="size-3.5 text-muted-foreground" />
                        </div>
                        <div className="mt-2.5 space-y-2">
                          {[
                            { icon: Globe2, label: "Browser", detail: "Pricing page" },
                            { icon: Terminal, label: "Notion", detail: "Launch brief" },
                            { icon: CircleCheck, label: "Draft", detail: "Ready to review" },
                          ].map(({ icon: Icon, label, detail }) => (
                            <div key={label} className="flex items-center gap-2 text-[0.68rem]">
                              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                                <Icon className="size-3" />
                              </span>
                              <span className="font-medium">{label}</span>
                              <span className="ml-auto truncate text-muted-foreground">
                                {detail}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3">
                        <div className="flex items-center gap-1.5 text-[0.62rem] font-semibold tracking-[0.08em] text-amber-800 uppercase">
                          <ShieldCheck className="size-3.5" />
                          Needs you
                        </div>
                        <p className="mt-2 text-[0.76rem] font-medium leading-snug">
                          Send 14 follow-ups from Gmail
                        </p>
                        <p className="mt-1 text-[0.66rem] leading-relaxed text-amber-800/70">
                          A data-changing action. It waits until you approve the exact recipients
                          and copy.
                        </p>
                        <span className="mt-2.5 inline-flex rounded-md border border-amber-300/70 bg-card px-2 py-1 text-[0.62rem] font-semibold text-amber-900">
                          Review request
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border/80 bg-background">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:py-20">
            <div>
              <p className="font-mono text-[0.66rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                Agent team
              </p>
              <TextReveal
                as="h2"
                text="One request. Three agents working."
                stagger={45}
                className="mt-3 max-w-md text-3xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance sm:text-[2.45rem]"
              />
              <p className="mt-4 max-w-md text-[0.9rem] leading-7 text-muted-foreground">
                Describe the outcome. The team splits the work, reaches for the right tools and
                reports back through the same trace you can inspect.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Research", "Write", "Operate"].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-[0.66rem] font-medium text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <AgentTeam
                prompt="Research the launch, draft the brief and update the team"
                members={[
                  {
                    role: "Researcher",
                    avatar: teamAvatar("#e8eefc", "#1d4ed8", "#ffffff"),
                    tools: ["gmail", "slack"],
                  },
                  {
                    role: "Writer",
                    avatar: teamAvatar("#f4ece2", "#8a4b16", "#ffffff"),
                    tools: ["gmail"],
                  },
                  {
                    role: "Operator",
                    avatar: teamAvatar("#e7f2ea", "#0f7b5a", "#ffffff"),
                    tools: ["slack", "hubspot"],
                  },
                ]}
                className="mx-auto max-w-xl"
                label="A prompt builds a team of a researcher, a writer and an operator"
              />
            </div>
          </div>
        </section>

        <section id="integrations" className="border-b border-border/80 bg-card/60">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:py-20">
            <div>
              <div className="flex items-center gap-2 text-[0.7rem] font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-brand-ink" />
                Integrations
              </div>
              <TextReveal
                as="h2"
                text="Connect the tools. Keep the context."
                stagger={45}
                className="mt-3 max-w-md text-3xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance sm:text-[2.45rem]"
              />
              <p className="mt-4 max-w-md text-[0.9rem] leading-7 text-muted-foreground">
                Connect Gmail, Slack, Notion, GitHub, Linear, Stripe and more once. Each agent
                gets only the tools you give it, and every data-changing action still waits for
                your approval.
              </p>

              <div className="mt-7 flex gap-8">
                <div>
                  <NumberTicker
                    value={7}
                    className="text-2xl font-semibold tracking-[-0.04em]"
                  />
                  <p className="mt-1 text-[0.66rem] text-muted-foreground">built-in tools</p>
                </div>
                <div>
                  <NumberTicker
                    value={integrationStrip.length}
                    className="text-2xl font-semibold tracking-[-0.04em]"
                  />
                  <p className="mt-1 text-[0.66rem] text-muted-foreground">featured apps</p>
                </div>
              </div>

              <div className="mt-8 border-t border-border/70 pt-5">
                <LogoMarquee
                  logos={integrationLogos}
                  labels="beside"
                  speed={30}
                  gap={30}
                  label="Apps available to agents"
                  className="max-w-lg"
                />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <IntegrationBeam
                left={beamTools.slice(0, 3)}
                right={beamTools.slice(3, 6)}
                center={{ name: "Alcatraz", logo: <LogoMark className="size-9" /> }}
                className="min-h-[360px]"
                label="Alcatraz connected to Gmail, Slack, Notion, GitHub, Linear and Stripe"
              />
              <p className="mt-3 text-center text-[0.66rem] text-muted-foreground">
                One workspace. Every tool in reach.
              </p>
            </div>
          </div>
        </section>

        <section id="platform" className="border-b border-border/80">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="font-mono text-[0.66rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                  The platform
                </p>
                <TextReveal
                  as="h2"
                  text="Everything agent work needs. Nothing it doesn’t."
                  stagger={34}
                  className="mt-4 max-w-md text-3xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance sm:text-[2.7rem]"
                />
              </div>
              <p className="max-w-xl text-[0.92rem] leading-7 text-muted-foreground lg:justify-self-end">
                A chat, a browser, a scheduler, approvals and 20 connected apps. One operating
                surface, designed to keep the work legible when it gets complicated.
              </p>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <article className="premium-panel relative overflow-hidden rounded-2xl p-5 md:row-span-2">
                <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
                  <Workflow className="size-4" />
                </div>
                <h3 className="mt-5 text-[1.02rem] font-semibold tracking-tight">
                  Every run leaves a trail
                </h3>
                <p className="mt-2 text-[0.82rem] leading-6 text-muted-foreground">
                  Tool calls, browser actions, sources and results are recorded as the agent
                  works. Reopen any run and see exactly what happened.
                </p>

                <div className="mt-6 rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between border-b border-border/70 pb-2">
                    <span className="font-mono text-[0.6rem] text-muted-foreground">
                      run_8f2c · trace
                    </span>
                    <span className="text-[0.58rem] font-semibold text-emerald-700">
                      OK
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {[
                      ["Browser", "Opened pricing page", "1.4s"],
                      ["Extract", "Pulled plan limits", "0.8s"],
                      ["Notion", "Updated launch brief", "2.1s"],
                      ["Draft", "Prepared summary", "0.6s"],
                    ].map(([tool, action, time], index) => (
                      <div key={tool} className="flex items-center gap-2 text-[0.66rem]">
                        <span className="grid size-4 shrink-0 place-items-center rounded-full border border-border bg-card font-mono text-[0.5rem] text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="w-12 shrink-0 font-medium">{tool}</span>
                        <span className="truncate text-muted-foreground">{action}</span>
                        <span className="ml-auto font-mono text-[0.58rem] text-muted-foreground/70">
                          {time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="premium-panel rounded-2xl p-5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
                  <ShieldCheck className="size-4" />
                </div>
                <h3 className="mt-5 text-[1rem] font-semibold tracking-tight">
                  Approval before impact
                </h3>
                <p className="mt-2 text-[0.8rem] leading-6 text-muted-foreground">
                  Read-only work moves fast. Anything that sends, edits or deletes waits for a
                  single-use approval bound to you and the agent.
                </p>
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-[0.66rem]">
                  <Zap className="size-3.5 text-amber-600" />
                  <span className="font-medium">Needs approval</span>
                  <span className="ml-auto text-muted-foreground">expires in 12m</span>
                </div>
              </article>

              <article className="premium-panel rounded-2xl p-5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700">
                  <Globe2 className="size-4" />
                </div>
                <h3 className="mt-5 text-[1rem] font-semibold tracking-tight">
                  A browser that stays signed in
                </h3>
                <p className="mt-2 text-[0.8rem] leading-6 text-muted-foreground">
                  Cloud sessions reuse a private browser profile, so the agent can pick up where
                  it left off — and you can watch the page live.
                </p>
              </article>

              <article className="premium-panel rounded-2xl p-5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700">
                  <CalendarClock className="size-4" />
                </div>
                <h3 className="mt-5 text-[1rem] font-semibold tracking-tight">
                  Schedules that understand time
                </h3>
                <p className="mt-2 text-[0.8rem] leading-6 text-muted-foreground">
                  Hourly, daily or weekly runs in the time zone you choose. Pause the workspace
                  without creating a backlog of stale work.
                </p>
              </article>

              <article className="premium-panel rounded-2xl p-5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                  <Layers3 className="size-4" />
                </div>
                <h3 className="mt-5 text-[1rem] font-semibold tracking-tight">
                  20 apps, one tool router
                </h3>
                <p className="mt-2 text-[0.8rem] leading-6 text-muted-foreground">
                  Gmail, Slack, Notion, GitHub, Linear, Stripe and more. Connect once, then give
                  each agent exactly the tools it needs.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-border/80 bg-card/50">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-mono text-[0.66rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                  How it works
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.5rem]">
                  Delegate the work. Keep the judgment.
                </h2>
              </div>
              <p className="max-w-sm text-[0.84rem] leading-6 text-muted-foreground">
                No orchestration diagram to maintain. Start with one agent and one real task.
              </p>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1.22fr_0.78fr] lg:items-start">
              <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
                {loop.map((item) => (
                  <div key={item.step} className="bg-card p-6 sm:p-7">
                    <span className="font-mono text-[0.66rem] font-medium text-brand-ink">
                      {item.step}
                    </span>
                    <h3 className="mt-5 text-[1rem] font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-2 text-[0.82rem] leading-6 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>

              <ProgressTracker
                title="From first run to a habit"
                autoPlay
                interval={1900}
                steps={[
                  { id: "workspace", label: "Create a workspace", done: true },
                  { id: "model", label: "Choose a model", done: true },
                  { id: "app", label: "Connect the first app" },
                  { id: "schedule", label: "Schedule the recurring run" },
                ]}
                className="max-w-none"
              />
            </div>
          </div>
        </section>

        <section id="security" className="border-b border-border/80">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="font-mono text-[0.66rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                Built for real access
              </p>
              <h2 className="mt-4 max-w-lg text-3xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance sm:text-[2.6rem]">
                Agents are powerful when the guardrails are real.
              </h2>
              <p className="mt-4 max-w-lg text-[0.9rem] leading-7 text-muted-foreground">
                Sessions are http-only, model keys are encrypted at rest, app actions are
                classified before they run, and approval tokens are single-use. Access stays
                yours.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  icon: ShieldCheck,
                  title: "Approval-gated actions",
                  body: "Data-changing app calls wait for a signed, one-time approval.",
                },
                {
                  icon: Bot,
                  title: "Scoped agents",
                  body: "Each agent has its own model, tools, MCP servers and instructions.",
                },
                {
                  icon: Globe2,
                  title: "Private browser context",
                  body: "Cloud browser logins persist per workspace and can be reset.",
                },
                {
                  icon: Zap,
                  title: "No hidden runs",
                  body: "Every scheduled and manual run writes a result you can inspect.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-4">
                  <Icon className="size-4 text-brand-ink" />
                  <p className="mt-3 text-[0.8rem] font-semibold">{title}</p>
                  <p className="mt-1 text-[0.72rem] leading-5 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-24">
          <div className="ink-panel relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl px-6 py-14 sm:px-12">
            <div className="premium-grid pointer-events-none absolute inset-0 opacity-[0.13]" />
            <div className="pointer-events-none absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-brand-soft/25 blur-3xl" />
            <div className="relative max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[0.66rem] font-medium text-white/70">
                <span className="size-1.5 rounded-full bg-[#82bcff]" />
                Ready when you are
              </span>
              <h2 className="mt-5 text-3xl leading-[1.04] font-semibold tracking-[-0.045em] text-balance text-white sm:text-[2.9rem]">
                Put your first agent to work.
              </h2>
              <p className="mt-4 max-w-lg text-[0.92rem] leading-7 text-white/60">
                Create a workspace, connect a model and give it a real task. You can watch every
                step from the first message.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-up"
                  className={buttonVariants({
                    className:
                      "h-11 rounded-xl bg-white px-5 text-[0.9rem] font-semibold text-[#111113] hover:bg-white/90",
                  })}
                >
                  Create free account
                  <ArrowUpRight className="size-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className={buttonVariants({
                    variant: "outline",
                    className:
                      "h-11 rounded-xl border-white/20 bg-transparent px-5 text-[0.9rem] font-semibold text-white hover:bg-white/10 hover:text-white",
                  })}
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/80 bg-card/50">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xs text-[0.75rem] leading-6 text-muted-foreground">
              The control room for AI agents that browse, use your apps and report back.
            </p>
          </div>
          {[
            {
              title: "Product",
              links: [
                ["Platform", "#platform"],
                ["How it works", "#how-it-works"],
                ["Integrations", "#integrations"],
                ["Security", "#security"],
                ["Pricing", "/pricing"],
              ],
            },
            {
              title: "Account",
              links: [
                ["Sign in", "/sign-in"],
                ["Create account", "/sign-up"],
                ["Dashboard", "/dashboard"],
              ],
            },
          ].map((column) => (
            <div key={column.title}>
              <p className="text-[0.68rem] font-semibold tracking-[0.1em] text-foreground uppercase">
                {column.title}
              </p>
              <div className="mt-3 space-y-2">
                {column.links.map(([label, href]) => (
                  <Link
                    key={label}
                    href={href}
                    className="block text-[0.75rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="text-[0.68rem] font-semibold tracking-[0.1em] text-foreground uppercase">
              Built with
            </p>
            <div className="mt-3 space-y-2 text-[0.75rem] text-muted-foreground">
              <p>Next.js 16</p>
              <p>CloudHike Auth + Postgres</p>
              <p>Browserbase + Composio</p>
            </div>
          </div>
        </div>
        <div className="border-t border-border/70">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-4 text-[0.68rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p>© {new Date().getFullYear()} Alcatraz. All rights reserved.</p>
            <p className="font-mono">Made for people who ship agents.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
