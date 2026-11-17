import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, Sparkles } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { Wordmark } from "@/components/brand/logo";
import { CreateDashboardWizard } from "@/components/dashboard/create-dashboard-wizard";
import { Button } from "@/components/ui/button";
import { GridBackground } from "@/components/ui/grid-background";
import { TextReveal } from "@/components/ui/text-reveal";
import { listDashboardsForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create dashboard" };

export default async function NewDashboardPage() {
  const user = await requireUser();

  // Owning a dashboard no longer blocks this page: a workspace can hold as many
  // as it needs, and each one is created here.
  const dashboards = await listDashboardsForUser(user.id);
  const isFirst = dashboards.length === 0;

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-45 [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]">
          <GridBackground size={44} speed={28} fade={78} className="h-full" />
        </div>
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,var(--brand-soft),transparent)]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/">
            <Wordmark />
          </Link>

          <div className="flex items-center gap-2">
            {isFirst ? null : (
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/dashboard" />}
                className="h-9 rounded-xl text-[0.82rem] font-medium"
              >
                Cancel
              </Button>
            )}
            <form action={signOutAction}>
              <Button
                variant="outline"
                type="submit"
                className="h-9 gap-2 rounded-xl border-border bg-card text-[0.82rem] font-medium hover:bg-muted"
              >
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 text-center">
          <span className="aui-chip py-1 font-mono text-[0.62rem] font-medium tracking-[0.1em] uppercase">
            <Sparkles className="size-3 text-brand-ink" />
            {isFirst ? "Getting started" : "New dashboard"}
          </span>
          <TextReveal
            as="h1"
            text={isFirst ? "Create your dashboard" : "Create another dashboard"}
            by="word"
            stagger={60}
            className="mt-4 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"
          />
          <p className="aui-subtitle mx-auto mt-2 max-w-md">
            {isFirst
              ? "This is your home for agents, runs and traces. Name it, make it yours, and pick a starting layout."
              : "It sits beside your other dashboards and keeps its own widgets and background. You can switch between them from the sidebar."}
          </p>
        </div>

        <div className="premium-panel rounded-2xl p-6 sm:p-8">
          <CreateDashboardWizard />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Saved to your CloudHike Postgres database · You can change any of this later
          {isFirst ? "" : " · Non-blank templates add a getting-started checklist when you have an agent"}
        </p>
      </main>
    </div>
  );
}
