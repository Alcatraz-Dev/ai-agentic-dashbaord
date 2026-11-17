/**
 * The agent workspace each dashboard template opens with.
 *
 * A template is not only a grid of cards: a workspace built for publishing reads
 * differently from one built for engineering. This catalog decides the extra
 * pane beside the chat — its name, the tab set and the questions worth asking —
 * so the same chat shell can present an IDE for `developer`, a publishing queue
 * for `creator`, a day plan for `daily`, the money cards for `business` and the
 * source shelf for `research`.
 *
 * Client-safe: the agent page picks the pane from the active dashboard's
 * template and the workbench renders it, so the two cannot disagree.
 */

export type TemplateWorkbenchId = "creator" | "daily" | "business" | "developer" | "research";

export type TemplateWorkbenchTab = {
  id: string;
  label: string;
};

export type TemplateWorkbenchPrompt = {
  label: string;
  /** Sent as the next message when the owner clicks it. */
  prompt: string;
};

export type TemplateWorkbench = {
  id: TemplateWorkbenchId;
  /** Pane title in the agent workspace. */
  label: string;
  /** One line under the title: what this pane is for. */
  blurb: string;
  tabs: TemplateWorkbenchTab[];
  prompts: TemplateWorkbenchPrompt[];
};

const WORKBENCHES: Record<TemplateWorkbenchId, TemplateWorkbench> = {
  creator: {
    id: "creator",
    label: "Publishing desk",
    blurb: "What is drafted, what is queued and the briefs that keep the channel moving.",
    tabs: [
      { id: "queue", label: "Queue" },
      { id: "voice", label: "Voice" },
    ],
    prompts: [
      {
        label: "What grew this week?",
        prompt:
          "Summarise what grew this week across my publishing apps: the post, the hook and the platform. Cite the numbers you actually read.",
      },
      {
        label: "Draft a 5-post batch",
        prompt:
          "Draft a five-post batch for this week from the pillars in my saved skills. Give me the hook, the caption and the format for each, and put them on the task board.",
      },
      {
        label: "Comment themes",
        prompt:
          "What recurring themes show up in comments and replies across my channels? Group them and name the three worth turning into a post.",
      },
    ],
  },

  daily: {
    id: "daily",
    label: "Today",
    blurb: "The runs due today, the cards with a date and what is already late.",
    tabs: [
      { id: "today", label: "Today" },
      { id: "runs", label: "Runs" },
    ],
    prompts: [
      {
        label: "Brief me on today",
        prompt:
          "Brief me on today: my calendar, what is unread in my inbox, and the one decision that needs me.",
      },
      {
        label: "Triage my inbox",
        prompt:
          "Triage my unread mail into reply today, read later and ignore, and draft the two shortest replies.",
      },
      {
        label: "Wrap the day",
        prompt:
          "Wrap up my day: what moved on the board, what is still open, and what to carry to tomorrow.",
      },
    ],
  },

  business: {
    id: "business",
    label: "Numbers",
    blurb: "Every measured card on this dashboard, plus the review rhythm behind it.",
    tabs: [
      { id: "numbers", label: "Numbers" },
      { id: "rhythm", label: "Rhythm" },
    ],
    prompts: [
      {
        label: "This month against last",
        prompt:
          "Summarise this month's revenue, pipeline by stage and churn risk against last month. Use the connected finance and CRM apps and say what you could not read.",
      },
      {
        label: "Pipeline by stage",
        prompt:
          "Break down open pipeline by stage, owner and expected close date, and flag the deals that have not moved in three weeks.",
      },
      {
        label: "Cash and runway",
        prompt:
          "What is our cash position and runway at the current burn? State the assumptions you used.",
      },
    ],
  },

  developer: {
    id: "developer",
    label: "Project",
    blurb: "The repository this workspace runs from: folders, files, changes and a read-only shell.",
    tabs: [
      { id: "files", label: "Files" },
      { id: "changes", label: "Changes" },
      { id: "terminal", label: "Terminal" },
    ],
    prompts: [
      {
        label: "What is open in review?",
        prompt:
          "What is open in review, what is failing, and who is blocked across my repositories? Link each item.",
      },
      {
        label: "Explain this file",
        prompt:
          "Read the file I have open in the project pane and explain what it does, what calls it and what would break if it changed.",
      },
      {
        label: "Draft the fix",
        prompt:
          "Look at the working tree, name the riskiest change and draft the smallest fix. Show me the diff before anything is written.",
      },
    ],
  },

  research: {
    id: "research",
    label: "Sources",
    blurb: "The shelf behind the answers: saved skills, diagrams and the sites the browser stays signed in to.",
    tabs: [
      { id: "shelf", label: "Shelf" },
      { id: "briefs", label: "Briefs" },
    ],
    prompts: [
      {
        label: "What changed this week?",
        prompt:
          "What changed in my tracked topic this week, with a link for every claim and a note on which source said it first.",
      },
      {
        label: "Find the primary source",
        prompt:
          "Take the claims from my last answer and find the primary source for each. Mark anything that only appears in aggregators.",
      },
      {
        label: "Open questions",
        prompt:
          "From what I have saved so far, list the open questions worth answering next, ordered by what would change a decision.",
      },
    ],
  },
};

/** The workbench for a dashboard template, or null for blank / unknown. */
export function getTemplateWorkbench(template: string): TemplateWorkbench | null {
  return WORKBENCHES[template as TemplateWorkbenchId] ?? null;
}

/** True when the template opens the repository pane. */
export function templateUsesProject(template: string): boolean {
  return template === "developer";
}
