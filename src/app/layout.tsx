import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";

import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fare Radar",
    template: "%s · Fare Radar",
  },
  description: "Private cross-cabin airfare relationship monitoring.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppShell isAuthenticated={Boolean(data?.claims)}>{children}</AppShell>
      </body>
    </html>
  );
}
