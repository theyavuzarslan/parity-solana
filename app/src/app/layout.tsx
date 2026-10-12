import type { Metadata, Viewport } from "next";
import { Azeret_Mono, Barlow, Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { THEME_BOOT } from "@/lib/themeBoot";
import "./globals.css";

const display = Barlow_Condensed({ variable: "--font-barlow-condensed", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700", "800"] });
const body = Barlow({ variable: "--font-barlow", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });
const mono = Azeret_Mono({ variable: "--font-azeret-mono", subsets: ["latin", "latin-ext"], weight: ["500", "600"] });
// Theme B (Solana): Geist + Geist Mono
const geist = Geist({ variable: "--font-geist", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Parity — lock a lira rate", template: "%s · Parity" },
  description: "Proposed design on Solana devnet: lock a future USD/TRY, EUR/TRY or gram-gold rate, priced from the interest-rate gap.",
};

export const viewport: Viewport = { colorScheme: "light dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable} ${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
