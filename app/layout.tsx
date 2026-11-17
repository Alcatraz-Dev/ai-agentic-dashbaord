import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { Toaster } from "@/components/ui/toast";
import { PALETTE_BOOT_SCRIPT } from "@/lib/themes";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alcatraz — AI Agentic Dashboard",
  description:
    "A calm, blue-lit control room for your AI agents. Email, Google and GitHub sign-in included.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} antialiased`} suppressHydrationWarning>
      <body>
        {/* Applies the stored palette before first paint, so no theme flash. */}
        <script dangerouslySetInnerHTML={{ __html: PALETTE_BOOT_SCRIPT }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
