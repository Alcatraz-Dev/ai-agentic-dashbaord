import { Suspense } from "react";
import type { Metadata } from "next";

import { ConnectCallback } from "@/components/integrations/connect-callback";

export const metadata: Metadata = {
  title: "Connecting app · Alcatraz",
  robots: { index: false, follow: false },
};

/**
 * Public landing screen for Composio's hosted connect flow. It renders outside
 * the dashboard shell on purpose: the flow runs in a popup, so this page is a
 * "you're connected, closing…" screen and never loads the app itself.
 */
export default function ConnectCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-background" />}>
      <ConnectCallback />
    </Suspense>
  );
}
