// Verifies the palette token blocks in app/globals.css.
//
// Reads every [data-theme="<id>"] block (light and its .dark variant), then
// checks the pairs the design system promises:
//   body text on background / card        >= 13.5
//   muted text on background / card / muted >= 4.5
//   primary label on primary              >= 4.5
//   brand ink on background               >= 4.5
//   sidebar text on sidebar               >= 4.5
//   destructive on background             >= 4.5
//
// Usage: node scripts/check-palette-contrast.mjs

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function luminance(hex) {
  const value = hex.trim().replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) return null;
  const tokens = {};
  for (const line of match[1].split("\n")) {
    const token = line.match(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/i);
    if (token) tokens[token[1]] = token[2];
  }
  return tokens;
}

const ids = [...css.matchAll(/\[data-theme="([a-z-]+)"\]\s*\{/g)].map((match) => match[1]);
const unique = [...new Set(ids)];

const checks = [
  ["foreground", "background", 13.5, "body on background"],
  ["foreground", "card", 13.5, "body on card"],
  ["muted-foreground", "background", 4.5, "muted on background"],
  ["muted-foreground", "card", 4.5, "muted on card"],
  ["muted-foreground", "muted", 4.5, "muted on muted"],
  ["primary-foreground", "primary", 4.5, "primary label"],
  ["brand-ink", "background", 4.5, "brand ink"],
  ["sidebar-foreground", "sidebar", 4.5, "sidebar text"],
  ["destructive", "background", 4.5, "destructive"],
];

let failures = 0;
for (const id of unique) {
  for (const mode of ["light", "dark"]) {
    const selector = mode === "light" ? `[data-theme="${id}"]` : `[data-theme="${id}"].dark`;
    const tokens = block(selector);
    if (!tokens) {
      console.error(`MISSING ${selector}`);
      failures += 1;
      continue;
    }
    const label = `${id} ${mode}`.padEnd(20);
    const problems = [];
    for (const [fg, bg, min, name] of checks) {
      const value = ratio(tokens[`--${fg}`], tokens[`--${bg}`]);
      if (value === null) {
        problems.push(`${name}: token missing (${fg} / ${bg})`);
      } else if (value + 1e-9 < min) {
        problems.push(`${name}: ${value.toFixed(2)} < ${min} (${fg} ${tokens[`--${fg}`]} on ${bg} ${tokens[`--${bg}`]})`);
      }
    }
    if (problems.length) {
      failures += problems.length;
      console.log(`FAIL ${label}`);
      for (const problem of problems) console.log(`     - ${problem}`);
    } else {
      console.log(`ok   ${label}`);
    }
  }
}

console.log(
  failures === 0
    ? `\nAll ${unique.length} palettes pass in both modes.`
    : `\n${failures} contrast problem(s) across ${unique.length} palettes.`,
);
process.exitCode = failures === 0 ? 0 : 1;
