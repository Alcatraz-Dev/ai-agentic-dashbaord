"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { AgentModelCatalog, AgentSummary } from "@/lib/agent-options";

/**
 * Client-side agent list, seeded from the server layout. Newly created agents
 * are appended here so the sidebar updates without a page refresh, and edits
 * made in the agent panel are pushed in so the shell never shows a stale
 * avatar or name. The model catalog rides along because the create dialog needs
 * it everywhere.
 */
type AgentsContextValue = {
  agents: AgentSummary[];
  addAgent: (agent: AgentSummary) => void;
  updateAgent: (agent: AgentSummary) => void;
  removeAgent: (agentId: number) => void;
  models: AgentModelCatalog;
};

const AgentsContext = createContext<AgentsContextValue | null>(null);

export function AgentsProvider({
  initialAgents,
  models,
  children,
}: {
  initialAgents: AgentSummary[];
  models: AgentModelCatalog;
  children: ReactNode;
}) {
  const [agents, setAgents] = useState(initialAgents);

  // `router.refresh()` re-renders the shell with a new `initialAgents`, but this
  // component keeps its own state; without this the sidebar would keep showing
  // the avatar/name it was mounted with. The signature avoids replacing state on
  // every render with an array of equal content.
  const signature = initialAgents
    .map((agent) =>
      [agent.id, agent.name, agent.avatar, agent.color, agent.provider, agent.approvalMode].join(":"),
    )
    .join("|");

  useEffect(() => {
    setAgents(initialAgents);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the signature
  }, [signature]);

  const addAgent = useCallback((agent: AgentSummary) => {
    setAgents((current) =>
      current.some((item) => item.id === agent.id) ? current : [...current, agent],
    );
  }, []);

  /** Merges an edited agent back in, so the sidebar updates immediately. */
  const updateAgent = useCallback((agent: AgentSummary) => {
    setAgents((current) =>
      current.map((item) => (item.id === agent.id ? { ...item, ...agent } : item)),
    );
  }, []);

  const removeAgent = useCallback((agentId: number) => {
    setAgents((current) => current.filter((item) => item.id !== agentId));
  }, []);

  return (
    <AgentsContext.Provider value={{ agents, addAgent, updateAgent, removeAgent, models }}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents() {
  const context = useContext(AgentsContext);
  if (!context) throw new Error("useAgents must be used inside <AgentsProvider>.");
  return context;
}
