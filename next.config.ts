import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Stagehand and the Browserbase SDK ship native/Playwright-era code that must
  // not be bundled: they run in the Node runtime as plain node modules.
  serverExternalPackages: ["@browserbasehq/stagehand", "@browserbasehq/sdk"],
  // Archify's renderers read their template, locales and shared modules from
  // disk at render time, so the whole vendored tree must ship with the route.
  outputFileTracingIncludes: {
    "/api/archify/render": ["./lib/archify/vendor/**/*"],
  },
};

export default nextConfig;
