import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Rocket } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { socialSignInUrl } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create an account" };

function callbackUrl(provider: "google" | "github") {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("provider", provider);
  return url.toString();
}

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="space-y-7">
      <div className="space-y-2.5">
        <span className="aui-chip py-1 text-[0.64rem] font-semibold tracking-[0.1em] uppercase">
          <Rocket className="size-3 text-brand-ink" />
          Get started
        </span>
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-[0.85rem] text-muted-foreground">
          Free while in beta — no credit card, no setup call.
        </p>
      </div>

      <AuthForm
        mode="sign-up"
        socialUrls={{
          google: socialSignInUrl("google", callbackUrl("google")),
          github: socialSignInUrl("github", callbackUrl("github")),
        }}
      />
    </div>
  );
}
