"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { updateAgentLibraryAction } from "@/app/actions/agents";
import { Switch } from "@/components/ui/switch";
import type { CustomDiagramSummary } from "@/lib/custom-diagram-types";
import type { CustomPluginSummary } from "@/lib/custom-plugin-types";
import type { CustomSkillSummary } from "@/lib/custom-skill-types";
import type { TemplateToolScope } from "@/lib/template-workspaces";

type LibraryRow = {
  key: string;
  name: string;
  description: string;
  active: boolean;
  onToggle: () => void;
};

/**
 * One switch group: a heading with its `n/m on` count, the rows, and either the
 * empty hint or an error. The three groups differ only in their labels.
 */
function LibraryGroup({
  label,
  on,
  total,
  rows,
  empty,
  busy,
  disabled = false,
  disabledNote,
}: {
  label: string;
  on: number;
  total: number;
  rows: LibraryRow[];
  empty: React.ReactNode;
  busy: boolean;
  /** The board's template switched this whole group off for its runs. */
  disabled?: boolean;
  disabledNote?: string;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        {disabled ? (
          <span className="text-[0.6rem] font-medium text-muted-foreground">Off on this board</span>
        ) : (
          <span className="text-[0.66rem] text-muted-foreground tabular-nums">
            {on}/{total} on
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-1.5 text-[0.66rem] leading-snug text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-1.5 divide-y divide-border/50">
          {rows.map((row) => {
            const active = row.active;
            return (
              <div key={row.key} className="flex items-start justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.74rem] font-medium">{row.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[0.66rem] leading-snug text-muted-foreground">
                    {row.description}
                  </p>
                </div>
                <Switch
                  size="sm"
                  className="mt-0.5 shrink-0"
                  checked={active}
                  disabled={busy || disabled}
                  onCheckedChange={() => row.onToggle()}
                  aria-label={`${active ? "Turn off" : "Turn on"} ${row.name}`}
                />
              </div>
            );
          })}
        </div>
      )}

      {disabled && disabledNote ? (
        <p className="mt-1.5 text-[0.66rem] leading-snug text-muted-foreground">{disabledNote}</p>
      ) : null}
    </div>
  );
}

/**
 * The workspace skills, diagrams and HTTP plugins this agent may use.
 *
 * They are created once for the workspace (Skills / Diagrams / Plugins pages, or
 * the chat's Add menu), then attached here per agent: `agents.enabled_skills`,
 * `agents.enabled_diagrams` and `agents.enabled_plugins` store the names and
 * slugs, `null` (older rows) means every one, and `[]` means none. The runner
 * narrows the skill list, the `use_skill` / `use_diagram` tools and the plugin
 * tools by these, so a switch here is the same thing as a tool the model can no
 * longer call.
 */
export function AgentLibrarySection({
  agentId,
  enabledSkills,
  enabledPlugins,
  enabledDiagrams,
  skills = [],
  plugins = [],
  diagrams = [],
  scope = null,
}: {
  agentId: number;
  /** Stored skill names; null means every workspace skill. */
  enabledSkills: string[] | null;
  /** Stored plugin slugs; null means every workspace plugin. */
  enabledPlugins: string[] | null;
  /** Stored diagram names; null means every workspace diagram. */
  enabledDiagrams: string[] | null;
  skills?: CustomSkillSummary[];
  plugins?: CustomPluginSummary[];
  diagrams?: CustomDiagramSummary[];
  /** The board's ceiling. A group the template switched off is shown read-only. */
  scope?: TemplateToolScope | null;
}) {
  const router = useRouter();
  const [skillNames, setSkillNames] = useState<string[]>(
    () => enabledSkills ?? skills.map((skill) => skill.name),
  );
  const [pluginSlugs, setPluginSlugs] = useState<string[]>(
    () => enabledPlugins ?? plugins.map((plugin) => plugin.slug),
  );
  const [diagramNames, setDiagramNames] = useState<string[]>(
    () => enabledDiagrams ?? diagrams.map((diagram) => diagram.name),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The page hands us a fresh list after every refresh; follow the row.
  useEffect(() => {
    setSkillNames(enabledSkills ?? skills.map((skill) => skill.name));
  }, [enabledSkills, skills]);

  useEffect(() => {
    setPluginSlugs(enabledPlugins ?? plugins.map((plugin) => plugin.slug));
  }, [enabledPlugins, plugins]);

  useEffect(() => {
    setDiagramNames(enabledDiagrams ?? diagrams.map((diagram) => diagram.name));
  }, [enabledDiagrams, diagrams]);

  async function toggleSkill(name: string) {
    if (saving) return;

    const previous = skillNames;
    const next = previous.includes(name)
      ? previous.filter((entry) => entry !== name)
      : [...previous, name];

    setSkillNames(next);
    setSaving(`skill:${name}`);
    setError(null);

    try {
      const result = await updateAgentLibraryAction({ id: agentId, skills: next });

      if (!result.ok) {
        setSkillNames(previous);
        setError(result.error);
        return;
      }

      setSkillNames(result.agent.enabledSkills ?? []);
      router.refresh();
    } catch (toggleError) {
      console.error("[agents] skill toggle failed", toggleError);
      setSkillNames(previous);
      setError("We couldn't save that setting. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  async function togglePlugin(slug: string) {
    if (saving) return;

    const previous = pluginSlugs;
    const next = previous.includes(slug)
      ? previous.filter((entry) => entry !== slug)
      : [...previous, slug];

    setPluginSlugs(next);
    setSaving(`plugin:${slug}`);
    setError(null);

    try {
      const result = await updateAgentLibraryAction({ id: agentId, plugins: next });

      if (!result.ok) {
        setPluginSlugs(previous);
        setError(result.error);
        return;
      }

      setPluginSlugs(result.agent.enabledPlugins ?? []);
      router.refresh();
    } catch (toggleError) {
      console.error("[agents] plugin toggle failed", toggleError);
      setPluginSlugs(previous);
      setError("We couldn't save that setting. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  async function toggleDiagram(name: string) {
    if (saving) return;

    const previous = diagramNames;
    const next = previous.includes(name)
      ? previous.filter((entry) => entry !== name)
      : [...previous, name];

    setDiagramNames(next);
    setSaving(`diagram:${name}`);
    setError(null);

    try {
      const result = await updateAgentLibraryAction({ id: agentId, diagrams: next });

      if (!result.ok) {
        setDiagramNames(previous);
        setError(result.error);
        return;
      }

      setDiagramNames(result.agent.enabledDiagrams ?? []);
      router.refresh();
    } catch (toggleError) {
      console.error("[agents] diagram toggle failed", toggleError);
      setDiagramNames(previous);
      setError("We couldn't save that setting. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <LibraryGroup
        label="Skills"
        on={skillNames.length}
        total={skills.length}
        busy={saving !== null}
        disabled={scope ? !scope.skills : false}
        disabledNote="This dashboard's template runs without workspace skills, so the switches here can't apply."
        rows={skills.map((skill) => ({
          key: `skill-${skill.id}`,
          name: skill.name,
          description: skill.description,
          active: skillNames.includes(skill.name),
          onToggle: () => void toggleSkill(skill.name),
        }))}
        empty={
          <>
            No workspace skills yet. Save one from the chat&apos;s Add menu, or write one on the{" "}
            <Link href="/dashboard/skills" className="font-medium text-brand-ink hover:underline">
              Skills page
            </Link>
            .
          </>
        }
      />

      <LibraryGroup
        label="Diagrams"
        on={diagramNames.length}
        total={diagrams.length}
        busy={saving !== null}
        disabled={scope ? !scope.diagrams : false}
        disabledNote="This dashboard's template runs without diagrams. A board built for engineering or research can use them."
        rows={diagrams.map((diagram) => ({
          key: `diagram-${diagram.id}`,
          name: diagram.name,
          description: diagram.description,
          active: diagramNames.includes(diagram.name),
          onToggle: () => void toggleDiagram(diagram.name),
        }))}
        empty={
          <>
            No saved diagrams yet. Draw one on the{" "}
            <Link href="/dashboard/diagrams" className="font-medium text-brand-ink hover:underline">
              Diagrams page
            </Link>{" "}
            and attach it here.
          </>
        }
      />

      <LibraryGroup
        label="Plugins"
        on={pluginSlugs.length}
        total={plugins.length}
        busy={saving !== null}
        disabled={scope ? !scope.plugins : false}
        disabledNote="This dashboard's template runs without plugins, so the switches here can't apply."
        rows={plugins.map((plugin) => ({
          key: `plugin-${plugin.id}`,
          name: plugin.name,
          description: plugin.description,
          active: pluginSlugs.includes(plugin.slug),
          onToggle: () => void togglePlugin(plugin.slug),
        }))}
        empty={
          <>
            No HTTP plugins yet. Add one from the chat&apos;s Add menu or the{" "}
            <Link href="/dashboard/plugins" className="font-medium text-brand-ink hover:underline">
              Plugins page
            </Link>
            .
          </>
        }
      />

      {error ? (
        <p role="alert" className="mt-1.5 text-[0.7rem] text-destructive">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[0.66rem] leading-snug text-muted-foreground">
          A skill is instructions this agent can load, a diagram is a saved structure it can read,
          and a plugin is a tool it can call. Nothing runs until the agent uses it, and a switch here
          removes it from this agent only.
        </p>
      )}
    </div>
  );
}
