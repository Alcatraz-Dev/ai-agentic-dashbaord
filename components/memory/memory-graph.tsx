"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import type { MemoryGraph, MemoryGraphNode } from "@/lib/memory-types";
import { cn } from "@/lib/utils";

/**
 * The memory graph, drawn like a code-graph viewer: one dot per saved note,
 * coloured by its community, wired to the tag hubs it shares and to the agent
 * that keeps it. Shared tags pull notes into clusters, and the agent hubs sit
 * between them, so the shape of the picture is the shape of what is remembered.
 *
 * The layout is a small force simulation (Fruchterman–Reingold) written here,
 * with no dependency and no server work: it runs once per structure, is seeded
 * deterministically from the node ids, and is then fitted to the canvas. Notes
 * can be hovered or focused to read them, the view can be zoomed and dragged,
 * communities can be toggled off from the panel, and a compact variant draws
 * the same picture in an agent's config rail.
 */

const WIDTH = 780;
const HEIGHT = 430;
const COMPACT_WIDTH = 300;
const COMPACT_HEIGHT = 190;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.8;

// The graph is its own dark plate, like a graph viewer, so the community hues
// read the same in every palette and in both appearances. These are data-viz
// colours, not theme tokens.
const INK = "#e8ecf7";
const MUTED = "#94a1be";
const EDGE = "#8fa2c9";
const CANVAS_TOP = "#141d33";
const CANVAS_BOTTOM = "#080d18";

type Placed = MemoryGraphNode & { x: number; y: number };
type SimNode = Placed & { dx: number; dy: number };

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG, so the same notes always settle the same way. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Force-directed layout in a canvas of `width` × `height`.
 *
 * Repulsion between every pair opens the web up, links pull notes onto their
 * tag and agent hubs, and weak gravity keeps detached pieces on screen. The
 * result is scaled to the canvas afterwards, so nothing is ever clipped.
 */
function simulate(graph: MemoryGraph, width: number, height: number): Placed[] {
  const nodes: SimNode[] = graph.nodes.map((node) => ({
    ...node,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
  }));

  if (nodes.length === 0) return [];

  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const links: { a: number; b: number; strength: number }[] = [];

  for (const edge of graph.edges) {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    if (a === undefined || b === undefined) continue;
    // A note clings to its tag hubs; the agent link is a longer thread, so the
    // agents read as hubs between clusters rather than as another tag.
    links.push({ a, b, strength: edge.to.startsWith("agent:") ? 0.3 : 1 });
  }

  const pad = 24;
  const innerWidth = Math.max(1, width - pad * 2);
  const innerHeight = Math.max(1, height - pad * 2);
  const centreX = width / 2;
  const centreY = height / 2;
  const k = Math.sqrt((innerWidth * innerHeight) / Math.max(1, nodes.length));
  const random = mulberry32(hashString(nodes.map((node) => node.id).join("|")));

  for (const node of nodes) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * Math.min(innerWidth, innerHeight) * 0.4;
    node.x = centreX + Math.cos(angle) * radius;
    node.y = centreY + Math.sin(angle) * radius;
  }

  const iterations = nodes.length > 160 ? 200 : 260;
  let temperature = Math.min(innerWidth, innerHeight) * 0.16;

  for (let step = 0; step < iterations; step += 1) {
    for (const node of nodes) {
      node.dx = 0;
      node.dy = 0;
    }

    // Repulsion — every dot pushes every other dot away.
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < 0.01) {
          dx = random() - 0.5;
          dy = random() - 0.5;
          distanceSquared = dx * dx + dy * dy || 0.01;
        }

        const distance = Math.sqrt(distanceSquared);
        const force = (k * k) / distance;
        const ux = dx / distance;
        const uy = dy / distance;

        a.dx += ux * force;
        a.dy += uy * force;
        b.dx -= ux * force;
        b.dy -= uy * force;
      }
    }

    // Attraction — notes are held by the tags and agents they belong to.
    for (const link of links) {
      const a = nodes[link.a];
      const b = nodes[link.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(0.01, Math.hypot(dx, dy));
      const force = ((distance * distance) / k) * 0.5 * link.strength;
      const ux = dx / distance;
      const uy = dy / distance;

      a.dx += ux * force;
      a.dy += uy * force;
      b.dx -= ux * force;
      b.dy -= uy * force;
    }

    // Weak gravity, so a piece the links don't reach can't drift away.
    for (const node of nodes) {
      node.dx += (centreX - node.x) * 0.02;
      node.dy += (centreY - node.y) * 0.02;
    }

    // Move by the net force, capped by the cooling temperature.
    for (const node of nodes) {
      const distance = Math.hypot(node.dx, node.dy) || 0.01;
      const move = Math.min(distance, temperature);
      node.x = Math.min(
        width - pad,
        Math.max(pad, node.x + (node.dx / distance) * move),
      );
      node.y = Math.min(
        height - pad,
        Math.max(pad, node.y + (node.dy / distance) * move),
      );
    }

    temperature *= 0.965;
  }

  // Fit the settled web to the plate, so a sparse graph still fills it and a
  // dense one is never cut off at the edges.
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);
  const offsetX = pad + (innerWidth - spanX * scale) / 2 - minX * scale;
  const offsetY = pad + (innerHeight - spanY * scale) / 2 - minY * scale;

  return nodes
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      memoryId: node.memoryId,
      agentId: node.agentId,
      community: node.community,
      weight: node.weight,
      x: node.x * scale + offsetX,
      y: node.y * scale + offsetY,
    }))
    .sort((a, b) => a.weight - b.weight);
}

function describe(node: MemoryGraphNode): string {
  if (node.kind === "agent") {
    return `${node.label} · ${node.weight} ${node.weight === 1 ? "memory" : "memories"}`;
  }
  if (node.kind === "tag") {
    return `#${node.label} · shared by ${node.weight} ${node.weight === 1 ? "memory" : "memories"}`;
  }
  return node.label;
}

function radiusOf(node: MemoryGraphNode): number {
  if (node.kind === "agent") return 8.5;
  if (node.kind === "tag") return 4.4 + Math.min(4.4, Math.log2(node.weight + 1) * 2);
  return 3.2 + Math.min(2.8, Math.log2(node.weight + 1) * 1.4);
}

export function MemoryGraphView({
  graph,
  selectedId,
  onSelect,
  compact = false,
  className,
}: {
  graph: MemoryGraph;
  /** `memory:<id>` of the note picked in the list, highlighted here too. */
  selectedId?: string | null;
  onSelect?: (node: MemoryGraphNode) => void;
  /** Tight variant for an agent's config rail: same picture, no panel. */
  compact?: boolean;
  className?: string;
}) {
  const width = compact ? COMPACT_WIDTH : WIDTH;
  const height = compact ? COMPACT_HEIGHT : HEIGHT;
  const placed = useMemo(() => simulate(graph, width, height), [graph, width, height]);
  const byId = useMemo(() => new Map(placed.map((node) => [node.id, node])), [placed]);
  const [focused, setFocused] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState<number[]>([]);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const gradientId = useId();
  const glowId = useId();

  const colours = useMemo(
    () =>
      graph.communities.reduce<Record<number, string>>((map, community) => {
        map[community.id] = community.color;
        return map;
      }, {}),
    [graph.communities],
  );

  const visible = useMemo(() => {
    if (hidden.length === 0) return placed;
    return placed.filter((node) => node.community < 0 || !hidden.includes(node.community));
  }, [hidden, placed]);

  const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);

  const active = focused ?? selectedId ?? null;

  const connected = useMemo(() => {
    if (!active) return null;
    const ids = new Set<string>([active]);
    for (const edge of graph.edges) {
      if (edge.from === active) ids.add(edge.to);
      if (edge.to === active) ids.add(edge.from);
    }
    return ids;
  }, [active, graph.edges]);

  const node = active ? byId.get(active) ?? null : null;
  const allVisible = hidden.length === 0;

  function toggleCommunity(id: number) {
    setHidden((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function nudgeZoom(delta: number) {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2))));
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  if (placed.length === 0) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-xl border border-dashed border-border bg-muted/20 text-center",
          compact ? "h-[120px]" : "h-[220px]",
        )}
      >
        <p className="max-w-[22rem] px-4 text-[0.72rem] text-muted-foreground">
          No memories yet. Ask an agent to remember something in chat, or add one below — every note
          appears here as a dot.
        </p>
      </div>
    );
  }

  const canvas = (
    <div className="relative min-w-0 flex-1">
      {!compact ? (
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={() => nudgeZoom(0.35)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="grid size-6 place-items-center rounded-md border border-white/12 bg-white/8 text-white/70 transition-colors hover:bg-white/14 hover:text-white disabled:opacity-30"
          >
            <Plus className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => nudgeZoom(-0.35)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="grid size-6 place-items-center rounded-md border border-white/12 bg-white/8 text-white/70 transition-colors hover:bg-white/14 hover:text-white disabled:opacity-30"
          >
            <Minus className="size-3" />
          </button>
          <button
            type="button"
            onClick={resetView}
            disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
            aria-label="Reset the view"
            title="Reset the view"
            className="grid size-6 place-items-center rounded-md border border-white/12 bg-white/8 text-white/70 transition-colors hover:bg-white/14 hover:text-white disabled:opacity-30"
          >
            <Maximize2 className="size-3" />
          </button>
        </div>
      ) : null}

      {!compact ? (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-2 text-[0.55rem] text-white/45">
          <span>{visible.length} nodes</span>
          <span aria-hidden="true">·</span>
          <span>{graph.edges.length} links</span>
          <span aria-hidden="true">·</span>
          <span>{graph.communities.length} communities</span>
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Graph of saved agent memories, coloured by community, linked to their tags and agents"
        className={cn(
          "block h-auto w-full touch-none select-none",
          !compact && zoom > 1 && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={(event) => {
          if (compact || zoom === 1) return;
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = dragRef.current;
          if (!start) return;
          const scale = width / (event.currentTarget.clientWidth || width);
          setPan({
            x: start.panX + (event.clientX - start.x) * scale,
            y: start.panY + (event.clientY - start.y) * scale,
          });
        }}
        onPointerUp={(event) => {
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerLeave={() => {
          dragRef.current = null;
        }}
        onDoubleClick={resetView}
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="42%" r="72%">
            <stop offset="0%" stopColor={CANVAS_TOP} />
            <stop offset="100%" stopColor={CANVAS_BOTTOM} />
          </radialGradient>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>

        <rect width={width} height={height} fill={`url(#${gradientId})`} />

        <g
          transform={`translate(${width / 2 + pan.x} ${height / 2 + pan.y}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}
        >
          {graph.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;

            const colour =
              from.community >= 0 ? colours[from.community] ?? MUTED : colours[to.community] ?? MUTED;
            const lit = !connected || (connected.has(edge.from) && connected.has(edge.to));

            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={lit && connected ? colour : EDGE}
                strokeWidth={lit && connected ? 1.15 : 0.7}
                strokeOpacity={lit ? (connected ? 0.85 : 0.3) : 0.06}
              />
            );
          })}

          {visible.map((entry) => {
            const isActive = active === entry.id;
            const dim = Boolean(connected) && !connected?.has(entry.id);
            const colour =
              entry.community >= 0 ? colours[entry.community] ?? MUTED : INK;
            const radius = radiusOf(entry);

            const common = {
              opacity: dim ? 0.22 : 1,
              className: "cursor-pointer outline-none",
              onMouseEnter: () => setFocused(entry.id),
              onMouseLeave: () => setFocused(null),
              onFocus: () => setFocused(entry.id),
              onBlur: () => setFocused(null),
              onClick: () => onSelect?.(entry),
              onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect?.(entry);
              },
              tabIndex: 0,
              role: "button" as const,
              "aria-label": describe(entry),
            };

            return (
              <g key={entry.id} {...common} transform={`translate(${entry.x} ${entry.y})`}>
                {isActive ? (
                  <>
                    <circle r={radius * 2.6} fill={colour} opacity={0.34} filter={`url(#${glowId})`} />
                    <circle
                      r={radius + 3.4}
                      fill="none"
                      stroke={INK}
                      strokeWidth={1.2}
                      strokeOpacity={0.9}
                    />
                  </>
                ) : null}

                {entry.kind === "agent" ? (
                  <circle
                    r={radius}
                    fill={INK}
                    stroke={CANVAS_BOTTOM}
                    strokeWidth={1.6}
                  />
                ) : (
                  <circle
                    r={radius}
                    fill={colour}
                    fillOpacity={entry.kind === "tag" ? 0.72 : 0.95}
                    stroke={entry.kind === "tag" ? colour : CANVAS_BOTTOM}
                    strokeWidth={entry.kind === "tag" ? 1.6 : 0.9}
                    strokeOpacity={entry.kind === "tag" ? 0.9 : 0.65}
                  />
                )}

                {!compact && entry.kind === "tag" ? (
                  <text
                    y={radius + 10}
                    textAnchor="middle"
                    fill={MUTED}
                    style={{ fontSize: 7.5, letterSpacing: "0.02em" }}
                    className="pointer-events-none"
                  >
                    #{entry.label}
                  </text>
                ) : null}

                {entry.kind === "agent" ? (
                  <text
                    y={radius + 11}
                    textAnchor="middle"
                    fill={INK}
                    style={{ fontSize: compact ? 7 : 8.5, fontWeight: 700 }}
                    className="pointer-events-none"
                  >
                    {entry.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );

  const caption = (
    <div
      className={cn(
        "flex items-center gap-2 border-white/10 px-3 py-2",
        compact ? "border-t" : "border-t border-white/10",
      )}
    >
      <p
        aria-live="polite"
        className={cn(
          "min-h-[0.9rem] flex-1 truncate leading-relaxed",
          compact ? "text-[0.55rem]" : "text-[0.64rem]",
        )}
        style={{ color: MUTED }}
      >
        {node
          ? describe(node)
          : compact
            ? "Hover a dot to read its note."
            : "Hover a dot to read its note. Tags hold notes together; the agent sits between the clusters."}
      </p>
      {!compact && node?.memoryId ? (
        <button
          type="button"
          onClick={() => onSelect?.(node)}
          className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.58rem] font-medium text-white/80 transition-colors hover:bg-white/16 hover:text-white"
        >
          Show in list
        </button>
      ) : null}
    </div>
  );

  if (compact) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-[#0b1222]",
          className,
        )}
      >
        {canvas}
        {caption}
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-[#0b1222]", className)}>
      <div className="flex flex-col md:flex-row">
        {canvas}

        <aside className="flex w-full shrink-0 flex-col border-t border-white/10 md:w-[184px] md:border-t-0 md:border-l">
          <p className="px-3 pt-3 pb-1.5 text-[0.58rem] font-semibold tracking-[0.14em] text-white/45 uppercase">
            Communities
          </p>

          <button
            type="button"
            role="checkbox"
            aria-checked={allVisible}
            aria-label="Select all communities"
            onClick={() => setHidden([])}
            className="group flex items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-white/5"
          >
            <span
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors",
                allVisible ? "border-white/70 bg-white/85" : "border-white/25",
              )}
            >
              {allVisible ? (
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
                  <path
                    d="M1.6 5.4 3.8 7.6 8.4 2.4"
                    fill="none"
                    stroke={CANVAS_BOTTOM}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span className="text-[0.7rem] font-medium text-white/75">Select all</span>
          </button>

          <ul className="max-h-[300px] flex-1 overflow-y-auto py-1">
            {graph.communities.map((community) => {
              const checked = !hidden.includes(community.id);

              return (
                <li key={community.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleCommunity(community.id)}
                    className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-white/5"
                  >
                    <span
                      className={cn(
                        "grid size-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors",
                        checked ? "border-white/70 bg-white/85" : "border-white/25",
                      )}
                    >
                      {checked ? (
                        <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
                          <path
                            d="M1.6 5.4 3.8 7.6 8.4 2.4"
                            fill="none"
                            stroke={CANVAS_BOTTOM}
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full transition-opacity",
                        checked ? "opacity-100" : "opacity-40",
                      )}
                      style={{ background: community.color }}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[0.68rem]",
                        checked ? "text-white/85" : "text-white/40",
                      )}
                      title={community.label}
                    >
                      {community.label}
                    </span>
                    <span className="shrink-0 text-[0.6rem] tabular-nums text-white/35">
                      {community.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {graph.hidden > 0 ? (
            <p className="border-t border-white/10 px-3 py-1.5 text-[0.55rem] text-white/35">
              +{graph.hidden} not drawn
            </p>
          ) : null}
        </aside>
      </div>

      {caption}
    </div>
  );
}
