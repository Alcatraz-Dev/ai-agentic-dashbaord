import { MODEL_LOGOS } from "@/lib/model-logos";
import type { AgentModelLogo } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

/**
 * Provider glyph used by the model pickers. Real brand marks are stored as
 * static SVG data in `lib/model-logos.ts` and tinted with each provider's brand
 * colour; anything without a mark (custom endpoints, smaller labs) gets the
 * neutral cube below.
 */
export function ModelLogo({
  logo,
  className,
}: {
  logo: AgentModelLogo;
  className?: string;
}) {
  const mark = MODEL_LOGOS[logo];

  if (mark) {
    return (
      <svg
        viewBox={mark.viewBox}
        aria-hidden="true"
        className={cn("size-3.5", className)}
        fill="currentColor"
        style={{ color: mark.color }}
        dangerouslySetInnerHTML={{ __html: mark.body }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-3.5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2" />
      <path d="M12 3.4v3.8M12 16.8v3.8M3.4 12h3.8M16.8 12h3.8" />
    </svg>
  );
}
