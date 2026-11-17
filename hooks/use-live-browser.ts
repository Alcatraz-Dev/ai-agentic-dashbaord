"use client";

import { useSyncExternalStore } from "react";

/**
 * The live cloud browser, as seen from the page.
 *
 * The chat starts it when a turn opens a Browserbase session and stops it when
 * the reply ends; the config panel reads the same store, so one poller feeds
 * both views. A session only exists for the turn that opened it, so there is
 * nothing to restore on reload.
 */

export type LiveBrowserState = {
  /** Agent whose turn is driving the browser; null when nothing is live. */
  agentId: number | null;
  /** Browserbase's tokenized live view (DevTools) for the running session. */
  liveViewUrl: string | null;
  /** Latest JPEG frame as a data URL. */
  image: string | null;
  url: string;
  title: string;
};

const EMPTY: LiveBrowserState = {
  agentId: null,
  liveViewUrl: null,
  image: null,
  url: "",
  title: "",
};

const POLL_MS = 2000;

let state: LiveBrowserState = EMPTY;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function update(next: Partial<LiveBrowserState>) {
  state = { ...state, ...next };
  emit();
}

async function poll(agentId: number) {
  try {
    const response = await fetch(`/api/agents/${agentId}/browser/live`, { cache: "no-store" });
    if (!response.ok) return;

    const data = (await response.json()) as {
      live: boolean;
      image?: string;
      url?: string;
      title?: string;
    };

    // The turn may have moved on while this request was in flight.
    if (state.agentId !== agentId) return;

    update({
      image: data.live ? (data.image ?? null) : null,
      url: data.live ? (data.url ?? "") : "",
      title: data.live ? (data.title ?? "") : "",
    });
  } catch {
    // A dropped poll is not an error: the next one retries.
  }
}

/** Call when the runtime reports its first browser action of a turn. */
export function startLiveBrowser(agentId: number, liveViewUrl: string | null = null) {
  if (timer) clearInterval(timer);

  state = { agentId, liveViewUrl, image: null, url: "", title: "" };
  emit();

  void poll(agentId);
  timer = setInterval(() => void poll(agentId), POLL_MS);
}

/** Call when the reply ends (the server releases the session then). */
export function stopLiveBrowser() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (state === EMPTY) return;
  state = EMPTY;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveBrowser(): LiveBrowserState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}
