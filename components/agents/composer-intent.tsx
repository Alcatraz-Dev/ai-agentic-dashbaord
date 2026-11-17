"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ComposerIntent = {
  /** Text the composer should hold, and a token that changes per request. */
  text: string;
  token: number;
};

type ComposerIntentValue = ComposerIntent & {
  /** Puts text in the chat composer without sending it. */
  prefill: (text: string) => void;
};

const ComposerIntentContext = createContext<ComposerIntentValue | null>(null);

/**
 * Lets a sibling pane (the template workbench) drop a prompt into the chat
 * composer. The text is only ever placed in the field — the owner still decides
 * to send it, so a chip can never trigger a model turn on its own.
 */
export function ComposerIntentProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<ComposerIntent>({ text: "", token: 0 });
  const prefill = useCallback((text: string) => {
    setIntent((current) => ({ text, token: current.token + 1 }));
  }, []);

  const value = useMemo(() => ({ ...intent, prefill }), [intent, prefill]);

  return <ComposerIntentContext.Provider value={value}>{children}</ComposerIntentContext.Provider>;
}

export function useComposerIntent(): ComposerIntentValue | null {
  return useContext(ComposerIntentContext);
}

/**
 * Runs `onPrefill` once per request. Skips the provider's initial empty state,
 * so mounting the chat never overwrites a restored draft.
 */
export function useComposerPrefill(onPrefill: (text: string) => void) {
  const intent = useContext(ComposerIntentContext);
  const handler = useRef(onPrefill);
  handler.current = onPrefill;
  const seen = useRef(0);

  useEffect(() => {
    if (!intent || intent.token === 0 || intent.token === seen.current) return;
    seen.current = intent.token;
    handler.current(intent.text);
  }, [intent]);
}
