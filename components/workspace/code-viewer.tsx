"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * CodeMirror 6 — read-only by default, a real editor while a file is a draft.
 *
 * The developer workbench reads files through the owner-checked project reader
 * and never writes from here: typing builds a draft, which is reviewed as a
 * patch and saved through the same hash-checked write the agent uses.
 *
 * The view is created once and then *reconfigured*: language, appearance and
 * editability each live in their own `Compartment`, and an external read (a new
 * file, a re-read after saving) replaces the document in place. Rebuilding the
 * state — the obvious `useEffect([content, dark, editable])` version — threw
 * away the caret, the scroll position and the undo stack on every change.
 *
 * Editing needs its own keymap: CodeMirror does not bind Enter, Tab, undo or
 * redo for you, so without `defaultKeymap` + `historyKeymap` a newline could
 * never be typed and nothing could be undone.
 *
 * Find is CodeMirror's own search panel (⌘F in both modes), because a reader
 * that cannot search a file is half a reader. Language packs are loaded on
 * demand, one per extension — Go, Rust, YAML and SQL included.
 *
 * Every CodeMirror package is imported inside the effect, so only a visit to the
 * developer template downloads the editor, and nothing touches the DOM on the
 * server.
 */

type LanguageId =
  | "js"
  | "ts"
  | "jsx"
  | "tsx"
  | "css"
  | "html"
  | "json"
  | "markdown"
  | "python"
  | "go"
  | "rust"
  | "yaml"
  | "sql"
  | "text";

const LANGUAGE_BY_EXTENSION: Record<string, LanguageId> = {
  js: "js",
  mjs: "js",
  cjs: "js",
  ts: "ts",
  mts: "ts",
  cts: "ts",
  jsx: "jsx",
  tsx: "tsx",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  py: "python",
  pyi: "python",
  go: "go",
  rs: "rust",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
};

function languageFor(filePath: string): LanguageId {
  const name = filePath.split("/").pop() ?? filePath;
  if (!name.includes(".")) return "text";
  const extension = name.split(".").pop()!.toLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}

/** Syntax hues on a light surface. */
const LIGHT = {
  keyword: "#7c3aed",
  operator: "#7c3aed",
  string: "#0f766e",
  comment: "#64748b",
  number: "#b45309",
  function: "#1d4ed8",
  type: "#0e7490",
  property: "#334155",
  punctuation: "#64748b",
  tag: "#b91c1c",
  attribute: "#b45309",
  heading: "#1d4ed8",
  link: "#0f766e",
  invalid: "#dc2626",
};

/** The same roles, lifted so they stay legible on a dark surface. */
const DARK = {
  keyword: "#c4b5fd",
  operator: "#c4b5fd",
  string: "#7dd3fc",
  comment: "#94a3b8",
  number: "#fbbf24",
  function: "#93c5fd",
  type: "#67e8f9",
  property: "#e2e8f0",
  punctuation: "#94a3b8",
  tag: "#fca5a5",
  attribute: "#fbbf24",
  heading: "#93c5fd",
  link: "#7dd3fc",
  invalid: "#fb7185",
};

/** The minimal structural surface this component uses, so no static import. */
type CodeMirrorView = {
  state: {
    doc: { toString: () => string; length: number };
    selection: { main: { head: number } };
  };
  dispatch: (spec: Record<string, unknown>) => void;
  focus: () => void;
  destroy: () => void;
};

type EditorApi = {
  /** Replace the document with what is now on disk (no-op when unchanged). */
  setDoc: (next: string, caret?: number | null) => void;
  setEditable: (next: boolean) => void;
  setTheme: (nextDark: boolean) => void;
  setLanguage: (id: LanguageId) => void;
  setChanges: (marks: { added: number[]; modified: number[] } | null) => void;
};

export function CodeViewer({
  content,
  filePath,
  maxHeight = "22rem",
  editable = false,
  caret = null,
  changedLines = null,
  onChange,
  onCursorChange,
  onSaveRequest,
}: {
  content: string;
  filePath: string;
  maxHeight?: string;
  /**
   * Where the caret was in this file last time it was open. The workbench keeps
   * one per tab, so switching tabs returns you to the line you were reading
   * instead of the top of the file.
   */
  caret?: number | null;
  /** Lines that differ from the last commit, drawn in the change gutter. */
  changedLines?: { added: number[]; modified: number[] } | null;
  /** Line, column and selection length, for the editor's status bar. */
  onCursorChange?: (info: {
    line: number;
    column: number;
    selected: number;
    head: number;
  }) => void;
  /**
   * Typing is allowed, but nothing is written from here: the workbench turns the
   * draft into a reviewed patch first. Read-only unless a real attached project
   * is open and the whole file fits the reader's cap.
   */
  editable?: boolean;
  onChange?: (value: string) => void;
  /** ⌘S / Ctrl+S while typing — the workbench opens its review with this. */
  onSaveRequest?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [dark, setDark] = useState(false);
  const [failed, setFailed] = useState(false);

  // The newest props, even when they arrive before the editor finished loading.
  const contentRef = useRef(content);
  contentRef.current = content;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const caretRef = useRef<number | null>(caret);
  caretRef.current = caret;
  const changesRef = useRef<{ added: number[]; modified: number[] } | null>(changedLines);
  changesRef.current = changedLines;
  const pathRef = useRef(filePath);
  pathRef.current = filePath;

  // Kept in refs so typing never rebuilds the editor for a new callback.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const cursorRef = useRef(onCursorChange);
  cursorRef.current = onCursorChange;
  const saveRef = useRef(onSaveRequest);
  saveRef.current = onSaveRequest;

  const apiRef = useRef<EditorApi | null>(null);
  // The meaningful identity of the marks: a new array with the same lines does
  // not need to reconfigure the editor.
  const changesKey = changedLines
    ? `${changedLines.added.join(",")}|${changedLines.modified.join(",")}`
    : "";

  // Appearance is the `.dark` class on <html>; follow it if it changes.
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // The editor is created once; everything below reconfigures it in place.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let created: CodeMirrorView | null = null;

    void (async () => {
      const [stateMod, viewMod, languageMod, highlightMod, commandsMod, searchMod] =
        await Promise.all([
          import("@codemirror/state"),
          import("@codemirror/view"),
          import("@codemirror/language"),
          import("@lezer/highlight"),
          import("@codemirror/commands"),
          import("@codemirror/search"),
        ]);
      if (cancelled) return;

      const { Compartment, EditorState, RangeSetBuilder } = stateMod;
      const {
        Decoration,
        EditorView,
        crosshairCursor,
        drawSelection,
        dropCursor,
        gutter,
        GutterMarker,
        highlightActiveLine,
        highlightSpecialChars,
        keymap,
        lineNumbers,
        rectangularSelection,
      } = viewMod;
      const {
        HighlightStyle,
        bracketMatching,
        foldGutter,
        indentOnInput,
        indentUnit,
        syntaxHighlighting,
      } = languageMod;
      const { tags } = highlightMod;
      const { defaultKeymap, history, historyKeymap, indentWithTab } = commandsMod;
      const { highlightSelectionMatches, search, searchKeymap } = searchMod;

      const languageCompartment = new Compartment();
      const themeCompartment = new Compartment();
      const editCompartment = new Compartment();
      // Reconfigured together with an external document replace, so undo can
      // never resurrect the copy of the file that was on disk before the save.
      const historyCompartment = new Compartment();
      // Diff marks for the gutter; empty means the file matches the last commit.
      const changesCompartment = new Compartment();

      /** Language + theme are one unit: the colours come from `dark`. */
      const buildTheme = (isDark: boolean) => {
        const colors = isDark ? DARK : LIGHT;

        const highlight = HighlightStyle.define([
          { tag: tags.keyword, color: colors.keyword },
          { tag: [tags.operatorKeyword, tags.modifier], color: colors.operator },
          { tag: [tags.string, tags.special(tags.string)], color: colors.string },
          {
            tag: [tags.comment, tags.lineComment, tags.blockComment],
            color: colors.comment,
            fontStyle: "italic",
          },
          { tag: [tags.number, tags.bool, tags.null], color: colors.number },
          {
            tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
            color: colors.function,
          },
          { tag: [tags.typeName, tags.className, tags.namespace], color: colors.type },
          {
            tag: [tags.propertyName, tags.variableName, tags.definition(tags.variableName)],
            color: colors.property,
          },
          { tag: [tags.punctuation, tags.bracket], color: colors.punctuation },
          { tag: [tags.tagName, tags.angleBracket], color: colors.tag },
          { tag: [tags.attributeName, tags.attributeValue], color: colors.attribute },
          {
            tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3],
            color: colors.heading,
            fontWeight: "600",
          },
          { tag: [tags.link, tags.url], color: colors.link, textDecoration: "underline" },
          { tag: [tags.emphasis], fontStyle: "italic" },
          { tag: [tags.strong], fontWeight: "600" },
          { tag: [tags.invalid], color: colors.invalid },
        ]);

        const theme = EditorView.theme(
          {
            "&": {
              color: "var(--foreground)",
              backgroundColor: "transparent",
              fontSize: "0.68rem",
              maxHeight: "var(--code-max-height, 22rem)",
            },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": {
              fontFamily: "var(--aui-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              lineHeight: "1.6",
              overflow: "auto",
            },
            ".cm-content": {
              padding: "0.4rem 0.5rem 0.4rem 0",
              caretColor: "var(--foreground)",
            },
            ".cm-gutters": {
              backgroundColor: "transparent",
              border: "none",
              color: "var(--muted-foreground)",
              paddingLeft: "0.4rem",
            },
            ".cm-lineNumbers .cm-gutterElement": {
              padding: "0 0.4rem 0 0",
              minWidth: "2rem",
            },
            ".cm-foldGutter .cm-gutterElement": { color: "var(--muted-foreground)" },
            ".cm-activeLine": {
              backgroundColor: "color-mix(in oklab, var(--primary) 8%, transparent)",
            },
            ".cm-activeLineGutter": { color: "var(--foreground)" },
            // Diff marks: an added or changed line is tinted and carries a 3px
            // bar in the gutter, so the change is obvious without a second view.
            ".cm-line-add": {
              backgroundColor: "color-mix(in oklab, var(--aui-green, #10b981) 11%, transparent)",
            },
            ".cm-line-mod": {
              backgroundColor: "color-mix(in oklab, var(--aui-blue, #2563eb) 10%, transparent)",
            },
            ".cm-changeGutter": { width: "3px", minWidth: "3px" },
            ".cm-changeGutter .cm-gutterElement": {
              padding: "0",
              width: "3px",
              minWidth: "3px",
            },
            ".cm-change-mark": {
              display: "block",
              width: "3px",
              height: "100%",
              borderRadius: "1px",
            },
            ".cm-change-add": { backgroundColor: "var(--aui-green, #10b981)" },
            ".cm-change-mod": { backgroundColor: "var(--aui-blue, #2563eb)" },
            ".cm-selectionBackground, ::selection": {
              backgroundColor: "color-mix(in oklab, var(--primary) 24%, transparent)",
            },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
            ".cm-matchingBracket, .cm-nonmatchingBracket": {
              backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
              outline: "none",
            },
            // The search panel is CodeMirror's own DOM; theme it from the app
            // tokens so it is legible in every palette and in dark mode.
            ".cm-panels": {
              backgroundColor: "var(--card)",
              color: "var(--foreground)",
              borderColor: "var(--border)",
            },
            ".cm-panel.cm-search": { padding: "0.35rem 0.5rem", fontSize: "0.66rem" },
            ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
              fontSize: "0.62rem",
            },
            ".cm-panel.cm-search input": {
              backgroundColor: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              padding: "0.1rem 0.35rem",
              color: "var(--foreground)",
              outline: "none",
            },
            ".cm-panel.cm-search input:focus": {
              borderColor: "var(--brand-border, var(--border))",
            },
            ".cm-panel.cm-search button": {
              backgroundColor: "var(--muted)",
              backgroundImage: "none",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              color: "var(--foreground)",
              padding: "0.1rem 0.4rem",
            },
            ".cm-panel.cm-search button:hover": {
              backgroundColor: "color-mix(in oklab, var(--primary) 14%, var(--muted))",
            },
            ".cm-panel.cm-search button[name=close]": {
              color: "var(--muted-foreground)",
              backgroundColor: "transparent",
              border: "none",
            },
            ".cm-searchMatch": {
              backgroundColor: "color-mix(in oklab, var(--primary) 24%, transparent)",
              outline: "1px solid color-mix(in oklab, var(--primary) 45%, transparent)",
            },
            ".cm-searchMatch.cm-searchMatch-selected": {
              backgroundColor: "color-mix(in oklab, var(--primary) 45%, transparent)",
            },
            ".cm-selectionMatch": {
              backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)",
            },
          },
          { dark: isDark },
        );

        return [theme, syntaxHighlighting(highlight)];
      };

      /**
       * The file against the last commit: a 3px marker in its own gutter plus a
       * faint line tint. Reconfigured in place, like the language and the theme.
       */
      const buildChanges = (marks: { added: number[]; modified: number[] } | null) => {
        const added = new Set(marks?.added ?? []);
        const modified = new Set(marks?.modified ?? []);

        // One shared marker per kind: CodeMirror compares them by identity.
        const addMarker = new (class extends GutterMarker {
          elementClass = "cm-change-mark cm-change-add";
        })();
        const modMarker = new (class extends GutterMarker {
          elementClass = "cm-change-mark cm-change-mod";
        })();

        return [
          gutter({
            class: "cm-changeGutter",
            lineMarker: (view, line) => {
              const number = view.state.doc.lineAt(line.from).number;
              if (added.has(number)) return addMarker;
              if (modified.has(number)) return modMarker;
              return null;
            },
          }),
          EditorView.decorations.compute(["doc"], (state) => {
            const builder = new RangeSetBuilder<ReturnType<typeof Decoration.line>>();
            for (let number = 1; number <= state.doc.lines; number += 1) {
              const kind = added.has(number)
                ? "cm-line-add"
                : modified.has(number)
                  ? "cm-line-mod"
                  : null;
              if (!kind) continue;
              const line = state.doc.line(number);
              builder.add(line.from, line.from, Decoration.line({ class: kind }));
            }
            return builder.finish();
          }),
        ];
      };

      /**
       * Read-only is not just a flag: the keymap is what makes Enter, Tab and
       * undo work at all, so it only exists while the file is a draft.
       */
      const buildEdit = (allow: boolean) => {
        const label = allow ? `Editing · ${pathRef.current}` : `Read-only code · ${pathRef.current}`;

        return [
          // `tabindex` keeps a read-only editor focusable: without it a click
          // lands on BODY and the Find shortcut never reaches the keymap.
          EditorView.contentAttributes.of({ "aria-label": label, tabindex: "0" }),
          EditorView.editable.of(allow),
          EditorState.readOnly.of(!allow),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
            // The status bar reads the caret, so it has to follow both typing and
            // plain movement (arrows, clicks, find matches).
            if (update.docChanged || update.selectionSet) {
              const { doc, selection } = update.state;
              const head = selection.main.head;
              const line = doc.lineAt(head);
              cursorRef.current?.({
                line: line.number,
                column: head - line.from + 1,
                selected: selection.main.to - selection.main.from,
                head,
              });
            }
          }),
          keymap.of(
            allow
              ? [
                  {
                    key: "Mod-s",
                    preventDefault: true,
                    run: () => {
                      saveRef.current?.();
                      return true;
                    },
                  },
                  ...defaultKeymap,
                  ...historyKeymap,
                  indentWithTab,
                ]
              : [],
          ),
          ...(allow ? [highlightActiveLine()] : []),
        ];
      };

      const state = EditorState.create({
        doc: contentRef.current,
        extensions: [
          changesCompartment.of(buildChanges(changesRef.current)),
          lineNumbers(),
          highlightSpecialChars(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          crosshairCursor(),
          foldGutter({ openText: "▾", closedText: "▸" }),
          bracketMatching(),
          indentOnInput(),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          historyCompartment.of(history()),
          search({ top: true }),
          highlightSelectionMatches(),
          // Bound in both modes: read-only files are exactly where find matters.
          keymap.of(searchKeymap),
          languageCompartment.of(await languageExtension(languageFor(pathRef.current))),
          themeCompartment.of(buildTheme(darkRef.current)),
          editCompartment.of(buildEdit(editableRef.current)),
          EditorView.lineWrapping,
        ],
      });

      if (cancelled || !hostRef.current) return;

      const instance = new EditorView({ state, parent: hostRef.current }) as unknown as CodeMirrorView;
      created = instance;

      const api: EditorApi = {
        setDoc(next, caretToRestore) {
          if (instance.state.doc.toString() === next) {
            // Same text, new tab: only the saved caret has to move.
            if (
              typeof caretToRestore === "number" &&
              caretToRestore !== instance.state.selection.main.head
            ) {
              instance.dispatch({
                selection: { anchor: Math.min(Math.max(caretToRestore, 0), next.length) },
              });
            }
            return;
          }
          // Keep the caret where the reader had it instead of jumping to the top.
          const anchor =
            typeof caretToRestore === "number"
              ? Math.min(Math.max(caretToRestore, 0), next.length)
              : Math.min(instance.state.selection.main.head, next.length);
          instance.dispatch({
            changes: { from: 0, to: instance.state.doc.length, insert: next },
            selection: { anchor },
            effects: historyCompartment.reconfigure(history()),
          });
        },
        setEditable(next) {
          instance.dispatch({ effects: editCompartment.reconfigure(buildEdit(next)) });
          if (next) instance.focus();
        },
        setTheme(nextDark) {
          instance.dispatch({ effects: themeCompartment.reconfigure(buildTheme(nextDark)) });
        },
        setLanguage(id) {
          void languageExtension(id).then((extension) => {
            if (cancelled || created !== instance) return;
            instance.dispatch({ effects: languageCompartment.reconfigure(extension) });
            // The aria-label carries the path, so refresh it with the language.
            instance.dispatch({
              effects: editCompartment.reconfigure(buildEdit(editableRef.current)),
            });
          });
        },
        setChanges(marks) {
          instance.dispatch({ effects: changesCompartment.reconfigure(buildChanges(marks)) });
        },
      };

      apiRef.current = api;
      // A read that landed while the editor was loading still wins.
      api.setDoc(contentRef.current, caretRef.current);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      apiRef.current = null;
      created?.destroy();
      host.replaceChildren();
    };
  }, []);

  // External documents replace the editor's copy; typing never round-trips.
  useEffect(() => {
    apiRef.current?.setDoc(content, caret ?? null);
  }, [content, caret]);

  useEffect(() => {
    apiRef.current?.setEditable(editable);
  }, [editable]);

  useEffect(() => {
    apiRef.current?.setTheme(dark);
  }, [dark]);

  useEffect(() => {
    apiRef.current?.setLanguage(languageFor(filePath));
  }, [filePath]);

  useEffect(() => {
    apiRef.current?.setChanges(changesRef.current ?? null);
  }, [changesKey]);

  if (failed) {
    return (
      <pre
        className="overflow-auto bg-muted/30 px-2.5 py-2 font-mono text-[0.64rem] leading-[1.55]"
        style={{ maxHeight }}
      >
        {content}
      </pre>
    );
  }

  return (
    <div
      ref={hostRef}
      className="min-w-0 overflow-hidden"
      style={{ "--code-max-height": maxHeight } as CSSProperties}
    />
  );
}

const LANGUAGE_LABELS: Record<LanguageId, string> = {
  js: "JavaScript",
  ts: "TypeScript",
  jsx: "JavaScript · JSX",
  tsx: "TypeScript · JSX",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  markdown: "Markdown",
  python: "Python",
  go: "Go",
  rust: "Rust",
  yaml: "YAML",
  sql: "SQL",
  text: "Plain text",
};

/** What the status bar calls the open file's language. */
export function languageLabelFor(filePath: string): string {
  return LANGUAGE_LABELS[languageFor(filePath)];
}

/** Only the language pack the open file actually needs is downloaded. */
async function languageExtension(id: LanguageId) {
  switch (id) {
    case "js": {
      const mod = await import("@codemirror/lang-javascript");
      return mod.javascript();
    }
    case "ts": {
      const mod = await import("@codemirror/lang-javascript");
      return mod.javascript({ typescript: true });
    }
    case "jsx": {
      const mod = await import("@codemirror/lang-javascript");
      return mod.javascript({ jsx: true });
    }
    case "tsx": {
      const mod = await import("@codemirror/lang-javascript");
      return mod.javascript({ typescript: true, jsx: true });
    }
    case "css": {
      const mod = await import("@codemirror/lang-css");
      return mod.css();
    }
    case "html": {
      const mod = await import("@codemirror/lang-html");
      return mod.html();
    }
    case "json": {
      const mod = await import("@codemirror/lang-json");
      return mod.json();
    }
    case "markdown": {
      const mod = await import("@codemirror/lang-markdown");
      return mod.markdown();
    }
    case "python": {
      const mod = await import("@codemirror/lang-python");
      return mod.python();
    }
    case "go": {
      const mod = await import("@codemirror/lang-go");
      return mod.go();
    }
    case "rust": {
      const mod = await import("@codemirror/lang-rust");
      return mod.rust();
    }
    case "yaml": {
      const mod = await import("@codemirror/lang-yaml");
      return mod.yaml();
    }
    case "sql": {
      const mod = await import("@codemirror/lang-sql");
      return mod.sql();
    }
    default: {
      const { EditorView } = await import("@codemirror/view");
      return EditorView.lineWrapping;
    }
  }
}
