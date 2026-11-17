import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { socialSignInUrl } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

function callbackUrl(provider: "google" | "github") {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("provider", provider);
  return url.toString();
}

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="space-y-7">
      <div className="space-y-2.5">
        <span className="aui-chip py-1 text-[0.64rem] font-semibold tracking-[0.1em] uppercase">
          <Sparkles className="size-3 text-brand-ink" />
          Welcome back
        </span>
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight">
          Sign in to Alcatraz
        </h1>
        <p className="text-[0.85rem] text-muted-foreground">
          Pick up where you left off — your agents kept working.
        </p>
      </div>

      <AuthForm
        mode="sign-in"
        socialUrls={{
          google: socialSignInUrl("google", callbackUrl("google")),
          github: socialSignInUrl("github", callbackUrl("github")),
        }}
      />
    </div>
  );
}
