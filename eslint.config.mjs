import nextVitals from "eslint-config-next/core-web-vitals";

/**
 * The project had no ESLint config at all, and Next 16 removed `next lint`, so
 * `npm run lint` was pointing at a command that no longer existed (it read the
 * word "lint" as a directory). This is the framework's own flat config, with
 * the trees that are not ours to fix left out — vendored affectUI source,
 * generated shadcn primitives, the Archify renderer bundle and build output.
 */
const configs = Array.isArray(nextVitals) ? nextVitals : [nextVitals];

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".projects/**",
      "drizzle/**",
      "next-env.d.ts",
      "components/aui/**",
      "components/ui/**",
      "lib/archify/vendor/**",
    ],
  },
  ...configs,
  {
    rules: {
      // JSX copy in this app uses apostrophes as text; that renders exactly the
      // same, and the rule only asks for entities.
      "react/no-unescaped-entities": "off",
      // These are React Compiler advisories, not defects. The app syncs state
      // from props, localStorage and a server refresh inside effects on
      // purpose, and keeps the newest value in a ref for event handlers.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default config;
