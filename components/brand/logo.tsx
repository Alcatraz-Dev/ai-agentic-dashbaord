import { cn } from "@/lib/utils";

/** Ink tile with an electric bolt – the mark used across marketing and the app. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[0.65rem] bg-[#111113] text-[#82bcff] shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_8px_20px_-12px_rgb(0_0_0/0.6)] ring-1 ring-black/10",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[1.15rem]">
        <path
          d="M13 2 4.5 13.5h5L10 22l9.5-11.5h-5L13 2Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[0.95rem] font-semibold tracking-[-0.02em]">
        Alcatraz
        <span className="text-brand-ink">.</span>
      </span>
    </span>
  );
}
