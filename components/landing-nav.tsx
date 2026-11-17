"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X, Sparkles, Shield, Workflow, Layers, CreditCard } from "lucide-react";

import { Wordmark } from "@/components/brand/logo";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NavItem = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

const DEFAULT_LINKS: NavItem[] = [
  { label: "Platform", href: "/#platform", icon: <Workflow className="size-4" /> },
  { label: "How it works", href: "/#how-it-works", icon: <Sparkles className="size-4" /> },
  { label: "Integrations", href: "/#integrations", icon: <Layers className="size-4" /> },
  { label: "Security", href: "/#security", icon: <Shield className="size-4" /> },
  { label: "Pricing", href: "/pricing", icon: <CreditCard className="size-4" /> },
];

export function LandingNav({
  currentPath = "/",
  links = DEFAULT_LINKS,
}: {
  currentPath?: string;
  links?: NavItem[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-8">
        <Link
          href="/"
          className="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          aria-label="Alcatraz home"
          onClick={() => setMobileOpen(false)}
        >
          <Wordmark />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const isCurrent =
              currentPath === link.href ||
              (link.href === "/pricing" && currentPath === "/pricing");
            return (
              <Link
                key={link.label}
                href={link.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[0.83rem] font-medium transition-colors hover:bg-muted hover:text-foreground",
                  isCurrent ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeMenu />
          <Link
            href="/sign-in"
            className="hidden xs:inline-flex rounded-lg px-2.5 sm:px-3 py-1.5 text-[0.83rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={buttonVariants({
              className:
                "h-9 rounded-xl bg-foreground px-3 sm:px-3.5 text-[0.8rem] sm:text-[0.83rem] font-semibold text-background shadow-sm hover:bg-foreground/90 whitespace-nowrap",
            })}
          >
            <span>Get started</span>
            <ArrowRight className="size-3.5" />
          </Link>

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="grid size-9 place-items-center rounded-xl border border-border/80 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-50 flex flex-col bg-background/95 p-5 backdrop-blur-2xl md:hidden animate-in fade-in slide-in-from-top-2 duration-200 overflow-y-auto">
          <div className="flex flex-col gap-1.5 border-b border-border/70 pb-5">
            <span className="px-3 pb-1 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Navigation
            </span>
            {links.map((link) => {
              const isCurrent =
                currentPath === link.href ||
                (link.href === "/pricing" && currentPath === "/pricing");
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-base font-medium transition-colors",
                    isCurrent
                      ? "bg-brand-soft text-brand-ink ring-1 ring-brand-border"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="text-muted-foreground">{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-5 space-y-3">
            <span className="px-3 pb-1 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Account
            </span>
            <div className="flex flex-col gap-2">
              <Link
                href="/sign-in"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 items-center justify-center rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background shadow-sm hover:bg-foreground/90"
              >
                Create free account
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="mt-auto border-t border-border/70 pt-4 text-center text-xs text-muted-foreground">
            Alcatraz &middot; Agentic Control Room
          </div>
        </div>
      )}
    </header>
  );
}
