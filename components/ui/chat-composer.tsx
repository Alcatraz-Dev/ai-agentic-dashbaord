"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowUp,
  Check,
  Code2,
  FolderOpen,
  Hand,
  ListChecks,
  ListTodo,
  Loader2,
  Mic,
  Paperclip,
  PenTool,
  Plug,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import { AGENT_APPROVAL_MODES, type AgentApprovalMode } from "@/lib/agent-options";
import { cn } from "@/lib/utils";

/**
 * Chat Composer — our own build of affectUI's Pro composer, written to the
 * documented contract of the original (the Pro source needs an access key):
 * one rounded card with the prompt on top, a toolbar (plus menu, approval
 * menu, model slot, dictation, send) and a tray with the files row and the
 * app connections. Menus are listboxes / menuitemcheckboxes with
 * `aria-activedescendant`, the keyboard map is the documented one, sizes
 * follow the container via container-query units, and every colour is a
 * `--ui-cc-*` variable with an `--aui-*` fallback so all palettes and both
 * appearances are themed by `globals.css`.
 *
 * Honest by construction: only the approval mode the agent enforces is
 * selectable, the apps are the workspace's real Composio connections, the
 * plan toggle actually changes what the agent is asked to do, and the
 * plus-menu entries this dashboard has no feature behind are shown disabled
 * with the reason.
 */

/** One external app the workspace has connected (or could connect). */
export type ChatComposerApp = {
  slug: string;
  name: string;
  connected: boolean;
};

/** One picked file or folder, shown as a chip above the field. */
export type ChatComposerAttachment = {
  id: string;
  name: string;
  kind: "file" | "folder";
  /** How many files a picked folder holds. */
  count?: number;
};

/** One Add-menu option that can be armed for the next message. */
export type ChatComposerAddAction = "task" | "skill" | "plugin" | "diagram";

export const ADD_ACTION_LABELS: Record<ChatComposerAddAction, string> = {
  task: "Task",
  skill: "Skill",
  plugin: "Plugin",
  diagram: "Diagram",
};

/** What the composer attaches to a send, beside the text. */
export type ChatComposerSendDetails = {
  /** The reader turned Plan mode on for this message. */
  plan: boolean;
  /** The armed Add option; null when the message is a normal chat turn. */
  action: ChatComposerAddAction | null;
};

export type ChatComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Called with the trimmed message when the reader presses send or Enter. */
  onSend: (message: string, details: ChatComposerSendDetails) => void;
  placeholder?: string;
  /** A run is streaming: the field stays readable, send is held. */
  busy?: boolean;
  disabled?: boolean;
  /** Pending attachments, one chip each; a folder counts as one chip. */
  attachments?: ChatComposerAttachment[];
  /** Removes one chip by id. */
  onRemoveAttachment?: (id: string) => void;
  /** Opens the file picker (the plus menu and the tray row call it). */
  onAttach?: () => void;
  /** Opens the folder picker (the plus menu and the tray row call it). */
  onAttachFolder?: () => void;
  /**
   * Opens the workspace project dialog: a folder on this machine or a clone of
   * a GitHub repository, whose files then live in the Desk panel.
   */
  onAttachProject?: () => void;
  /**
   * The Add option armed for the next send, shown as a chip next to Plan mode.
   * A record option (task / skill / plugin) turns the send into its form; a
   * diagram turns it into a drawing request.
   */
  addAction?: ChatComposerAddAction | null;
  /** Arms or clears that option (null clears it). */
  onAddActionChange?: (action: ChatComposerAddAction | null) => void;
  /** Extra toolbar controls (model picker, browsing toggle, …). */
  tools?: ReactNode;
  /** Inline error from the last run, shown above the field. */
  error?: string | null;
  /** Connected apps for the tray and the apps menu. */
  apps?: ChatComposerApp[];
  /** Where "Manage apps" goes. */
  appsHref?: string;
  /** Start the connection flow for one app (popup + polling in the chat). */
  onConnectApp?: (slug: string) => void | Promise<void>;
  /** Revoke one connected app. */
  onDisconnectApp?: (slug: string) => void | Promise<void>;
  /** Approvals the agent is waiting on; shows a chip that jumps to them. */
  approvals?: { pending: number; onReview?: () => void };
  /** How data-changing app actions are approved for this agent. */
  approvalMode?: AgentApprovalMode;
  /** Saves a new approval mode. Without it the picker stays read-only. */
  onApprovalModeChange?: (mode: AgentApprovalMode) => void;
  /** A mode change is being saved. */
  approvalSaving?: boolean;
  /** The chat's textarea ref, so the page can focus the composer. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Turn dictation off entirely. */
  voice?: boolean;
  /**
   * The tray with the files row and "Connect apps". The original keeps it
   * for the first message only; afterwards the apps live in the plus menu.
   */
  tray?: boolean;
  className?: string;
};

type VoiceResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
  resultIndex: number;
};

type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: VoiceResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type VoiceConstructor = new () => VoiceRecognition;
type MenuName = "plus" | "approval" | "apps" | null;

const VOICE_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in the browser to dictate.",
  "service-not-allowed": "Microphone access was blocked. Allow it in the browser to dictate.",
  "no-speech": "Didn't catch anything. Try again a little closer to the mic.",
  "audio-capture": "No microphone was found on this device.",
  network: "Dictation needs a network connection in this browser.",
};

const COMPOSER_CSS = `
.ui-cc {
  --ui-cc-ink: var(--aui-ink, #171717);
  --ui-cc-muted: var(--aui-muted, #8f8f8f);
  --ui-cc-surface: var(--aui-surface, #ffffff);
  --ui-cc-subtle: var(--aui-subtle, #f4f4f5);
  --ui-cc-line: var(--aui-border, #e6e6e8);
  --ui-cc-focus: var(--aui-focus, #1d4ed8);
  --ui-cc-primary: var(--aui-primary, #1d4ed8);
  --ui-cc-danger: var(--aui-danger, #c4320a);
  --ui-cc-danger-soft: var(--aui-danger-soft, rgb(240 68 56 / 0.1));
  --ui-cc-radius: var(--aui-radius-lg, 16px);
  --ui-cc-radius-sm: var(--aui-radius-sm, 7px);
  --ui-cc-shadow: var(--aui-shadow-card, 0 0 0 1px #ececec, 0 1px 2px rgb(0 0 0 / 0.04));
  --ui-cc-ease: var(--aui-ease, cubic-bezier(0.22, 1, 0.36, 1));
  --ui-cc-duration: var(--aui-duration, 180ms);

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  container-type: inline-size;
}
.ui-cc__shell {
  /* Container-query scale: every size follows the width the composer gets.
     Declared here rather than on .ui-cc, because cqw resolves against the
     nearest ancestor container — not the element that declares the container. */
  --cc-pad: clamp(9px, 1.9cqw, 13px);
  --cc-pad-x: clamp(11px, 2.4cqw, 16px);
  --cc-type: clamp(0.74rem, 0.28cqw + 0.7rem, 0.8rem);
  --cc-small: clamp(0.62rem, 0.2cqw + 0.58rem, 0.7rem);
  --cc-control: clamp(24px, 4.2cqw, 28px);
  --cc-icon: clamp(15px, 2.2cqw, 18px);

  position: relative;
  display: flex;
  flex-direction: column;
  overflow: visible;
  border: var(--aui-hairline, 1px) solid var(--ui-cc-line);
  border-radius: calc(var(--ui-cc-radius) + 6px);
  background: var(--ui-cc-surface);
  box-shadow: var(--ui-cc-shadow);
  transition:
    border-color var(--ui-cc-duration) var(--ui-cc-ease),
    box-shadow var(--ui-cc-duration) var(--ui-cc-ease);
}
.ui-cc__shell:focus-within {
  border-color: color-mix(in oklab, var(--ui-cc-focus) 38%, var(--ui-cc-line));
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ui-cc-focus) 12%, transparent);
}
.ui-cc__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--cc-pad) var(--cc-pad-x) 6px;
  border-radius: inherit;
  cursor: text;
}
.ui-cc__input {
  width: 100%;
  min-height: 20px;
  max-height: 72px;
  field-sizing: content;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ui-cc-ink);
  font-family: inherit;
  font-size: var(--cc-type);
  line-height: 1.4;
  padding: 0;
}
.ui-cc__input::placeholder { color: color-mix(in oklab, var(--ui-cc-muted) 86%, var(--ui-cc-surface)); }
.ui-cc__input:disabled { cursor: not-allowed; opacity: 0.7; }
.ui-cc__notices { display: flex; flex-direction: column; gap: 6px; }
.ui-cc__notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border-radius: var(--ui-cc-radius-sm);
  padding: 6px 8px;
  font-size: 0.72rem;
  line-height: 1.45;
}
.ui-cc__notice[data-tone="error"] { background: var(--ui-cc-danger-soft); color: var(--ui-cc-danger); }
.ui-cc__notice[data-tone="voice"] { background: var(--ui-cc-subtle); color: var(--ui-cc-muted); }
.ui-cc__notice-close {
  margin-left: auto;
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.ui-cc__notice-close:hover { background: color-mix(in oklab, currentColor 12%, transparent); }
.ui-cc__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  max-width: 100%;
  border: var(--aui-hairline, 1px) solid var(--ui-cc-line);
  border-radius: 999px;
  background: var(--ui-cc-subtle);
  padding: 3px 4px 3px 9px;
  font-size: 0.72rem;
  color: var(--ui-cc-ink);
}
.ui-cc__chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-cc__chip-x {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-cc-muted);
  cursor: pointer;
}
.ui-cc__chip-x:hover { background: color-mix(in oklab, var(--ui-cc-ink) 10%, transparent); }

/* Toolbar */
.ui-cc__bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 calc(var(--cc-pad-x) - 8px) 6px;
  flex-wrap: wrap;
  row-gap: 8px;
}
.ui-cc__mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--cc-control);
  min-width: 0;
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: var(--ui-cc-radius-sm);
  background: var(--ui-cc-subtle);
}
.ui-cc__mode .ui-cc__label {
  font-size: var(--cc-small);
  white-space: nowrap;
}
.ui-cc__square {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--cc-control);
  height: var(--cc-control);
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-cc-muted);
  cursor: pointer;
  transition:
    background-color var(--ui-cc-duration) var(--ui-cc-ease),
    color var(--ui-cc-duration) var(--ui-cc-ease);
}
.ui-cc__square:hover, .ui-cc__square[data-open="true"] { background: var(--ui-cc-subtle); color: var(--ui-cc-ink); }
.ui-cc__square[data-armed="true"] { background: var(--ui-cc-subtle); color: var(--ui-cc-ink); }
.ui-cc__mode {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: var(--cc-control);
  min-width: 0;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in oklab, var(--ui-cc-ink) 78%, var(--ui-cc-muted));
  font-family: inherit;
  font-size: var(--cc-small);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--ui-cc-duration) var(--ui-cc-ease);
}
.ui-cc__mode:hover, .ui-cc__mode[data-open="true"] { background: var(--ui-cc-subtle); }
.ui-cc__mode--wait { color: var(--ui-cc-danger); }
.ui-cc__mode svg { flex: none; }
.ui-cc__label { overflow: hidden; text-overflow: ellipsis; }
.ui-cc__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.ui-cc__mic {
  display: grid;
  place-items: center;
  width: var(--cc-control);
  height: var(--cc-control);
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-cc-muted);
  cursor: pointer;
  transition: background-color var(--ui-cc-duration) var(--ui-cc-ease);
}
.ui-cc__mic:hover { background: var(--ui-cc-subtle); color: var(--ui-cc-ink); }
.ui-cc__mic[data-listening="true"] { background: var(--ui-cc-danger-soft); color: var(--ui-cc-danger); }
.ui-cc__mic:disabled { cursor: not-allowed; opacity: 0.5; }
.ui-cc__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  animation: ui-cc-pulse 1.1s var(--ui-cc-ease) infinite;
}
.ui-cc__send {
  display: grid;
  place-items: center;
  width: var(--cc-control);
  height: var(--cc-control);
  margin-left: 2px;
  border: 0;
  border-radius: 50%;
  background: color-mix(in oklab, var(--ui-cc-ink) 11%, transparent);
  color: var(--ui-cc-ink);
  cursor: pointer;
  transition:
    background-color var(--ui-cc-duration) var(--ui-cc-ease),
    opacity var(--ui-cc-duration) var(--ui-cc-ease);
}
.ui-cc__send:hover:not(:disabled) { background: color-mix(in oklab, var(--ui-cc-ink) 16%, transparent); }
.ui-cc__send:disabled { cursor: not-allowed; }
.ui-cc__send[data-ready="false"] { color: color-mix(in oklab, var(--ui-cc-muted) 80%, var(--ui-cc-ink)); }
.ui-cc__spin { animation: ui-cc-spin 1s linear infinite; }

/* Tray */
.ui-cc__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: var(--aui-hairline, 1px) solid color-mix(in oklab, var(--ui-cc-line) 70%, transparent);
  background: color-mix(in oklab, var(--ui-cc-subtle) 62%, var(--ui-cc-surface));
  padding: 8px calc(var(--cc-pad-x) - 8px);
  border-bottom-left-radius: calc(var(--ui-cc-radius) + 6px);
  border-bottom-right-radius: calc(var(--ui-cc-radius) + 6px);
}
.ui-cc__folder {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 62%;
  border: 0;
  border-radius: 9px;
  background: color-mix(in oklab, var(--ui-cc-ink) 4%, transparent);
  padding: 3px 5px;
  color: var(--ui-cc-muted);
  font-family: inherit;
  font-size: var(--cc-small);
  cursor: pointer;
}
.ui-cc__folder:hover, .ui-cc__folder[data-open="true"] { color: var(--ui-cc-ink); background: color-mix(in oklab, var(--ui-cc-ink) 5%, transparent); }
.ui-cc__folder-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-cc__apps {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  border: 0;
  border-radius: 9px;
  background: transparent;
  padding: 4px 6px;
  color: var(--ui-cc-muted);
  font-family: inherit;
  font-size: var(--cc-small);
  cursor: pointer;
}
.ui-cc__apps:hover, .ui-cc__apps[data-open="true"] { color: var(--ui-cc-ink); background: color-mix(in oklab, var(--ui-cc-ink) 6%, transparent); }
.ui-cc__marks { display: inline-flex; align-items: center; gap: 4px; }
.ui-cc__mark {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  overflow: hidden;
  border-radius: 5px;
}
.ui-cc__mark img { width: 100%; height: 100%; object-fit: contain; }
.ui-cc__more { font-size: 0.7rem; }
.ui-cc__tray-start {
  display: inline-flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.ui-cc__folder--ghost { font-size: calc(var(--cc-small) - 0.02rem); opacity: 0.9; }
.ui-cc__attachments { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ui-cc__chip-icon { display: inline-flex; flex: none; }
.ui-cc__chip-meta { color: var(--ui-cc-muted); font-size: 0.68rem; white-space: nowrap; }
.ui-cc__tools { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }

/* Shared focus + menus */
.ui-cc__square:focus-visible,
.ui-cc__mode:focus-visible,
.ui-cc__mic:focus-visible,
.ui-cc__send:focus-visible,
.ui-cc__folder:focus-visible,
.ui-cc__apps:focus-visible,
.ui-cc__chip-x:focus-visible,
.ui-cc__notice-close:focus-visible,
.ui-cc__option:focus-visible,
.ui-cc__app-row:focus-visible {
  outline: var(--aui-focus-width, 2px) solid var(--ui-cc-focus);
  outline-offset: var(--aui-focus-gap, 2px);
}
.ui-cc__pop {
  position: absolute;
  bottom: calc(100% + 8px);
  z-index: var(--aui-z-dropdown, 40);
  width: min(360px, calc(100% - 16px));
  max-height: min(430px, 64vh);
  overflow: auto;
  border: var(--aui-hairline, 1px) solid var(--ui-cc-line);
  border-radius: calc(var(--ui-cc-radius) + 2px);
  background: var(--ui-cc-surface);
  box-shadow: var(--aui-shadow-popover, 0 18px 40px -12px rgb(0 0 0 / 0.18));
  padding: 6px;
  animation: ui-cc-rise var(--ui-cc-duration) var(--ui-cc-ease);
  transform-origin: bottom left;
}
.ui-cc__pop--span { left: 0; right: 0; width: auto; }
.ui-cc__pop--start { left: 0; }
.ui-cc__pop--end { right: 0; }
.ui-cc__pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px 8px;
  color: var(--ui-cc-muted);
  font-size: 0.78rem;
}
.ui-cc__pop-head a,
.ui-cc__pop-head button {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--ui-cc-muted);
  font-family: inherit;
  font-size: 0.76rem;
  text-decoration: none;
  cursor: pointer;
}
.ui-cc__pop-head a:hover,
.ui-cc__pop-head button:hover { color: var(--ui-cc-ink); text-decoration: underline; }
.ui-cc__apps-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 8px 6px;
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--ui-cc-subtle);
  color: var(--ui-cc-muted);
}
.ui-cc__apps-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ui-cc-ink);
  font-family: inherit;
  font-size: var(--cc-small);
}
.ui-cc__apps-search input::placeholder { color: color-mix(in oklab, var(--ui-cc-muted) 85%, var(--ui-cc-surface)); }
.ui-cc__option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  border: 0;
  border-radius: var(--ui-cc-radius-sm);
  background: transparent;
  padding: 8px;
  color: var(--ui-cc-ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.ui-cc__option:hover:not(:disabled),
.ui-cc__option[data-active="true"]:not(:disabled) { background: var(--ui-cc-subtle); }
.ui-cc__option:disabled { cursor: not-allowed; opacity: 0.55; }  .ui-cc__option-icon { margin-top: 1px; flex: none; color: var(--ui-cc-muted); }
  .ui-cc__option-icon svg { display: block; }
  .ui-cc__option-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .ui-cc__option-title { font-size: 0.74rem; color: var(--ui-cc-ink); }
  .ui-cc__option-note { font-size: 0.62rem; line-height: 1.35; color: var(--ui-cc-muted); }
  .ui-cc__option[data-danger="true"] .ui-cc__option-icon,
  .ui-cc__option[data-danger="true"] .ui-cc__option-title { color: var(--ui-cc-danger); }
  .ui-cc__option-check { margin-left: auto; flex: none; color: var(--ui-cc-ink); }
  .ui-cc__app-row {
    display: flex; align-items: center; gap: 10px; width: 100%; border: 0;
    border-radius: var(--ui-cc-radius-sm); background: transparent; padding: 7px 8px;
    color: var(--ui-cc-ink); font-family: inherit; font-size: 0.74rem; text-align: left;
    text-decoration: none; cursor: pointer;
  }
  .ui-cc__app-row:hover, .ui-cc__app-row[data-active="true"] { background: var(--ui-cc-subtle); }
  .ui-cc__app-row[data-armed="true"] { background: var(--ui-cc-danger-soft); color: var(--ui-cc-danger); }
  .ui-cc__app-row .ui-cc__option-check { margin-left: auto; }
  .ui-cc__app-note { color: var(--ui-cc-muted); font-size: 0.62rem; margin-left: auto; }
  .ui-cc__pop-head-sub { color: color-mix(in oklab, var(--ui-cc-muted) 82%, var(--ui-cc-ink)); font-size: 0.6rem; margin-left: auto; }
  .ui-cc__pop-foot {
    display: flex; justify-content: space-between; gap: 10px; margin-top: 4px;
    border-top: var(--aui-hairline, 1px) solid var(--ui-cc-line); padding: 8px 8px 2px;
    font-size: 0.62rem;
  }
  .ui-cc__pop-foot a { color: color-mix(in oklab, var(--ui-cc-primary) 82%, var(--ui-cc-ink)); text-decoration: none; }
  .ui-cc__pop-foot a:hover { text-decoration: underline; }
  .ui-cc__empty { padding: 8px; font-size: 0.72rem; color: var(--ui-cc-muted); }


.ui-cc__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.ui-cc__modes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ui-cc__plan {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-cc-primary) 9%, transparent);
  color: color-mix(in oklab, var(--ui-cc-primary) 88%, var(--ui-cc-ink));
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 600;
}
@keyframes ui-cc-spin { to { transform: rotate(360deg); } }
@keyframes ui-cc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes ui-cc-rise { from { opacity: 0; transform: translateY(6px) scale(0.99); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .ui-cc *, .ui-cc { animation: none !important; transition: none !important; }
}
@container (max-width: 560px) {
  .ui-cc__footer { flex-wrap: wrap; row-gap: 4px; }
  .ui-cc__folder { max-width: 100%; }
  .ui-cc__apps { padding-inline: 4px; }
  .ui-cc__pop { width: min(340px, calc(100% - 8px)); }
}
@container (max-width: 470px) {
  .ui-cc__shell { --cc-pad: 12px; --cc-pad-x: 14px; }
  .ui-cc__mode .ui-cc__label { display: none; }
  .ui-cc__mode { padding: 0 7px; }
  .ui-cc__folder { max-width: 100%; padding-inline: 4px; }
  .ui-cc__input { min-height: 38px; }
  .ui-cc__pop { max-height: min(320px, 52vh); }
}
@container (max-width: 380px) {
  .ui-cc__folder .ui-cc__folder-name { max-width: 8.5rem; }
  .ui-cc__apps .ui-cc__apps-label { display: none; }
  .ui-cc__mark { width: 16px; height: 16px; }
  .ui-cc__input { min-height: 36px; }
  /* Too narrow for one row: the model/tool controls take their own line. */
  .ui-cc__bar { flex-wrap: wrap; row-gap: 4px; gap: 1px; padding-inline: calc(var(--cc-pad-x) - 10px); }
  .ui-cc__right { width: 100%; margin-left: 0; justify-content: flex-end; }
  .ui-cc__send { margin-left: 0; }
  .ui-cc__option-note { font-size: 0.72rem; }
  .ui-cc__pop-head { padding: 4px 8px 6px; font-size: 0.74rem; }
}
`;

/**
 * The folder the original composer shows: a bright two-tone blue mark, not a
 * line icon, so the files row reads as an object rather than a control.
 */
function FolderMark({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#2f8bec"
        d="M2.6 6.9c0-1.16.94-2.1 2.1-2.1h4.03c.6 0 1.17.25 1.58.69l.9.97c.2.22.5.35.8.35h6.28c1.16 0 2.1.94 2.1 2.1v9.5c0 1.16-.94 2.1-2.1 2.1H4.7a2.1 2.1 0 0 1-2.1-2.1V6.9Z"
      />
      <path
        fill="#5eb0ff"
        d="M4.3 9.35h15.4c1.05 0 1.9.85 1.9 1.9v6.9c0 1.16-.94 2.1-2.1 2.1H4.7a2.1 2.1 0 0 1-2.1-2.1v-6.9c0-1.05.85-1.9 1.9-1.9Z"
      />
    </svg>
  );
}

function AppMark({ app }: { app: ChatComposerApp }) {
  return (
    <span className="ui-cc__mark" title={app.name}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark is a remote SVG from Composio's logo CDN */}
      <img
        src={`https://logos.composio.dev/api/${app.slug}`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </span>
  );
}

export function ChatComposer({
  value,
  onValueChange,
  onSend,
  placeholder = "Start by typing…",
  busy = false,
  disabled = false,
  attachments = [],
  onRemoveAttachment,
  onAttach,
  onAttachFolder,
  onAttachProject,
  addAction = null,
  onAddActionChange,
  tools,
  error = null,
  apps = [],
  appsHref = "/dashboard/apps",
  onConnectApp,
  onDisconnectApp,
  approvals,
  approvalMode = "ask",
  onApprovalModeChange,
  approvalSaving = false,
  inputRef,
  voice = true,
  tray = true,
  className,
}: ChatComposerProps) {
  const uid = useId().replace(/:/g, "");
  const localRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? localRef;
  const shellRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const approvalRef = useRef<HTMLButtonElement>(null);
  const appsTriggerRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<VoiceRecognition | null>(null);

  const [menu, setMenu] = useState<MenuName>(null);
  const [active, setActive] = useState(0);
  const [optimisticApps, setOptimisticApps] = useState<string[] | null>(null);
  const [armedApp, setArmedApp] = useState<string | null>(null);
  const [appQuery, setAppQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [plan, setPlan] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const connectedSlugs = optimisticApps ?? apps.filter((app) => app.connected).map((app) => app.slug);
  const connected = apps.filter((app) => connectedSlugs.includes(app.slug));
  const appSearch = appQuery.trim().toLowerCase();
  const filteredApps = appSearch
    ? apps.filter(
        (app) =>
          app.name.toLowerCase().includes(appSearch) ||
          app.slug.toLowerCase().includes(appSearch),
      )
    : apps;
  const pendingApprovals = approvals?.pending ?? 0;
  // An armed record option can turn an empty field into a form, so the send
  // button stays available for it; a diagram still needs something to draw.
  const canSend =
    (value.trim().length > 0 || (addAction !== null && addAction !== "diagram")) &&
    !busy &&
    !disabled;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scope = window as unknown as {
      SpeechRecognition?: VoiceConstructor;
      webkitSpeechRecognition?: VoiceConstructor;
    };
    setVoiceSupported(Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition));
  }, []);

  // Follow the server list whenever the chat refreshes it.
  useEffect(() => {
    setOptimisticApps(null);
  }, [apps]);

  const closeMenu = useCallback((returnFocus = false) => {
    setMenu((current) => {
      if (returnFocus) {
        const trigger =
          current === "plus" ? plusRef.current : current === "approval" ? approvalRef.current : appsTriggerRef.current;
        requestAnimationFrame(() => trigger?.focus());
      }
      return null;
    });
    setActive(0);
    setArmedApp(null);
  }, []);

  useEffect(() => {
    if (!menu) return;

    function onPointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) closeMenu(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menu, closeMenu]);

  // Grow with the text up to the max height, then scroll inside the field.
  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 56), 132)}px`;
  }, [value, textareaRef]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  function send() {
    if (!canSend) return;
    onSend(value.trim(), { plan, action: addAction });
    // A record option keeps the draft until its form is confirmed (the parent
    // clears it then); every other send hands the text off and empties here.
    const keepsDraft = addAction === "task" || addAction === "skill" || addAction === "plugin";
    if (!keepsDraft) onValueChange("");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      return;
    }

    const scope = window as unknown as {
      SpeechRecognition?: VoiceConstructor;
      webkitSpeechRecognition?: VoiceConstructor;
    };
    const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceNotice("This browser has no dictation. Chrome and Edge do; Safari has it behind a flag.");
      return;
    }

    setVoiceNotice(null);

    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.[0]?.transcript) transcript += result[0].transcript;
      }
      const spoken = transcript.trim();
      if (!spoken) return;
      const next = value ? `${value.trimEnd()} ${spoken}` : spoken;
      onValueChange(next);
      setAnnouncement("Dictation added to the message.");
    };
    recognition.onerror = (event) => {
      const code = event.error ?? "";
      setVoiceNotice(VOICE_ERRORS[code] ?? "Dictation stopped unexpectedly. Try again.");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setVoiceNotice("Dictation couldn't start. Check the microphone permission.");
    }
  }

  /** Arms an option, or clears it when it is already the armed one. */
  function chooseAction(next: ChatComposerAddAction) {
    const already = addAction === next;
    onAddActionChange?.(already ? null : next);
    setAnnouncement(
      already
        ? `${ADD_ACTION_LABELS[next]} cleared.`
        : `${ADD_ACTION_LABELS[next]} armed for the next message.`,
    );
  }

  function openMenu(name: Exclude<MenuName, null>, index = 0) {
    setMenu(name);
    setActive(index);
    setArmedApp(null);
    if (name === "apps") setAppQuery("");
  }

  function toggleMenu(name: Exclude<MenuName, null>) {
    if (menu === name) closeMenu(false);
    else openMenu(name);
  }

  async function toggleApp(app: ChatComposerApp) {
    const isConnected = connectedSlugs.includes(app.slug);

    if (!onConnectApp && !onDisconnectApp) return;

    if (!isConnected) {
      closeMenu(false);
      setOptimisticApps([...connectedSlugs, app.slug]);
      setAnnouncement(`Connecting ${app.name}…`);
      try {
        await onConnectApp?.(app.slug);
      } catch {
        setOptimisticApps(connectedSlugs);
        setAnnouncement(`We couldn't connect ${app.name}.`);
      }
      return;
    }

    if (armedApp !== app.slug) {
      setArmedApp(app.slug);
      setAnnouncement(`Press again to disconnect ${app.name}.`);
      return;
    }

    closeMenu(false);
    setOptimisticApps(connectedSlugs.filter((slug) => slug !== app.slug));
    setAnnouncement(`Disconnecting ${app.name}…`);
    try {
      await onDisconnectApp?.(app.slug);
    } catch {
      setOptimisticApps(connectedSlugs);
      setAnnouncement(`We couldn't disconnect ${app.name}.`);
    }
  }

  const menuId = (name: string) => `ui-cc-${uid}-${name}`;

  type ComposerMenuItem = { id: string; disabled?: boolean; run?: () => void };

  /** The entries of whichever menu is open, in visual order. */
  function itemsFor(current: NonNullable<MenuName>): ComposerMenuItem[] {
    if (current === "plus") {
      return [
        { id: "files", run: () => { closeMenu(false); onAttach?.(); } },
        {
          id: "folder",
          disabled: !onAttachFolder,
          run: () => {
            closeMenu(false);
            onAttachFolder?.();
          },
        },
        {
          id: "task",
          disabled: !onAddActionChange,
          run: () => {
            closeMenu(false);
            chooseAction("task");
          },
        },
        {
          id: "plan",
          run: () => {
            const next = !plan;
            setPlan(next);
            setAnnouncement(next ? "Plan mode on. The agent outlines the steps first." : "Plan mode off.");
          },
        },
        {
          id: "skill",
          disabled: !onAddActionChange,
          run: () => {
            closeMenu(false);
            chooseAction("skill");
          },
        },
        {
          id: "plugin",
          disabled: !onAddActionChange,
          run: () => {
            closeMenu(false);
            chooseAction("plugin");
          },
        },
        {
          id: "draw",
          disabled: !onAddActionChange,
          run: () => {
            closeMenu(false);
            chooseAction("diagram");
          },
        },
        { id: "apps", run: () => (apps.length > 0 ? openMenu("apps", 0) : closeMenu(false)) },
        {
          id: "project",
          disabled: !onAttachProject,
          run: () => {
            closeMenu(false);
            onAttachProject?.();
          },
        },
      ];
    }

    if (current === "approval") {
      return [
        { id: "ask", run: () => closeMenu(true) },
        { id: "auto", disabled: true },
        { id: "full", disabled: true },
      ];
    }

    return apps.map((app) => ({ id: app.slug, run: () => void toggleApp(app) }));
  }

  /**
   * The documented keyboard map. Keys are handled on the composer, not on the
   * popover, because focus stays on the trigger that opened the menu.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!menu) return;

    const field = textareaRef.current;
    // Typing keeps the field's own keys; only Esc leaves an open menu from it.
    if (field && event.target === field && event.key !== "Escape") return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === "Tab") {
      closeMenu(false);
      return;
    }

    const items = itemsFor(menu);
    if (items.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      let next = active;
      for (let tries = 0; tries < items.length; tries += 1) {
        next = (next + step + items.length) % items.length;
        if (!items[next]?.disabled) break;
      }
      setActive(next);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : items.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      const item = items[active];
      event.preventDefault();
      if (!item || item.disabled) return;
      item.run?.();
    }
  }

  return (
    <div className={cn("ui-cc", className)} onKeyDown={handleKeyDown}>
      <style>{COMPOSER_CSS}</style>

      <p className="ui-cc__sr" role="status" aria-live="polite">
        {announcement}
      </p>
      {listening ? (
        <p className="ui-cc__sr" role="status" aria-live="polite">
          Recording. Speak now.
        </p>
      ) : null}

      {(error || voiceNotice) && (
        <div className="ui-cc__notices">
          {error ? (
            <p role="alert" className="ui-cc__notice" data-tone="error">
              {error}
            </p>
          ) : null}
          {voiceNotice ? (
            <p role="status" className="ui-cc__notice" data-tone="voice">
              <span>{voiceNotice}</span>
              <button
                type="button"
                className="ui-cc__notice-close"
                onClick={() => setVoiceNotice(null)}
                aria-label="Dismiss dictation message"
              >
                <X size={11} aria-hidden="true" />
              </button>
            </p>
          ) : null}
        </div>
      )}

      <div className="ui-cc__shell" ref={shellRef}>
        <div
          className="ui-cc__main"
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, a, textarea, input")) return;
            textareaRef.current?.focus();
          }}
        >
          {attachments.length > 0 ? (
            <div className="ui-cc__attachments">
              {attachments.map((item) => (
                <span key={item.id} className="ui-cc__chip">
                  <span className="ui-cc__chip-icon" aria-hidden="true">
                    {item.kind === "folder" ? (
                      <FolderMark size={13} />
                    ) : (
                      <Paperclip size={11} aria-hidden="true" />
                    )}
                  </span>
                  <span className="ui-cc__chip-name">{item.name}</span>
                  {item.kind === "folder" && item.count && item.count > 1 ? (
                    <span className="ui-cc__chip-meta">{item.count} files</span>
                  ) : null}
                  <button
                    type="button"
                    className="ui-cc__chip-x"
                    onClick={() => onRemoveAttachment?.(item.id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {plan || addAction ? (
            <div className="ui-cc__modes">
              {plan ? (
                <span className="ui-cc__plan">
                  <ListChecks size={12} aria-hidden="true" />
                  Plan mode
                  <button
                    type="button"
                    className="ui-cc__chip-x"
                    onClick={() => {
                      setPlan(false);
                      setAnnouncement("Plan mode off.");
                    }}
                    aria-label="Turn plan mode off"
                  >
                    <X size={10} aria-hidden="true" />
                  </button>
                </span>
              ) : null}
              {addAction ? (
                <span className="ui-cc__plan">
                  {addAction === "task" ? (
                    <ListTodo size={12} aria-hidden="true" />
                  ) : addAction === "skill" ? (
                    <Sparkles size={12} aria-hidden="true" />
                  ) : addAction === "plugin" ? (
                    <Code2 size={12} aria-hidden="true" />
                  ) : (
                    <PenTool size={12} aria-hidden="true" />
                  )}
                  {ADD_ACTION_LABELS[addAction]}
                  <button
                    type="button"
                    className="ui-cc__chip-x"
                    onClick={() => {
                      onAddActionChange?.(null);
                      setAnnouncement(`${ADD_ACTION_LABELS[addAction]} cleared.`);
                    }}
                    aria-label={`Turn off ${ADD_ACTION_LABELS[addAction]}`}
                  >
                    <X size={10} aria-hidden="true" />
                  </button>
                </span>
              ) : null}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            className="ui-cc__input"
            rows={1}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            aria-label="Message"
            disabled={disabled}
          />

          <div className="ui-cc__bar">
            {onAttach ? (
              <button
                type="button"
                ref={plusRef}
                className="ui-cc__square"
                data-open={menu === "plus" ? "true" : "false"}
                onClick={() => toggleMenu("plus")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    openMenu("plus");
                  }
                }}
                aria-haspopup="menu"
                aria-expanded={menu === "plus"}
                aria-controls={menu === "plus" ? menuId("plus") : undefined}
                aria-label="Add"
                title="Add"
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            ) : null}

            <button
              type="button"
              ref={approvalRef}
              className="ui-cc__mode"
              data-open={menu === "approval" ? "true" : "false"}
              aria-haspopup="listbox"
              aria-expanded={menu === "approval"}
              aria-controls={menu === "approval" ? menuId("approval") : undefined}
              onClick={() => toggleMenu("approval")}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  openMenu("approval");
                }
              }}
              title="How should actions be approved?"
            >
              {approvalMode === "full" ? (
                <ShieldAlert size={14} aria-hidden="true" />
              ) : approvalMode === "auto" ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Hand size={14} aria-hidden="true" />
              )}
              <span className="ui-cc__label">
                {AGENT_APPROVAL_MODES.find((mode) => mode.id === approvalMode)?.label ??
                  "Request approval"}
              </span>
            </button>

            {pendingApprovals > 0 ? (
              <button
                type="button"
                className="ui-cc__mode ui-cc__mode--wait"
                onClick={approvals?.onReview}
                title="The agent is waiting for your approval"
              >
                <ShieldAlert size={13} aria-hidden="true" />
                <span className="ui-cc__label">{pendingApprovals} waiting</span>
              </button>
            ) : null}

            <div className="ui-cc__right">
              {tools ? <div className="ui-cc__tools">{tools}</div> : null}

              {apps.length > 0 ? (
                <button
                  type="button"
                  ref={appsTriggerRef}
                  className="ui-cc__apps"
                  data-open={menu === "apps" ? "true" : "false"}
                  aria-haspopup="menu"
                  aria-expanded={menu === "apps"}
                  aria-controls={menu === "apps" ? menuId("apps") : undefined}
                  title={
                    connected.length > 0
                      ? `${connected.map((app) => app.name).join(", ")} — open to connect another`
                      : "Connect an app"
                  }
                  aria-label={
                    connected.length > 0
                      ? `${connected.length} apps connected to this workspace. Open to connect another.`
                      : "Connect an app"
                  }
                  onClick={() => toggleMenu("apps")}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      openMenu("apps");
                    }
                  }}
                >
                  {connected.length > 0 ? (
                    <span className="ui-cc__marks" aria-hidden="true"              >
              {connected.slice(0, 3).map((app) => (
                <AppMark key={app.slug} app={app} />
                      ))}
                      {connected.length > 3 ? (
                        <span className="ui-cc__more">+{connected.length - 3}</span>
                      ) : null}
                    </span>
                  ) : (
                    <Plug size={13} aria-hidden="true" />
                  )}
                </button>
              ) : (
                <a className="ui-cc__apps" href={appsHref} title="Connect apps">
                  <Plug size={13} aria-hidden="true" />
                </a>
              )}

              {voice ? (
                <button
                  type="button"
                  className="ui-cc__mic"
                  data-listening={listening ? "true" : "false"}
                  onClick={toggleListening}
                  disabled={disabled || !voiceSupported}
                  aria-pressed={listening}
                  aria-label={listening ? "Stop dictation" : "Dictate a message"}
                  title={
                    voiceSupported
                      ? listening
                        ? "Stop dictation"
                        : "Dictate a message"
                      : "This browser doesn't support dictation"
                  }
                >
                  {listening ? (
                    <span className="ui-cc__dot" aria-hidden="true" />
                  ) : (
                    <Mic size={17} aria-hidden="true" />
                  )}
                </button>
              ) : null}

              <button
                type="button"
                className="ui-cc__send"
                data-ready={canSend ? "true" : "false"}
                onClick={send}
                disabled={!canSend}
                aria-label={busy ? "Sending message" : "Send message"}
              >
                {busy ? (
                  <Loader2 size={16} className="ui-cc__spin" aria-hidden="true" />
                ) : (
                  <ArrowUp size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>

        {tray ? (
          <div className="ui-cc__footer">
            <div className="ui-cc__tray-start">
              {onAttach ? (
                <button type="button" className="ui-cc__folder" onClick={onAttach}>
                  <FolderMark size={18} />
                  <span className="ui-cc__folder-name">
                    {attachments.length > 0
                      ? `${attachments.length} attached`
                      : "Files and folders"}
                  </span>
                </button>
              ) : null}

              {onAttachFolder ? (
                <button
                  type="button"
                  className="ui-cc__folder ui-cc__folder--ghost"
                  onClick={onAttachFolder}
                  title="Upload a folder and everything inside it"
                >
                  <FolderOpen size={15} aria-hidden="true" />
                  <span className="ui-cc__folder-name">Work in a folder</span>
                </button>
              ) : null}
            </div>

          </div>
        ) : null}

        {menu === "plus" ? (
          <div
            id={menuId("plus")}
            className="ui-cc__pop ui-cc__pop--span"
            role="menu"
            aria-label="Add"
            aria-activedescendant={menuId(`plus-${active}`                      )}
            >
            <div className="ui-cc__pop-head">
              <span>Add</span>
              <span>
                {attachments.length > 0 ? `${attachments.length} attached` : "to this message"}
              </span>
            </div>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-0")}
              className="ui-cc__option"
              data-active={active === 0 ? "true" : "false"}
              onMouseEnter={() => setActive(0)}
              onClick={() => {
                closeMenu(false);
                onAttach?.();
              }}
            >
              <Paperclip size={16} className="ui-cc__option-icon" aria-hidden="true" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Files and folders</span>
                <span className="ui-cc__option-note">Attach one or more files to this message</span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-1")}
              className="ui-cc__option"
              data-active={active === 1 ? "true" : "false"}
              onMouseEnter={() => setActive(1)}
              disabled={!onAttachFolder}
              onClick={() => {
                closeMenu(false);
                onAttachFolder?.();
              }}
            >
              <FolderMark size={18} className="ui-cc__option-folder" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Work in a folder</span>
                <span className="ui-cc__option-note">
                  Upload a folder and the files inside it
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-2")}
              className="ui-cc__option"
              data-active={active === 2 ? "true" : "false"}
              onMouseEnter={() => setActive(2)}
              disabled={!onAddActionChange}
              onClick={() => {
                closeMenu(false);
                chooseAction("task");
              }}
            >
              <ListTodo size={17} className="ui-cc__option-icon" aria-hidden="true" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Add as a task</span>
                <span className="ui-cc__option-note">
                  {value.trim()
                    ? "Turn this message into a card on the board"
                    : "Start a card the board will keep"}
                </span>
              </span>
              {addAction === "task" ? (
                <Check size={16} className="ui-cc__option-check" aria-hidden="true" />
              ) : null}
            </button>

            <button
              type="button"
              role="menuitemcheckbox"
              id={menuId("plus-3")}
              aria-checked={plan}
              className="ui-cc__option"
              data-active={active === 3 ? "true" : "false"}
              onMouseEnter={() => setActive(3)}
              onClick={() => {
                const next = !plan;
                setPlan(next);
                setAnnouncement(next ? "Plan mode on. The agent outlines the steps first." : "Plan mode off.");
              }}
            >
              <ListChecks size={17} className="ui-cc__option-icon" aria-hidden="true" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Plan mode</span>
                <span className="ui-cc__option-note">Outline the steps before acting</span>
              </span>
              {plan ? <Check size={16} className="ui-cc__option-check" aria-hidden="true" /> : null}
            </button>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-4")}
              className="ui-cc__option"
              data-active={active === 4 ? "true" : "false"}
              onMouseEnter={() => setActive(4)}
              disabled={!onAddActionChange}
              onClick={() => {
                closeMenu(false);
                chooseAction("skill");
              }}
            >
              <Sparkles size={17} className="ui-cc__option-icon" aria-hidden="true" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Save as a skill</span>
                <span className="ui-cc__option-note">
                  {value.trim()
                    ? "Turn this message into a reusable playbook"
                    : "Write a playbook every agent can load"}
                </span>
              </span>
              {addAction === "skill" ? (
                <Check size={16} className="ui-cc__option-check" aria-hidden="true" />
              ) : null}
            </button>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-5")}
              className="ui-cc__option"
              data-active={active === 5 ? "true" : "false"}
              onMouseEnter={() => setActive(5)}
              disabled={!onAddActionChange}
              onClick={() => {
                closeMenu(false);
                chooseAction("plugin");
              }}
            >
              <Code2 size={17} className="ui-cc__option-icon" aria-hidden="true" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Save as a plugin</span>
                <span className="ui-cc__option-note">
                  Turn this message into a tool that calls an endpoint
                </span>
              </span>
              {addAction === "plugin" ? (
                <Check size={16} className="ui-cc__option-check" aria-hidden="true" />
              ) : null}
            </button>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-6")}
              className="ui-cc__option"
              data-active={active === 6 ? "true" : "false"}
              onMouseEnter={() => setActive(6)}
              disabled={!onAddActionChange}
              onClick={() => {
                closeMenu(false);
                chooseAction("diagram");
              }}
            >
              <PenTool size={17} className="ui-cc__option-icon" aria-hidden="true" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Draw a diagram</span>
                <span className="ui-cc__option-note">
                  {value.trim()
                    ? "Ask for this as an Archify diagram"
                    : "Ask for an interactive diagram drawn with Archify"}
                </span>
              </span>
              {addAction === "diagram" ? (
                <Check size={16} className="ui-cc__option-check" aria-hidden="true" />
              ) : null}
            </button>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-7")}
              className="ui-cc__option"
              data-active={active === 7 ? "true" : "false"}
              onMouseEnter={() => setActive(7)}
            onClick={() => {
              if (apps.length > 0) openMenu("apps", 0);
              else closeMenu(false);
            }}
          >
              {apps.length > 0 ? (
                <span className="ui-cc__marks">
                  {connected.slice(0, 3).map((app) => (
                    <AppMark key={app.slug} app={app} />
                  ))}
                  {connected.length > 3 ? (
                    <span className="ui-cc__more">+{connected.length - 3}</span>
                  ) : null}
                </span>
              ) : (
                <Plug size={13} className="ui-cc__option-icon" aria-hidden="true" />
              )}
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Apps</span>
                <span className="ui-cc__option-note">
                  {connected.length > 0
                    ? `${connected.length} apps connected to this workspace`
                    : "Connect the apps this agent may use"}
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              id={menuId("plus-8")}
              className="ui-cc__option"
              data-active={active === 8 ? "true" : "false"}
              onMouseEnter={() => setActive(8)}
              disabled={!onAttachProject}
              onClick={() => {
                closeMenu(false);
                onAttachProject?.();
              }}
            >
              <FolderOpen size={17} className="ui-cc__option-icon" aria-hidden="true" />
              <span className="ui-cc__option-body">
                <span className="ui-cc__option-title">Open a project folder</span>
                <span className="ui-cc__option-note">
                  Attach a folder on this machine or clone a GitHub repository
                </span>
              </span>
            </button>

            {apps.length === 0 ? (
              <div className="ui-cc__pop-foot">
                <span />
                <a href={appsHref}>Open Apps</a>
              </div>
            ) : null}

          </div>
        ) : null}

        {menu === "approval" ? (          <div
            id={menuId("approval")}
            className="ui-cc__pop ui-cc__pop--start"
            role="listbox"
            aria-label="How should actions be approved?"
            aria-activedescendant={menuId(`approval-${active}`                      )}
            >
            <div className="ui-cc__pop-head">
              <span>How should actions be approved?</span>
              <span className="ui-cc__pop-head-sub">
                {approvalSaving ? "Saving…" : "Saved to this agent"}
              </span>
            </div>

            {AGENT_APPROVAL_MODES.map((mode, index) => {
              const selected = mode.id === approvalMode;
              const Icon = mode.id === "full" ? ShieldAlert : mode.id === "auto" ? Check : Hand;

              return (
                <button
                  key={mode.id}
                  type="button"
                  role="option"
                  id={menuId(`approval-${index}`)}
                  aria-selected={selected}
                  aria-disabled={!onApprovalModeChange || approvalSaving ? "true" : undefined}
                  className="ui-cc__option"
                  data-active={active === index ? "true" : "false"}
                  data-danger={mode.id === "full" ? "true" : undefined}
                  onMouseEnter={() => setActive(index)}
                  disabled={!onApprovalModeChange || approvalSaving}
                  onClick={() => {
                    onApprovalModeChange?.(mode.id);
                    closeMenu(true);
                  }}
                >
                  <Icon size={14} className="ui-cc__option-icon" aria-hidden="true" />
                  <span className="ui-cc__option-body">
                    <span className="ui-cc__option-title">{mode.label}</span>
                    <span className="ui-cc__option-note">{mode.note}</span>
                  </span>
                  {selected ? (
                    <Check size={14} className="ui-cc__option-check" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}

          </div>
        ) : null}

        {menu === "apps" ? (
          <div
            id={menuId("apps")}
            className="ui-cc__pop ui-cc__pop--end"
            role="menu"
            aria-label="Apps"
            aria-activedescendant={menuId(`apps-${active}`                      )}
            >
            <div className="ui-cc__pop-head">
              <span>Apps</span>
              <span>
                {connected.length} of {apps.length}
              </span>
            </div>

            {apps.length > 0 ? (
              <label className="ui-cc__apps-search">
                <Search size={13} aria-hidden="true" />
                <input
                  value={appQuery}
                  onChange={(event) => setAppQuery(event.target.value)}
                  placeholder="Search apps"
                  aria-label="Search apps to connect"
                  autoFocus
                />
              </label>
            ) : null}

            {apps.length === 0 ? (
              <p className="ui-cc__empty">No apps are in the catalog yet.</p>
            ) : filteredApps.length === 0 ? (
              <p className="ui-cc__empty">No app matches “{appQuery.trim()}”.</p>
            ) : (
              filteredApps.map((app, index) => {
                const isConnected = connectedSlugs.includes(app.slug);
                const canToggle = Boolean(isConnected ? onDisconnectApp : onConnectApp);

                if (!canToggle) {
                  return (
                    <a key={app.slug} href={appsHref} className="ui-cc__app-row" role="menuitem">
                      <AppMark app={app} />
                      <span>{app.name}</span>
                      {isConnected ? (
                        <Check size={16} className="ui-cc__option-check" aria-hidden="true" />
                      ) : (
                        <span className="ui-cc__app-note">Not connected</span>
                      )}
                    </a>
                  );
                }                return (
                  <button
                    key={app.slug}
                    type="button"
                    role="menuitemcheckbox"
                    id={menuId(`apps-${index}`)}
                    aria-checked={isConnected}
                    className="ui-cc__app-row"
                    data-active={active === index ? "true" : "false"}
                    data-armed={armedApp === app.slug ? "true" : "false"}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => void toggleApp(app)}                onKeyDown={(event) => {
                if (event.key === "Space" || event.key === "Enter") {
                  event.preventDefault();
                  toggleApp(app);
                }
              }}
            >
              <AppMark app={app} />
                    <span>{app.name}</span>
                    {armedApp === app.slug ? (
                      <span className="ui-cc__app-note">Click again to disconnect</span>
                    ) : isConnected ? (
                      <Check size={16} className="ui-cc__option-check" aria-hidden="true" />
                    ) : (
                      <span className="ui-cc__app-note">Not connected</span>
                    )}

                  </button>
                );
              })
            )}


            <div className="ui-cc__pop-foot">
              <span />
              <a href={appsHref}>Manage apps</a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
