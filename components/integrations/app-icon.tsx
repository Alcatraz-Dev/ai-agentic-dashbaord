"use client";

import { useState } from "react";
import {
  Box,
  CalendarDays,
  CircleDot,
  Cloud,
  CreditCard,
  FileText,
  GitBranch,
  Github,
  Grid2x2,
  HardDrive,
  Hash,
  Inbox,
  Layers,
  Magnet,
  Mail,
  MessageCircle,
  PenTool,
  SquareKanban,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { IntegrationDefinition, IntegrationIcon } from "@/lib/integrations/catalog";
import { cn } from "@/lib/utils";

/**
 * The app's real brand mark, served from Composio's logo CDN by toolkit slug.
 * If the CDN can't be reached the tinted glyph below takes over, so a card is
 * never left with a hole where the logo should be.
 */
const LOGO_BASE = "https://logos.composio.dev/api";

const ICONS: Record<IntegrationIcon, LucideIcon> = {
  generic: Box,
  mail: Mail,
  calendar: CalendarDays,
  drive: HardDrive,
  sheets: Table2,
  slack: Hash,
  notion: FileText,
  github: Github,
  linear: GitBranch,
  jira: Layers,
  asana: CircleDot,
  trello: SquareKanban,
  discord: MessageCircle,
  hubspot: Magnet,
  salesforce: Cloud,
  stripe: CreditCard,
  outlook: Inbox,
  teams: Users,
  airtable: Grid2x2,
  figma: PenTool,
  dropbox: Box,
  linkedin: Users,
  reddit: MessageCircle,
  instagram: Grid2x2,
  facebook: Users,
  youtube: Layers,
  pinterest: CircleDot,
};

/**
 * Marks that Composio's CDN serves as a poor traced outline. Inlined from the
 * official brand asset instead, so the tile stays crisp at small sizes.
 */
function FigmaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 38 57" aria-hidden className={className}>
      <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0Z" />
      <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0Z" />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19Z" />
      <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5Z" />
      <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5Z" />
    </svg>
  );
}

const SIZES = {
  sm: {
    box: "size-8 rounded-[0.6rem]",
    icon: "size-4",
    logo: "size-[68%]",
    mark: "h-[62%] w-auto",
  },
  md: { box: "size-10 rounded-xl", icon: "size-[1.15rem]", logo: "size-[70%]", mark: "h-[64%] w-auto" },
  lg: { box: "size-12 rounded-xl", icon: "size-5", logo: "size-[72%]", mark: "h-[66%] w-auto" },
} as const;

export function AppIcon({
  app,
  size = "md",
  className,
}: {
  app: Pick<IntegrationDefinition, "slug" | "icon" | "color" | "name" | "logo">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = ICONS[app.icon] ?? Box;
  const dimensions = SIZES[size];

  if (failed) {
    return (
      <span
        aria-hidden
        title={app.name}
        className={cn("grid shrink-0 place-items-center", dimensions.box, className)}
        style={{
          backgroundColor: `${app.color}14`,
          color: app.color,
          boxShadow: `inset 0 0 0 1px ${app.color}26`,
        }}
      >
        <Icon className={dimensions.icon} strokeWidth={1.9} />
      </span>
    );
  }

  return (
    <span
      title={app.name}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden ring-1 ring-black/[0.08]",
        "shadow-[0_1px_2px_rgba(16,24,40,0.08)]",
        dimensions.box,
        className,
      )}
      // Always a white plate: multi-colour marks (and the black GitHub and
      // Notion glyphs) need light behind them in both themes.
      style={{ backgroundColor: "#fff" }}
    >
      {app.slug === "figma" ? (
        <FigmaMark className={dimensions.mark} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a plain img keeps the external logo out of the Next image pipeline
        <img
          src={app.logo || `${LOGO_BASE}/${app.slug}`}
          alt=""
          aria-hidden
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className={cn("object-contain select-none", dimensions.logo)}
        />
      )}
    </span>
  );
}
