import type {
  WidgetDesignKey,
  WidgetForm,
  WidgetIconKey,
  WidgetIllustrationKey,
  WidgetPayload,
  WidgetSize,
} from "@/lib/widget-types";

/**
 * The dashboard templates, as real starting layouts.
 *
 * A new workspace has nothing to measure yet, so a template never invents
 * numbers. Each one seeds a small, deliberate grid of cards whose rows are the
 * real setup steps, the real apps to connect and the briefs worth scheduling
 * for that kind of work. Every card starts paused: the content is the owner's
 * to act on, and an update only makes sense once the apps behind it are
 * connected and a real source exists.
 *
 * Client-safe: the wizard previews the layout with these records and the server
 * seeds them, so the two can never disagree.
 */

export type DashboardStarterWidget = {
  /** Stable identity inside its template; titles double as the dedupe key. */
  key: string;
  title: string;
  icon: WidgetIconKey;
  illustration: WidgetIllustrationKey;
  form: WidgetForm;
  design: WidgetDesignKey;
  size: WidgetSize;
  /** Grid cell on the three-column desktop grid. */
  x: number;
  y: number;
  data: WidgetPayload;
  /** What a later update should read, once the apps behind the card are live. */
  sourcePrompt?: string;
};

export type DashboardTemplateBlueprint = {
  /** What the template is for — one line under the picker. */
  focus: string;
  /** Clay portrait preselected with this template. */
  portrait: string;
  /** Clay colour id preselected with this template. */
  color: string;
  /** Suggested name while the field is still empty. */
  namePlaceholder: string;
  /** A real opening prompt for the chat. */
  firstPrompt: string;
  widgets: DashboardStarterWidget[];
};

/** Rows are the only honest content a brand-new workspace has. */
function rows(
  items: {
    title: string;
    meta?: string;
    logo?: string;
    status?: string;
    done?: boolean;
    tone?: "neutral" | "positive" | "warning";
    value?: string;
  }[],
): WidgetPayload {
  return { metrics: [], series: [], items };
}

const TEMPLATE_BLUEPRINTS: Record<string, DashboardTemplateBlueprint> = {
  blank: {
    focus: "An empty canvas. Ask an agent for the first widget when you know what to watch.",
    portrait: "squircle:attentive",
    color: "blue",
    namePlaceholder: "e.g. Product ops, Growth, Personal HQ",
    firstPrompt: "What should I track first? Suggest three widgets for this workspace.",
    widgets: [],
  },

  creator: {
    focus:
      "Audience and publishing: the apps to connect, the briefs worth asking for, and a weekly rhythm.",
    portrait: "pebble:happy",
    color: "rose",
    namePlaceholder: "e.g. Content studio, Channel desk",
    firstPrompt:
      "Summarise what grew this week across my publishing apps, and name the hook that did it.",
    widgets: [
      {
        key: "creator-setup",
        title: "Creator setup",
        icon: "users",
        illustration: "rocket",
        form: "checklist",
        design: "editorial",
        size: "large",
        x: 0,
        y: 0,
        data: rows([
          { title: "Connect your publishing apps", meta: "Apps → Instagram, YouTube, X" },
          { title: "Ask for a reach brief", meta: "What grew this week, and why" },
          { title: "Schedule that brief", meta: "Weekly · Monday 09:00" },
          { title: "Save your voice as a skill", meta: "Skills → write once, reuse" },
        ]),
      },
      {
        key: "creator-apps",
        title: "Publishing apps",
        icon: "globe",
        illustration: "globe",
        form: "rows",
        design: "editorial",
        size: "medium",
        x: 2,
        y: 0,
        data: rows([
          { title: "Instagram", meta: "Feed · reels", logo: "instagram", status: "Connect" },
          { title: "YouTube", meta: "Long form · shorts", logo: "youtube", status: "Connect" },
          { title: "X", meta: "Posts · threads", logo: "twitter", status: "Connect" },
          { title: "TikTok", meta: "Short video", logo: "tiktok", status: "Connect" },
          { title: "LinkedIn", meta: "Profile · page", logo: "linkedin", status: "Connect" },
        ]),
        sourcePrompt:
          "Per-app publishing activity for the accounts the owner connected, with the post that earned the most reach.",
      },
      {
        key: "creator-briefs",
        title: "First briefs",
        icon: "activity",
        illustration: "idea",
        form: "briefing",
        design: "editorial",
        size: "medium",
        x: 2,
        y: 3,
        data: rows([
          {
            title: "Which posts earned reach from non-followers, and the hook that did it.",
            meta: "Weekly",
            status: "Ask in chat",
          },
          {
            title: "One idea tested against the last five posts.",
            meta: "Ad hoc",
            status: "Ask in chat",
          },
          {
            title: "Draft → review → publish, tracked on the board.",
            meta: "Pipeline",
            status: "Tasks",
          },
          {
            title: "Recurring comment themes worth turning into a post.",
            meta: "Monthly",
            status: "Ask in chat",
          },
        ]),
      },
      {
        key: "creator-rhythm",
        title: "Publishing rhythm",
        icon: "calendar",
        illustration: "calendar",
        form: "agenda",
        design: "editorial",
        size: "medium",
        x: 0,
        y: 4,
        data: rows([
          { title: "Reach brief", meta: "09:00", status: "Mon" },
          { title: "Queue review", meta: "10:00", status: "Wed" },
          { title: "Comment themes", meta: "16:00", status: "Fri" },
          { title: "Month recap", meta: "09:00", status: "1st" },
        ]),
      },
    ],
  },

  daily: {
    focus: "A focused today view: your calendar, your inbox and the three things that matter.",
    portrait: "capsule:sleepy",
    color: "blue",
    namePlaceholder: "e.g. Today, Personal HQ",
    firstPrompt:
      "Brief me on today: my calendar, what is unread in my inbox, and what needs a decision.",
    widgets: [
      {
        key: "daily-setup",
        title: "Daily setup",
        icon: "calendar",
        illustration: "coffee",
        form: "checklist",
        design: "clean",
        size: "large",
        x: 0,
        y: 0,
        data: rows([
          { title: "Connect your calendar and inbox", meta: "Apps → Google Calendar, Gmail" },
          { title: "Ask for a morning brief", meta: "Today's events and unread mail" },
          { title: "Schedule the brief", meta: "Every day · 08:00" },
          { title: "Keep the board current", meta: "Three open cards at most" },
        ]),
      },
      {
        key: "daily-glance",
        title: "Today at a glance",
        icon: "clock",
        illustration: "moon",
        form: "agenda",
        design: "clean",
        size: "medium",
        x: 2,
        y: 0,
        data: rows([
          { title: "Morning brief", meta: "08:00", status: "Daily" },
          { title: "Inbox triage", meta: "08:30", status: "Daily" },
          { title: "Focus block", meta: "13:00", status: "Daily" },
          { title: "Day wrap", meta: "18:00", status: "Daily" },
        ]),
      },
      {
        key: "daily-done",
        title: "Done today",
        icon: "target",
        illustration: "leaf",
        form: "checklist",
        design: "clean",
        size: "medium",
        x: 2,
        y: 3,
        data: rows([
          { title: "Morning brief read", meta: "Daily", done: false },
          { title: "Inbox at zero", meta: "Daily", done: false },
          { title: "One focus block finished", meta: "Daily", done: false },
          { title: "Day wrapped and handed over", meta: "Daily", done: false },
        ]),
      },
      {
        key: "daily-briefs",
        title: "Morning brief",
        icon: "bell",
        illustration: "coffee",
        form: "briefing",
        design: "clean",
        size: "medium",
        x: 0,
        y: 4,
        data: rows([
          {
            title: "Today's events, conflicts and the first thing on the calendar.",
            meta: "08:00",
            status: "Daily",
          },
          {
            title: "Unread mail that actually needs a reply today.",
            meta: "08:30",
            status: "Daily",
          },
          {
            title: "What moved on the task board since yesterday.",
            meta: "09:00",
            status: "Daily",
          },
          {
            title: "What to carry over, and what to drop.",
            meta: "18:00",
            status: "Daily",
          },
        ]),
      },
    ],
  },

  business: {
    focus: "Revenue, pipeline and the team numbers — the cards a weekly review actually reads.",
    portrait: "triangle:excited",
    color: "indigo",
    namePlaceholder: "e.g. Company, Revenue desk",
    firstPrompt:
      "Summarise this month's revenue, pipeline by stage and churn risk against last month.",
    widgets: [
      {
        key: "business-setup",
        title: "Business setup",
        icon: "dollar",
        illustration: "coins",
        form: "checklist",
        design: "classic",
        size: "large",
        x: 0,
        y: 0,
        data: rows([
          { title: "Connect CRM and billing", meta: "Apps → HubSpot, Stripe" },
          { title: "Ask for pipeline and revenue", meta: "This month against last" },
          { title: "Schedule a weekly summary", meta: "Monday · 09:00" },
          { title: "Write down the metric definitions", meta: "So two reports can't disagree" },
        ]),
      },
      {
        key: "business-sources",
        title: "Money sources",
        icon: "database",
        illustration: "stack",
        form: "rows",
        design: "classic",
        size: "medium",
        x: 2,
        y: 0,
        data: rows([
          { title: "Stripe", meta: "Billing · invoices", logo: "stripe", status: "Connect" },
          { title: "HubSpot", meta: "CRM · deals", logo: "hubspot", status: "Connect" },
          { title: "QuickBooks", meta: "Books · expenses", logo: "quickbooks", status: "Connect" },
          { title: "Salesforce", meta: "Pipeline · accounts", logo: "salesforce", status: "Connect" },
        ]),
        sourcePrompt:
          "Revenue, open pipeline and churn signals from the finance and CRM accounts the owner connected.",
      },
      {
        key: "business-briefs",
        title: "Executive briefs",
        icon: "trending",
        illustration: "chart",
        form: "briefing",
        design: "classic",
        size: "medium",
        x: 2,
        y: 3,
        data: rows([
          { title: "Revenue against plan, by line.", meta: "Monthly", status: "Ask in chat" },
          { title: "Pipeline by stage and owner.", meta: "Weekly", status: "Ask in chat" },
          { title: "Churn risk from billing and support.", meta: "Monthly", status: "Ask in chat" },
          { title: "Cash position and runway.", meta: "Weekly", status: "Ask in chat" },
        ]),
      },
      {
        key: "business-rhythm",
        title: "Review rhythm",
        icon: "calendar",
        illustration: "calendar",
        form: "agenda",
        design: "classic",
        size: "medium",
        x: 0,
        y: 4,
        data: rows([
          { title: "Weekly summary", meta: "09:00", status: "Mon" },
          { title: "Pipeline review", meta: "09:30", status: "Mon" },
          { title: "Forecast check", meta: "10:00", status: "Wed" },
          { title: "Board pack", meta: "08:00", status: "1st" },
        ]),
      },
    ],
  },

  developer: {
    focus: "Reviews, checks and errors: what is open, what is failing and who is blocked.",
    portrait: "squircle:confused",
    color: "slate",
    namePlaceholder: "e.g. Engineering, Platform",
    firstPrompt:
      "What is open in review, what is failing, and who is blocked across my repositories?",
    widgets: [
      {
        key: "developer-setup",
        title: "Developer setup",
        icon: "cpu",
        illustration: "bolt",
        form: "checklist",
        design: "neon",
        size: "large",
        x: 0,
        y: 0,
        data: rows([
          { title: "Connect GitHub and your tracker", meta: "Apps → GitHub, Linear" },
          {
            title: "Ask for open PRs and failing checks",
            meta: "With the repo each one belongs to",
          },
          { title: "Schedule a standup brief", meta: "Weekdays · 09:00" },
          { title: "Connect deploys and errors", meta: "Apps → Vercel, Sentry" },
        ]),
      },
      {
        key: "developer-sources",
        title: "Engineering sources",
        icon: "server",
        illustration: "cloud",
        form: "rows",
        design: "neon",
        size: "medium",
        x: 2,
        y: 0,
        data: rows([
          { title: "GitHub", meta: "PRs · checks", logo: "github", status: "Connect" },
          { title: "Linear", meta: "Issues · cycles", logo: "linear", status: "Connect" },
          { title: "Vercel", meta: "Deploys · builds", logo: "vercel", status: "Connect" },
          { title: "Sentry", meta: "Errors · releases", logo: "sentry", status: "Connect" },
        ]),
        sourcePrompt:
          "Open pull requests, failing checks and new errors from the developer accounts the owner connected.",
      },
      {
        key: "developer-briefs",
        title: "Engineering briefs",
        icon: "activity",
        illustration: "flow",
        form: "briefing",
        design: "neon",
        size: "medium",
        x: 2,
        y: 3,
        data: rows([
          { title: "Open PRs, failing checks, who is blocked.", meta: "Weekdays", status: "09:00" },
          { title: "What shipped since yesterday.", meta: "Daily", status: "18:00" },
          { title: "New errors grouped by service.", meta: "Daily", status: "Ask in chat" },
          { title: "PRs waiting on my review.", meta: "Weekdays", status: "11:00" },
        ]),
      },
      {
        key: "developer-rhythm",
        title: "Working rhythm",
        icon: "clock",
        illustration: "spark",
        form: "agenda",
        design: "neon",
        size: "medium",
        x: 0,
        y: 4,
        data: rows([
          { title: "Standup brief", meta: "09:00", status: "Mon–Fri" },
          { title: "Review queue", meta: "11:00", status: "Daily" },
          { title: "Deploy watch", meta: "15:00", status: "Daily" },
          { title: "Week recap", meta: "16:00", status: "Fri" },
        ]),
      },
    ],
  },

  research: {
    focus: "Sources, open questions and a digest that keeps a topic current while you dig.",
    portrait: "hexagon:curious",
    color: "turquoise",
    namePlaceholder: "e.g. Research, Topic watch",
    firstPrompt:
      "What changed in my tracked topic this week, with a link for every claim?",
    widgets: [
      {
        key: "research-setup",
        title: "Research setup",
        icon: "layers",
        illustration: "book",
        form: "checklist",
        design: "glass",
        size: "large",
        x: 0,
        y: 0,
        data: rows([
          { title: "Connect your sources", meta: "Apps → Notion, Google Drive" },
          { title: "Name the topic to track", meta: "One line, as specific as you can" },
          { title: "Ask for a weekly digest", meta: "What changed, with links" },
          { title: "File findings as memories", meta: "Memory keeps the trail" },
        ]),
      },
      {
        key: "research-sources",
        title: "Source shelf",
        icon: "file",
        illustration: "stack",
        form: "rows",
        design: "glass",
        size: "medium",
        x: 2,
        y: 0,
        data: rows([
          { title: "Notion", meta: "Notes · docs", logo: "notion", status: "Connect" },
          { title: "Google Drive", meta: "Reports · PDFs", logo: "googledrive", status: "Connect" },
          { title: "arXiv", meta: "Papers", logo: "arxiv", status: "Connect" },
          { title: "Gmail", meta: "Alerts · newsletters", logo: "gmail", status: "Connect" },
        ]),
        sourcePrompt:
          "New items in the owner's research sources for the tracked topic, with a link for every claim.",
      },
      {
        key: "research-briefs",
        title: "Reading briefs",
        icon: "file",
        illustration: "idea",
        form: "briefing",
        design: "glass",
        size: "medium",
        x: 2,
        y: 3,
        data: rows([
          { title: "What changed across your sources.", meta: "Weekly", status: "Fri 16:00" },
          { title: "New papers worth reading.", meta: "Daily", status: "Ask in chat" },
          { title: "Claims that need a primary source.", meta: "Ad hoc", status: "Ask in chat" },
          { title: "Open questions to answer next.", meta: "Weekly", status: "Ask in chat" },
        ]),
      },
      {
        key: "research-rhythm",
        title: "Study rhythm",
        icon: "calendar",
        illustration: "moon",
        form: "agenda",
        design: "glass",
        size: "medium",
        x: 0,
        y: 4,
        data: rows([
          { title: "Source sweep", meta: "09:00", status: "Mon" },
          { title: "Deep read", meta: "14:00", status: "Wed" },
          { title: "Weekly digest", meta: "16:00", status: "Fri" },
          { title: "Topic review", meta: "10:00", status: "1st" },
        ]),
      },
    ],
  },
};

/** The starter cards one template seeds; blank (and unknown) seeds none. */
export function getDashboardStarters(template: string): DashboardStarterWidget[] {
  return TEMPLATE_BLUEPRINTS[template]?.widgets ?? [];
}

/** The full blueprint (focus, presets, prompting and cards) for one template. */
export function getTemplateBlueprint(template: string): DashboardTemplateBlueprint | null {
  return TEMPLATE_BLUEPRINTS[template] ?? null;
}

/** How many cards a template seeds, for the pickers. */
export function templateStarterCount(template: string): number {
  return getDashboardStarters(template).length;
}
