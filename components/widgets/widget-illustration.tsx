import type { ReactNode } from "react";

import type { WidgetIllustrationKey } from "@/lib/widget-types";

/**
 * Twenty small, colorful SVG scenes. They are plain inline vector art — no
 * remote images, no user markup — and each one is chosen by key, so a stored
 * illustration always renders the same drawing.
 */

const SCENES: Record<WidgetIllustrationKey, ReactNode> = {
  chart: (
    <>
      <rect x="6" y="40" width="18" height="18" rx="4" fill="#93c5fd" />
      <rect x="27" y="27" width="18" height="31" rx="4" fill="#3b82f6" />
      <rect x="48" y="14" width="18" height="44" rx="4" fill="#1d4ed8" />
      <path d="M10 34 L36 22 L58 8 h28" fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
      <path d="M79 4 l10 4 -6 9 z" fill="#f59e0b" />
    </>
  ),
  rocket: (
    <>
      <circle cx="58" cy="26" r="22" fill="#c7d2fe" />
      <path d="M38 56 C30 38 36 17 58 8 c7 12 7 32 -2 48 z" fill="#f8fafc" stroke="#334155" strokeWidth="3" />
      <circle cx="55" cy="27" r="6" fill="#38bdf8" stroke="#334155" strokeWidth="3" />
      <path d="M39 42 l-12 9 3 -17 z" fill="#ef4444" />
      <path d="M74 42 l12 9 -3 -17 z" fill="#ef4444" />
      <path d="M50 57 q8 12 16 0 q-5 3 -8 8 q-3 -5 -8 -8" fill="#fb923c" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="34" cy="48" rx="21" ry="9" fill="#b45309" />
      <ellipse cx="34" cy="43" rx="21" ry="9" fill="#fbbf24" />
      <ellipse cx="34" cy="35" rx="21" ry="9" fill="#fcd34d" />
      <circle cx="34" cy="33" r="6" fill="#fff7ed" opacity=".6" />
      <ellipse cx="66" cy="40" rx="15" ry="7" fill="#b45309" />
      <ellipse cx="66" cy="35" rx="15" ry="7" fill="#f59e0b" />
      <path d="M76 18 v12 M71 21 h10" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  team: (
    <>
      <circle cx="30" cy="24" r="10" fill="#fca5a5" />
      <path d="M12 58 q0 -20 18 -20 q18 0 18 20 z" fill="#ef4444" />
      <circle cx="66" cy="24" r="10" fill="#93c5fd" />
      <path d="M48 58 q0 -20 18 -20 q18 0 18 20 z" fill="#3b82f6" />
      <circle cx="48" cy="18" r="8" fill="#fcd34d" />
      <path d="M34 55 q0 -16 14 -16 q14 0 14 16 z" fill="#f59e0b" />
    </>
  ),
  calendar: (
    <>
      <rect x="14" y="12" width="68" height="48" rx="8" fill="#fff7ed" stroke="#fdba74" strokeWidth="3" />
      <path d="M14 24 h68" stroke="#fb923c" strokeWidth="12" />
      <path d="M30 7 v10 M66 7 v10" stroke="#9a3412" strokeWidth="5" strokeLinecap="round" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={28 + col * 18}
            cy={37 + row * 11}
            r="3.4"
            fill={(row + col) % 3 === 0 ? "#f97316" : "#fdba74"}
          />
        )),
      )}
    </>
  ),
  mail: (
    <>
      <rect x="8" y="16" width="80" height="42" rx="7" fill="#f0f9ff" stroke="#0284c7" strokeWidth="3" />
      <path d="M10 20 L48 44 L86 20" fill="none" stroke="#0284c7" strokeWidth="4" strokeLinejoin="round" />
      <path d="M10 55 l24 -17 M86 55 l-24 -17" stroke="#7dd3fc" strokeWidth="3" />
      <circle cx="80" cy="12" r="10" fill="#f43f5e" />
      <path d="M76 12 l3 3 5 -6" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  globe: (
    <>
      <circle cx="48" cy="32" r="25" fill="#38bdf8" />
      <path d="M25 22 q14 8 24 1 q10 -6 21 3 q-3 10 -10 12 q-12 2 -14 12 q-11 1 -17 -8 q-6 -10 -4 -20" fill="#22c55e" />
      <path d="M60 41 q8 -2 13 6 q-6 5 -13 3 z" fill="#16a34a" />
      <ellipse cx="48" cy="32" rx="38" ry="12" fill="none" stroke="#fbbf24" strokeWidth="3" transform="rotate(-18 48 32)" />
    </>
  ),
  shield: (
    <>
      <path d="M48 6 l28 9 v18 q0 20 -28 29 q-28 -9 -28 -29 V15 z" fill="#34d399" stroke="#047857" strokeWidth="3" />
      <path d="M48 13 l21 7 v13 q0 15 -21 22 q-21 -7 -21 -22 V20 z" fill="#ecfdf5" />
      <path d="M35 36 l9 9 17 -20" fill="none" stroke="#059669" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  bolt: (
    <>
      <circle cx="48" cy="32" r="27" fill="#ede9fe" />
      <path d="M54 5 L28 36 h16 l-6 23 28 -33 H50 z" fill="#facc15" stroke="#7c3aed" strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 14 l6 -6 M78 50 l6 -6 M12 48 l7 5" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  cloud: (
    <>
      <circle cx="70" cy="18" r="11" fill="#fbbf24" />
      <path d="M24 48 q-14 0 -14 -12 q0 -11 13 -11 q4 -12 18 -12 q14 0 18 12 q14 1 14 12 q0 11 -14 11 z" fill="#bae6fd" stroke="#0284c7" strokeWidth="3" />
      <path d="M28 56 l-4 7 M44 56 l-4 7 M60 56 l-4 7" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  target: (
    <>
      <circle cx="44" cy="34" r="27" fill="#fee2e2" />
      <circle cx="44" cy="34" r="20" fill="#f87171" />
      <circle cx="44" cy="34" r="12" fill="#fff7ed" />
      <circle cx="44" cy="34" r="5" fill="#dc2626" />
      <path d="M52 26 L86 10 M78 8 h10 v10" fill="none" stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  idea: (
    <>
      <circle cx="48" cy="29" r="19" fill="#fde68a" stroke="#d97706" strokeWidth="3" />
      <path d="M40 47 h16 v7 h-16 z" fill="#b45309" />
      <path d="M43 55 h10 v5 h-10 z" fill="#92400e" />
      <path d="M48 2 v8 M20 12 l6 6 M76 12 l-6 6 M14 32 h8 M74 32 h8" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
      <path d="M42 27 q6 -8 12 0 q2 6 -6 9 q-8 -3 -6 -9" fill="#fbbf24" />
    </>
  ),
  flow: (
    <>
      <circle cx="16" cy="18" r="9" fill="#f472b6" />
      <circle cx="80" cy="18" r="9" fill="#60a5fa" />
      <circle cx="48" cy="48" r="9" fill="#34d399" />
      <path d="M24 20 L70 20 M22 26 L42 42 M74 26 L54 42" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 46 h16" stroke="#0f766e" strokeWidth="3" />
    </>
  ),
  leaf: (
    <>
      <path d="M16 54 Q18 14 80 10 Q82 46 48 55 q-18 5 -32 -1" fill="#4ade80" stroke="#15803d" strokeWidth="3" />
      <path d="M20 52 Q44 36 74 16" fill="none" stroke="#166534" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 38 q2 -12 14 -16 M36 44 q-1 -10 8 -16" fill="none" stroke="#166534" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="78" cy="48" r="7" fill="#fb923c" />
    </>
  ),
  music: (
    <>
      <path d="M38 14 v32 q-3 -7 -11 -4 q-6 3 -3 9 q3 6 10 4 q5 -2 5 -8 V24 l28 -7 v23 q-3 -7 -11 -4 q-6 3 -3 9 q3 6 10 4 q5 -2 5 -8 V8 z" fill="#a855f7" />
      <path d="M10 50 q8 -8 16 0 M70 54 q8 -10 16 0" fill="none" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  book: (
    <>
      <path d="M8 14 q20 -8 40 4 q20 -12 40 -4 v38 q-20 -8 -40 4 q-20 -12 -40 -4 z" fill="#fef3c7" stroke="#b45309" strokeWidth="3" />
      <path d="M48 18 v38" stroke="#b45309" strokeWidth="3" />
      <path d="M16 22 q12 -3 24 2 M16 30 q12 -3 24 2 M56 24 q12 -5 24 -2 M56 32 q12 -5 24 -2" fill="none" stroke="#d97706" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M70 8 l10 4 -4 10" fill="#2dd4bf" />
    </>
  ),
  coffee: (
    <>
      <path d="M20 26 h44 v18 q0 14 -14 14 h-16 q-14 0 -14 -14 z" fill="#f8fafc" stroke="#78350f" strokeWidth="3" />
      <path d="M64 31 q14 0 14 9 q0 9 -14 9" fill="none" stroke="#78350f" strokeWidth="4" />
      <path d="M20 32 h44 v4 h-44 z" fill="#b45309" />
      <path d="M30 18 q-5 -7 0 -12 M42 18 q-5 -7 0 -12 M54 18 q-5 -7 0 -12" fill="none" stroke="#d6d3d1" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 60 h52" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  moon: (
    <>
      <rect x="6" y="6" width="84" height="52" rx="12" fill="#1e1b4b" />
      <path d="M60 14 a18 18 0 1 0 0 36 a14 14 0 1 1 0 -36" fill="#fde047" />
      <circle cx="24" cy="20" r="2.5" fill="#fef9c3" />
      <circle cx="34" cy="42" r="2" fill="#c4b5fd" />
      <circle cx="76" cy="22" r="2" fill="#67e8f9" />
      <path d="M20 34 l3 5 6 1 -4 4 1 6 -6 -3 -5 3 1 -6 -4 -4 6 -1 z" fill="#a5b4fc" />
    </>
  ),
  spark: (
    <>
      <path d="M48 4 l8 22 22 6 -22 7 -8 21 -8 -21 -22 -7 22 -6 z" fill="#fbbf24" stroke="#ea580c" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="48" cy="32" r="7" fill="#fff7ed" />
      <path d="M16 12 l5 8 M78 12 l-5 8 M14 46 l9 -3 M82 46 l-9 -3" stroke="#f472b6" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  stack: (
    <>
      <ellipse cx="48" cy="14" rx="28" ry="9" fill="#a5b4fc" />
      <path d="M20 14 v14 q0 8 28 9 q28 -1 28 -9 V14" fill="#6366f1" />
      <ellipse cx="48" cy="28" rx="28" ry="9" fill="#818cf8" />
      <path d="M20 28 v14 q0 8 28 9 q28 -1 28 -9 V28" fill="#4f46e5" />
      <ellipse cx="48" cy="42" rx="28" ry="9" fill="#6366f1" />
      <path d="M20 42 v10 q0 8 28 9 q28 -1 28 -9 V42" fill="#312e81" />
      <circle cx="34" cy="42" r="3" fill="#a7f3d0" />
      <circle cx="46" cy="44" r="3" fill="#fde68a" />
    </>
  ),
};

export function WidgetIllustration({
  illustration,
  className,
}: {
  illustration: WidgetIllustrationKey;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 96 64"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {SCENES[illustration] ?? SCENES.spark}
    </svg>
  );
}
