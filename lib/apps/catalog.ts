/**
 * The external apps this workspace offers, in the order the Apps page lists
 * them. Client-safe: the Apps page, the chat's connect card and the agent's
 * tools all read the same catalog, so a slug can never drift between them.
 *
 * `slug` is the Composio toolkit slug. Names, icons and colours live here
 * because the catalog must render before any API call — Composio's own metadata
 * is merged in only when it is available.
 */

export type IntegrationIcon =
  | "generic"
  | "mail"
  | "calendar"
  | "drive"
  | "sheets"
  | "slack"
  | "notion"
  | "github"
  | "linear"
  | "jira"
  | "asana"
  | "trello"
  | "discord"
  | "hubspot"
  | "salesforce"
  | "stripe"
  | "outlook"
  | "teams"
  | "airtable"
  | "figma"
  | "dropbox"
  | "linkedin"
  | "reddit"
  | "instagram"
  | "facebook"
  | "youtube"
  | "pinterest";

export type IntegrationCategory =
  | "Email"
  | "Calendar"
  | "Files"
  | "Chat"
  | "Engineering"
  | "Project management"
  | "CRM"
  | "Finance"
  | "Design"
  | "Marketing"
  | "Social media"
  | "Support"
  | "Analytics"
  | "AI"
  | "Productivity"
  | "Commerce"
  | "HR"
  | "Other";

export type IntegrationDefinition = {
  /** Composio toolkit slug. */
  slug: string;
  name: string;
  category: IntegrationCategory;
  /** One line under the name on the Apps page. */
  description: string;
  /** What the agent can actually do once this is connected. */
  capabilities: string[];
  icon: IntegrationIcon;
  /** Brand colour, used for the icon tile only. */
  color: string;
  /** Composio's logo URL when the live catalog supplied one. */
  logo?: string | null;
};

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    slug: "gmail",
    name: "Gmail",
    category: "Email",
    description: "Read, search, label and draft mail in the owner's inbox.",
    capabilities: ["Search your inbox", "Summarise threads", "Draft replies"],
    icon: "mail",
    color: "#EA4335",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    category: "Calendar",
    description: "See what is on the calendar and create or move events.",
    capabilities: ["Find free time", "Create events", "List next meetings"],
    icon: "calendar",
    color: "#4285F4",
  },
  {
    slug: "googledrive",
    name: "Google Drive",
    category: "Files",
    description: "Find documents and read their contents without leaving chat.",
    capabilities: ["Search files", "Read documents", "Share links"],
    icon: "drive",
    color: "#1A73E8",
  },
  {
    slug: "googlesheets",
    name: "Google Sheets",
    category: "Files",
    description: "Read rows and append data to spreadsheets.",
    capabilities: ["Read ranges", "Append rows", "Create sheets"],
    icon: "sheets",
    color: "#34A853",
  },
  {
    slug: "slack",
    name: "Slack",
    category: "Chat",
    description: "Search channels and send messages as the owner.",
    capabilities: ["Search messages", "Send updates", "Summarise channels"],
    icon: "slack",
    color: "#611F69",
  },
  {
    slug: "notion",
    name: "Notion",
    category: "Files",
    description: "Search pages and databases, and write new notes.",
    capabilities: ["Search pages", "Read databases", "Create notes"],
    icon: "notion",
    color: "#111827",
  },
  {
    slug: "github",
    name: "GitHub",
    category: "Engineering",
    description: "Work with repositories, issues and pull requests.",
    capabilities: ["List issues", "Open issues", "Review pull requests"],
    icon: "github",
    color: "#24292F",
  },
  {
    slug: "linear",
    name: "Linear",
    category: "Engineering",
    description: "Track issues across teams and update their state.",
    capabilities: ["List issues", "Create issues", "Update status"],
    icon: "linear",
    color: "#5E6AD2",
  },
  {
    slug: "jira",
    name: "Jira",
    category: "Engineering",
    description: "Search tickets and move work forward in a project.",
    capabilities: ["Search issues", "Create tickets", "Change status"],
    icon: "jira",
    color: "#0052CC",
  },
  {
    slug: "asana",
    name: "Asana",
    category: "Project management",
    description: "Read projects and tasks, then create or assign work.",
    capabilities: ["List tasks", "Create tasks", "Update assignments"],
    icon: "asana",
    color: "#F06A6A",
  },
  {
    slug: "trello",
    name: "Trello",
    category: "Project management",
    description: "Move cards between lists and add new ones.",
    capabilities: ["Read boards", "Add cards", "Move cards"],
    icon: "trello",
    color: "#0079BF",
  },
  {
    slug: "discord",
    name: "Discord",
    category: "Chat",
    description: "Post to servers and read recent channel activity.",
    capabilities: ["Send messages", "Read channels", "List members"],
    icon: "discord",
    color: "#5865F2",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    category: "CRM",
    description: "Look up contacts and companies, and log activity.",
    capabilities: ["Find contacts", "Read deals", "Log notes"],
    icon: "hubspot",
    color: "#FF7A59",
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    category: "CRM",
    description: "Query records and update opportunities.",
    capabilities: ["Search records", "Read accounts", "Update fields"],
    icon: "salesforce",
    color: "#00A1E0",
  },
  {
    slug: "stripe",
    name: "Stripe",
    category: "Finance",
    description: "Read customers, invoices and payment status.",
    capabilities: ["List customers", "Check payments", "Read invoices"],
    icon: "stripe",
    color: "#635BFF",
  },
  {
    slug: "outlook",
    name: "Outlook",
    category: "Email",
    description: "Search mail and calendar in a Microsoft account.",
    capabilities: ["Search mail", "Read threads", "Check calendar"],
    icon: "outlook",
    color: "#0078D4",
  },
  {
    slug: "microsoft_teams",
    name: "Microsoft Teams",
    category: "Chat",
    description: "Follow channel conversations and post updates.",
    capabilities: ["Read channels", "Send messages", "List chats"],
    icon: "teams",
    color: "#6264A7",
  },
  {
    slug: "airtable",
    name: "Airtable",
    category: "Files",
    description: "Read and write records in a base.",
    capabilities: ["List records", "Create records", "Filter views"],
    icon: "airtable",
    color: "#E8A200",
  },
  {
    slug: "figma",
    name: "Figma",
    category: "Design",
    description: "Inspect files, comments and design metadata.",
    capabilities: ["List files", "Read comments", "Fetch components"],
    icon: "figma",
    color: "#F24E1E",
  },
  {
    slug: "dropbox",
    name: "Dropbox",
    category: "Files",
    description: "Find files and read shared documents.",
    capabilities: ["Search files", "Read documents", "Create links"],
    icon: "dropbox",
    color: "#0061FF",
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "Social media",
    description: "Read the feed and publish posts or comments as the owner.",
    capabilities: ["Read the feed", "Create posts", "Comment and message"],
    icon: "linkedin",
    color: "#0A66C2",
  },
  {
    slug: "reddit",
    name: "Reddit",
    category: "Social media",
    description: "Browse subreddits, read threads and submit posts.",
    capabilities: ["Read subreddits", "Search threads", "Submit posts"],
    icon: "reddit",
    color: "#FF4500",
  },
  {
    slug: "instagram",
    name: "Instagram",
    category: "Social media",
    description: "Read profile activity and publish photos or captions.",
    capabilities: ["Read posts", "Publish media", "Reply to comments"],
    icon: "instagram",
    color: "#E1306C",
  },
  {
    slug: "facebook",
    name: "Facebook",
    category: "Social media",
    description: "Read Pages and publish posts or comments.",
    capabilities: ["Read Pages", "Publish posts", "Reply to comments"],
    icon: "facebook",
    color: "#1877F2",
  },
  {
    slug: "youtube",
    name: "YouTube",
    category: "Social media",
    description: "Search videos and channels, and manage uploads.",
    capabilities: ["Search videos", "Read channels", "Upload videos"],
    icon: "youtube",
    color: "#FF0000",
  },
  {
    slug: "pinterest",
    name: "Pinterest",
    category: "Social media",
    description: "Browse boards and create pins.",
    capabilities: ["Read boards", "Search pins", "Create pins"],
    icon: "pinterest",
    color: "#E60023",
  },
];

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  "Email",
  "Calendar",
  "Files",
  "Chat",
  "Engineering",
  "Project management",
  "CRM",
  "Finance",
  "Design",
  "Marketing",
  "Social media",
  "Support",
  "Analytics",
  "AI",
  "Productivity",
  "Commerce",
  "HR",
  "Other",
];

/** The curated apps shown first in prompts; the full catalog comes from Composio. */
export const INTEGRATION_SLUGS = INTEGRATIONS.map((integration) => integration.slug);


export function isToolkitSlug(value: string): boolean {
  return /^[a-z0-9_][a-z0-9_-]{0,63}$/i.test(value.trim());
}

/** "googlecalendar" → "Googlecalendar"; used when Composio metadata is absent. */
export function prettyToolkitName(slug: string): string {
  const spaced = slug
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const FALLBACK_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#0EA5E9",
  "#059669",
  "#D97706",
  "#E11D48",
  "#4F46E5",
  "#0891B2",
];

/** Stable colour so an app keeps the same tile across renders and restarts. */
export function toolkitColor(slug: string): string {
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/**
 * A definition for any Composio toolkit, not only the curated twenty. Brand
 * names and descriptions are overwritten by live Composio metadata on the
 * server, so this is the safe shape for a connection card or callback before
 * that metadata is available.
 */
export function fallbackIntegration(slug: string, name?: string): IntegrationDefinition | null {
  if (!isToolkitSlug(slug)) return null;
  const clean = slug.trim().toLowerCase();
  const label = name?.trim() || prettyToolkitName(clean);

  return {
    slug: clean,
    name: label,
    category: "Other",
    description: `Connect ${label} through Composio so your agents can use it.`,
    capabilities: [],
    icon: "generic",
    color: toolkitColor(clean),
  };
}

export function getIntegration(slug: string): IntegrationDefinition | null {
  const clean = slug.trim().toLowerCase();
  return INTEGRATIONS.find((integration) => integration.slug === clean) ?? fallbackIntegration(clean);
}

/**
 * Accepts what a model or a person would type ("Google Calendar",
 * "google-calendar", "googlecalendar") and returns a toolkit slug. Any valid
 * Composio slug passes through, including the 1,700+ apps outside the curated
 * list; spaces are compressed because Composio slugs never contain them.
 */
export function resolveIntegrationSlug(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[\s_-]+/g, "");

  const direct = INTEGRATIONS.find(
    (integration) =>
      integration.slug.replace(/[\s_-]+/g, "") === normalized ||
      integration.name
        .toLowerCase()
        .replace(/[\s._-]+/g, "") === normalized,
  );
  if (direct) return direct.slug;

  // Short names people and models actually use.
  const aliases: Record<string, string> = {
    gcal: "googlecalendar",
    calendar: "googlecalendar",
    drive: "googledrive",
    gdrive: "googledrive",
    sheets: "googlesheets",
    teams: "microsoft_teams",
    msteams: "microsoft_teams",
    office: "outlook",
    email: "gmail",
    repo: "github",
  };

  const alias = aliases[normalized];
  if (alias && getIntegration(alias)) return alias;

  // Live toolkit slugs are already lower-case and separator-free (or use _).
  // Composio prefixes the few identifiers that would start with a digit
  // ("_1password"), so a name typed without the prefix still resolves.
  const slug = trimmed.replace(/\s+/g, "");
  if (!isToolkitSlug(slug)) return null;
  return /^[0-9]/.test(slug) ? `_${slug}` : slug;
}

/**
 * Composio's 100+ raw category names collapsed into the filter chips on the
 * Apps page. First match wins, so specific names are checked before broad ones.
 */
const CATEGORY_RULES: Array<[RegExp, IntegrationCategory]> = [
  [/model context protocol|artificial intelligence|ai agents?|ai models?|ai content|ai web scraping|ai chatbots?|ai assistants?|ai meeting|ai sales|ai document|ai safety|^ai\b/, "AI"],
  [/email/, "Email"],
  [/calendar|scheduling & booking/, "Calendar"],
  [/document|spreadsheet|file management|content & files|notes|ocr/, "Files"],
  [/team chat|communication|team collaboration|video conferencing|phone & sms/, "Chat"],
  [/\bcrm\b|contact management|sales & crm|^sales$/, "CRM"],
  [/project management|task management|time tracking|product management/, "Project management"],
  [/developer tools|database|server monitoring|it operations|security & identity|web scraping|website|app builder|\bgit\b|engineering|\bcode\b/, "Engineering"],
  [/payment processing|accounting|taxes|fundraising|invoice|market data|finance/, "Finance"],
  [/images & design|video & audio|media generation|video generation|transcription|audio & speech/, "Design"],
  [/marketing|ads & conversion|\bseo\b|newsletter|drip emails|webinars/, "Marketing"],
  [/social media accounts|social & creator data/, "Social media"],
  [/customer support|^support$|\breviews?\b/, "Support"],
  [/analytics|business intelligence|dashboards/, "Analytics"],
  [/ecommerce|commerce/, "Commerce"],
  [/human resources|hr talent|recruitment/, "HR"],
  [/productivity|forms & surveys|signature|bookmark|url shortener|event management|education|online courses|notifications|lifestyle|places & weather|fitness|gaming|legal|news|internet of things|call tracking|company data|people & contact/, "Productivity"],
];

export function toIntegrationCategory(categories: readonly string[]): IntegrationCategory {
  for (const raw of categories) {
    const value = raw.trim().toLowerCase();
    for (const [pattern, category] of CATEGORY_RULES) {
      if (pattern.test(value)) return category;
    }
  }
  return "Other";
}
