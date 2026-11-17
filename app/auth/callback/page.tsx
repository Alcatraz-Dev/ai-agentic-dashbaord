"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

import { Wordmark } from "@/components/brand/logo";

type CallbackPayload = {
  token: string | null;
  provider: string | null;
  error: string | null;
};

/** Reads the sign-in result from the URL (CloudHike uses the fragment). */
function readPayload(): CallbackPayload {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);

  return {
    // Fragment first; the query fallback keeps us working if the redirect
    // shape ever changes.
    token: hash.get("token") ?? search.get("token"),
    provider: search.get("provider"),
    error: hash.get("error") ?? search.get("error"),
  };
}

/** Drops the token (and any error) from the address bar without adding history. */
function stripSecrets() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("token");
  url.searchParams.delete("error");
  window.history.replaceState(null, "", url.pathname + url.search);
}

/**
 * CloudHike's social sign-in returns the browser here with the token in the
 * URL fragment (#token=...). Fragments never reach the server, so this page
 * reads it client-side and hands it to our session route, which verifies it
 * and sets an http-only cookie.
 *
 * The payload is read once and kept in a ref: clearing the fragment and then
 * re-running the effect (React's dev-mode double mount) would otherwise look
 * like a cancelled sign-in.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const payloadRef = React.useRef<CallbackPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!payloadRef.current) {
      payloadRef.current = readPayload();
      // Clean the token out of history as soon as it is captured.
      if (payloadRef.current.token) stripSecrets();
    }

    const { token, provider, error: providerError } = payloadRef.current;

    if (!token) {
      setError(
        providerError ??
          "Sign-in was cancelled or could not be completed. Start again from the sign-in page.",
      );
      return;
    }

    let cancelled = false;

    fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, provider }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? "We could not verify that sign-in.");
        }
        if (!cancelled) {
          router.replace("/dashboard");
          router.refresh();
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Something went wrong.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-5">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,var(--brand-soft),transparent)]" />
        <div className="bg-blueprint absolute inset-0 opacity-30 [mask-image:radial-gradient(60%_50%_at_50%_40%,black,transparent)]" />
      </div>

      <Wordmark className="mb-8" />

      <div className="w-full max-w-sm rounded-3xl border border-brand-border bg-card/85 p-8 text-center brand-glow ring-1 ring-border backdrop-blur-sm">
        {error ? (
          <div className="space-y-4">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/15">
              <ShieldAlert className="size-5" />
            </span>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold tracking-tight">Sign-in failed</h1>
              <p className="text-[0.85rem] text-muted-foreground">{error}</p>
            </div>
            <Link
              href="/sign-in"
              className="brand-gradient inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold text-brand-on shadow-[0_12px_30px_-12px_var(--brand-from)] hover:brightness-110"
            >
              Try again
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-ink ring-1 ring-brand-border">
              <Loader2 className="size-5 animate-spin" />
            </span>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold tracking-tight">Signing you in…</h1>
              <p className="text-[0.85rem] text-muted-foreground">
                Holding the door — this takes a second.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
