import {
  AGENT_COLORS,
  DEFAULT_AGENT_AVATAR,
  DEFAULT_AGENT_COLOR,
  getAgentColor,
  isAgentAvatar,
  isAgentColor,
  normalizeAgentAvatar,
  type AgentColorOption,
} from "@/lib/agent-options";

/**
 * Client-safe catalogs for the Create Dashboard flow.
 *
 * Only small, serialisable keys are stored in Postgres (`icon`, `color`,
 * `template`); the portraits, colours and templates live here so the wizard and
 * the sidebar render the same record. Dashboards share the agents' clay
 * portrait system, so a workspace uses one identity language.
 */

export type DashboardColorOption = AgentColorOption;

/** The same twelve clay colours the agents use. */
export const DASHBOARD_COLORS: DashboardColorOption[] = AGENT_COLORS;

export const DEFAULT_DASHBOARD_COLOR = DEFAULT_AGENT_COLOR;

export function isDashboardColor(value: string): boolean {
  return isAgentColor(value);
}

export function getDashboardColor(value: string): DashboardColorOption {
  return getAgentColor(value);
}

/**
 * Dashboard portraits use `shape:face`, like agents. Rows created before the
 * clay portraits stored a Lucide icon key; each maps onto a portrait so no
 * migration is needed and the sidebar still shows a distinct tile.
 */
const LEGACY_DASHBOARD_ICONS: Record<string, string> = {
  "layout-dashboard": "squircle:attentive",
  sparkles: "hexagon:excited",
  rocket: "droplet:proud",
  briefcase: "capsule:neutral",
  "code-2": "squircle:confused",
  "trending-up": "triangle:excited",
  wallet: "circle:proud",
  palette: "pebble:happy",
  "calendar-days": "capsule:sleepy",
  "brain-circuit": "hexagon:curious",
};

export const DEFAULT_DASHBOARD_ICON = "squircle:attentive";

export function isDashboardPortrait(value: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(LEGACY_DASHBOARD_ICONS, value) || isAgentAvatar(value)
  );
}

/** The canonical `shape:face` portrait to render for a stored icon value. */
export function getDashboardPortrait(value: string): string {
  const legacy = LEGACY_DASHBOARD_ICONS[value];
  return normalizeAgentAvatar(legacy ?? value ?? DEFAULT_AGENT_AVATAR);
}

export type DashboardTemplateOption = {
  id: string;
  name: string;
  description: string;
};

export const DASHBOARD_TEMPLATES: DashboardTemplateOption[] = [
  {
    id: "blank",
    name: "Blank",
    description: "An empty canvas. Add your own widgets and arrange them freely.",
  },
  {
    id: "creator",
    name: "Creator",
    description: "Audience, reach and content performance for people who publish.",
  },
  {
    id: "daily",
    name: "Daily",
    description: "A focused today view — tasks, habits and a running timeline.",
  },
  {
    id: "business",
    name: "Business",
    description: "Revenue, pipeline and team KPIs in one executive summary.",
  },
  {
    id: "developer",
    name: "Developer",
    description: "Deploys, error rates and agent runs for engineering teams.",
  },
  {
    id: "research",
    name: "Research",
    description: "Sources, experiments and notes for deep, ongoing investigation.",
  },
];

export const DEFAULT_DASHBOARD_TEMPLATE = "blank";

export function isDashboardTemplate(value: string): boolean {
  return DASHBOARD_TEMPLATES.some((option) => option.id === value);
}

export function getDashboardTemplate(value: string): DashboardTemplateOption {
  return DASHBOARD_TEMPLATES.find((option) => option.id === value) ?? DASHBOARD_TEMPLATES[0];
}

export const DASHBOARD_NAME_MAX_LENGTH = 48;
