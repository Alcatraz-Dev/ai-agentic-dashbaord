/**
 * One small SVG scene per dashboard template.
 *
 * They are decorative previews of the kind of dashboard each template
 * describes — never invented measurements — and every shape is drawn from theme
 * tokens, so the cards retint with the palette. Shared by the Create Dashboard
 * wizard and the Dashboard settings page so the two pickers cannot drift apart.
 */
export function TemplateArt({ id, className }: { id: string; className?: string }) {
  return (
    <span
      className={
        className ??
        "relative block h-[5.5rem] overflow-hidden rounded-xl bg-gradient-to-br from-muted/70 via-muted/35 to-transparent ring-1 ring-border/60"
      }
    >
      <svg viewBox="0 0 168 100" className="size-full" aria-hidden="true">
        {id === "blank" ? (
          <>
            <g className="fill-border" opacity={0.7}>
              <circle cx="26" cy="22" r="1.6" />
              <circle cx="44" cy="22" r="1.6" />
              <circle cx="26" cy="40" r="1.6" />
              <circle cx="142" cy="60" r="1.6" />
              <circle cx="142" cy="78" r="1.6" />
              <circle cx="124" cy="78" r="1.6" />
            </g>
            <rect
              x="32"
              y="16"
              width="104"
              height="68"
              rx="10"
              className="fill-card stroke-border"
              opacity={0.7}
              strokeDasharray="5 5"
            />
            <circle cx="84" cy="42" r="11" className="fill-background stroke-border" />
            <path
              d="M84 37v10M79 42h10"
              className="stroke-muted-foreground"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <rect
              x="70"
              y="62"
              width="28"
              height="4.5"
              rx="2.25"
              className="fill-muted-foreground"
              opacity={0.22}
            />
          </>
        ) : null}

        {id === "creator" ? (
          <>
            <rect x="18" y="12" width="132" height="76" rx="11" className="fill-card stroke-border" />
            <circle cx="31" cy="27" r="5.5" className="fill-brand-soft stroke-brand-border" />
            <rect
              x="41"
              y="24"
              width="34"
              height="4"
              rx="2"
              className="fill-muted-foreground"
              opacity={0.35}
            />
            <rect
              x="41"
              y="31"
              width="20"
              height="3"
              rx="1.5"
              className="fill-muted-foreground"
              opacity={0.2}
            />
            <rect x="126" y="22" width="16" height="9" rx="4.5" className="fill-brand-soft" />
            <path
              d="M28 76 50 63 72 69 94 49 116 57 140 37 140 82 28 82Z"
              className="fill-brand-ink"
              opacity={0.1}
            />
            <path
              d="M28 76 50 63 72 69 94 49 116 57 140 37"
              fill="none"
              className="stroke-brand-ink"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="94" cy="49" r="2.6" className="fill-card stroke-brand-ink" strokeWidth={1.6} />
            <circle cx="140" cy="37" r="3.4" className="fill-brand-ink" />
          </>
        ) : null}

        {id === "daily" ? (
          <>
            <rect x="18" y="12" width="132" height="76" rx="11" className="fill-card stroke-border" />
            <rect x="27" y="20" width="46" height="30" rx="8" className="fill-brand-soft" />
            <circle cx="50" cy="35" r="9" className="stroke-brand-ink" fill="none" strokeWidth={1.8} />
            <path
              d="M50 30v5.5l3.6 2.1"
              className="stroke-brand-ink"
              strokeWidth={1.8}
              strokeLinecap="round"
              fill="none"
            />
            <g className="fill-muted">
              <rect x="27" y="55" width="114" height="9" rx="4.5" />
              <rect x="27" y="67" width="114" height="9" rx="4.5" />
              <rect x="27" y="79" width="114" height="9" rx="4.5" />
            </g>
            <g className="fill-brand-ink">
              <circle cx="34" cy="59.5" r="3.2" />
              <circle cx="34" cy="71.5" r="3.2" opacity={0.45} />
              <circle cx="34" cy="83.5" r="3.2" opacity={0.25} />
            </g>
            <g className="fill-muted-foreground" opacity={0.35}>
              <rect x="42" y="58" width="46" height="3" rx="1.5" />
              <rect x="42" y="70" width="34" height="3" rx="1.5" />
              <rect x="42" y="82" width="52" height="3" rx="1.5" />
            </g>
          </>
        ) : null}

        {id === "business" ? (
          <>
            <rect x="18" y="12" width="132" height="76" rx="11" className="fill-card stroke-border" />
            <rect x="26" y="20" width="36" height="16" rx="5" className="fill-brand-soft" />
            <rect x="66" y="20" width="36" height="16" rx="5" className="fill-muted" />
            <rect x="106" y="20" width="36" height="16" rx="5" className="fill-muted" />
            <g className="fill-brand-ink">
              <rect x="28" y="66" width="10" height="20" rx="3" opacity={0.22} />
              <rect x="44" y="58" width="10" height="28" rx="3" opacity={0.34} />
              <rect x="60" y="62" width="10" height="24" rx="3" opacity={0.48} />
              <rect x="76" y="50" width="10" height="36" rx="3" opacity={0.64} />
              <rect x="92" y="54" width="10" height="32" rx="3" opacity={0.8} />
              <rect x="108" y="42" width="10" height="44" rx="3" />
            </g>
            <path
              d="M126 62 137 51 148 58"
              fill="none"
              className="stroke-brand-ink"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.5}
            />
          </>
        ) : null}

        {id === "developer" ? (
          <>
            <rect x="18" y="12" width="132" height="76" rx="11" className="fill-card stroke-border" />
            <path d="M18 23a11 11 0 0 1 11-11h110a11 11 0 0 1 11 11v5H18Z" className="fill-muted" />
            <g className="fill-muted-foreground" opacity={0.55}>
              <circle cx="29" cy="20" r="2.2" />
              <circle cx="37" cy="20" r="2.2" />
              <circle cx="45" cy="20" r="2.2" />
            </g>
            <g className="fill-brand-ink">
              <rect x="28" y="37" width="14" height="3.6" rx="1.8" />
              <rect x="46" y="37" width="26" height="3.6" rx="1.8" opacity={0.55} />
            </g>
            <g className="fill-muted-foreground" opacity={0.3}>
              <rect x="34" y="46" width="34" height="3.6" rx="1.8" />
              <rect x="34" y="55" width="22" height="3.6" rx="1.8" />
              <rect x="28" y="64" width="18" height="3.6" rx="1.8" />
            </g>
            <polyline
              points="102,74 110,74 114,62 119,82 124,74 142,74"
              fill="none"
              className="stroke-brand-ink"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}

        {id === "research" ? (
          <>
            <rect x="18" y="12" width="132" height="76" rx="11" className="fill-card stroke-border" />
            <rect
              x="30"
              y="28"
              width="42"
              height="52"
              rx="6"
              className="fill-brand-soft"
              transform="rotate(-5 51 54)"
            />
            <rect x="40" y="30" width="42" height="52" rx="6" className="fill-card stroke-border" />
            <g className="fill-muted-foreground" opacity={0.28}>
              <rect x="47" y="39" width="22" height="3.4" rx="1.7" />
              <rect x="47" y="48" width="28" height="3.4" rx="1.7" />
              <rect x="47" y="57" width="18" height="3.4" rx="1.7" />
              <rect x="47" y="66" width="24" height="3.4" rx="1.7" />
            </g>
            <circle cx="112" cy="48" r="15" className="stroke-brand-ink" fill="none" strokeWidth={2.2} />
            <path
              d="M123 59l10 10"
              className="stroke-brand-ink"
              strokeWidth={2.6}
              strokeLinecap="round"
            />
            <circle cx="112" cy="48" r="4" className="fill-brand-ink" opacity={0.45} />
            <circle cx="131" cy="36" r="2.4" className="fill-brand-ink" opacity={0.3} />
          </>
        ) : null}
      </svg>
    </span>
  );
}
