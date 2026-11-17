"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarClock, PauseCircle } from "lucide-react";

import {
  sendScheduleTestEmailAction,
  setScheduleAlertsAction,
  setScheduleDigestAction,
  setSchedulesPausedAction,
} from "@/app/actions/schedules";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

function Row({
  icon,
  title,
  description,
  checked,
  disabled,
  saving,
  onChange,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.82rem] font-medium">{title}</p>
        <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">{description}</p>
        {note}
      </div>
      <Switch
        checked={checked}
        disabled={disabled || saving}
        onCheckedChange={onChange}
        aria-label={title}
        className="mt-1 shrink-0"
      />
    </div>
  );
}

/**
 * Workspace-level schedule switches: pause everything the cron would run, and
 * decide whether failures also arrive by email.
 */
export function SchedulePreferences({
  paused,
  emailAlerts,
  digest,
  emailConfigured,
}: {
  paused: boolean;
  emailAlerts: boolean;
  digest: boolean;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [isPaused, setIsPaused] = useState(paused);
  const [alerts, setAlerts] = useState(emailAlerts);
  const [dailyDigest, setDailyDigest] = useState(digest);
  const [error, setError] = useState<string | null>(null);
  const [testNotice, setTestNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function togglePaused(next: boolean) {
    setIsPaused(next);
    setError(null);

    startTransition(async () => {
      const result = await setSchedulesPausedAction(next);
      if (!result.ok) {
        setIsPaused(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleDigest(next: boolean) {
    setDailyDigest(next);
    setError(null);

    startTransition(async () => {
      const result = await setScheduleDigestAction(next);
      if (!result.ok) {
        setDailyDigest(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function sendTestEmail() {
    setTestNotice(null);
    setError(null);

    startTransition(async () => {
      const result = await sendScheduleTestEmailAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTestNotice("Test email sent — check your inbox.");
    });
  }

  function toggleAlerts(next: boolean) {
    setAlerts(next);
    setError(null);

    startTransition(async () => {
      const result = await setScheduleAlertsAction(next);
      if (!result.ok) {
        setAlerts(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="premium-panel mt-6 overflow-hidden rounded-2xl">
      <div className="border-b border-border/60 px-5 py-3.5">
        <h2 className="text-[0.9rem] font-semibold">Schedule delivery</h2>
        <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
          Applies to every agent in this workspace.
        </p>
      </div>

      <div className="divide-y divide-border/60">
        <Row
          icon={<PauseCircle className="size-3.5" />}
          title="Pause all scheduled runs"
          description="Nothing fires on its own while paused. Run now still works when you need a result."
          checked={isPaused}
          saving={pending}
          onChange={togglePaused}
          note={
            isPaused ? (
              <p className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[0.66rem] font-medium text-amber-700">
                Paused — due runs will not start
              </p>
            ) : null
          }
        />

        <Row
          icon={<BellRing className="size-3.5" />}
          title="Email me when a scheduled run fails"
          description="A short email with the error and a link to the run history. Failures always stay in the bell."
          checked={alerts}
          saving={pending}
          onChange={toggleAlerts}
          note={
            !emailConfigured ? (
              <p className="mt-1 text-[0.66rem] text-amber-700">
                Email is not configured on this server yet (needs{" "}
                <code className="rounded bg-muted px-1">RESEND_API_KEY</code>), so alerts stay in-app.
              </p>
            ) : alerts ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[0.66rem]"
                  disabled={pending}
                  onClick={sendTestEmail}
                >
                  Send test email
                </Button>
                {testNotice && (
                  <span className="text-[0.66rem] text-emerald-700">{testNotice}</span>
                )}
              </div>
            ) : null
          }
        />

        <Row
          icon={<CalendarClock className="size-3.5" />}
          title="Send a daily digest"
          description="One email a day tallying the last 24 hours of scheduled runs, by agent. Empty days are skipped."
          checked={dailyDigest}
          saving={pending}
          onChange={toggleDigest}
          note={
            !emailConfigured ? (
              <p className="mt-1 text-[0.66rem] text-amber-700">
                Needs the same email configuration as alerts.
              </p>
            ) : null
          }
        />
      </div>

      {error && (
        <p role="alert" className="border-t border-border/60 px-5 py-2 text-[0.72rem] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
