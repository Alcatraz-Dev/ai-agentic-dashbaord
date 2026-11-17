"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, MailCheck } from "lucide-react";

import { signInAction, signUpAction, type AuthFormState } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const initialState: AuthFormState = { error: null, notice: null };

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.8 2.9c2.2-2 3.6-5 3.6-8.6Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5l-3.9 3C3.4 21.3 7.4 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4a7.4 7.4 0 0 1 0-4.8l-3.9-3A12 12 0 0 0 0 12c0 1.9.5 3.8 1.4 5.4l3.9-3Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c2.2 0 3.7.9 4.6 1.7l3.3-3.2C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l3.9 3C6.2 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}

const socialClass =
  "h-11 w-full gap-2.5 rounded-xl border-border bg-card text-[0.88rem] font-medium shadow-sm transition hover:border-foreground/20 hover:bg-muted";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
  socialUrls: { google: string; github: string };
};

export function AuthForm({ mode, socialUrls }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const action = isSignUp ? signUpAction : signInAction;
  const [state, formAction, pending] = React.useActionState(action, initialState);

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3">
        <a href={socialUrls.google} className={buttonVariants({ variant: "outline", className: socialClass })}>
          <GoogleIcon />
          Google
        </a>
        <a href={socialUrls.github} className={buttonVariants({ variant: "outline", className: socialClass })}>
          <GitHubIcon />
          GitHub
        </a>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
        <span className="text-[0.7rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          or use email
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
      </div>

      <form action={formAction} className="space-y-4">
        {isSignUp && (
          <TextField
            id="name"
            label="Name"
            name="name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            size="lg"
            required
          />
        )}

        <TextField
          id="email"
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          size="lg"
          required
        />

        <TextField
          id="password"
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder={isSignUp ? "At least 8 characters" : "Your password"}
          minLength={isSignUp ? 8 : undefined}
          size="lg"
          required
        />

        {state.error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-destructive/8 px-3 py-2.5 text-[0.8rem] text-destructive ring-1 ring-destructive/15"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            {state.error}
          </p>
        )}

        {state.notice && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-[0.8rem] text-brand-ink ring-1 ring-brand-border"
          >
            <MailCheck className="mt-px size-4 shrink-0" />
            {state.notice}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-xl bg-foreground text-[0.88rem] font-semibold text-background shadow-sm hover:bg-foreground/90"
        >
          {pending
            ? isSignUp
              ? "Creating account…"
              : "Signing in…"
            : isSignUp
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-[0.8rem] text-muted-foreground">
        {isSignUp ? "Already have an account?" : "New here?"}{" "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-semibold text-brand-ink underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
