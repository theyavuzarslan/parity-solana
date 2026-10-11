import type { Metadata, Viewport } from "next";
import { Azeret_Mono, Barlow, Barlow_Condensed } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const display = Barlow_Condensed({ variable: "--font-barlow-condensed", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700", "800"] });
const body = Barlow({ variable: "--font-barlow", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });
const mono = Azeret_Mono({ variable: "--font-azeret-mono", subsets: ["latin", "latin-ext"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Parity — lock a lira rate", template: "%s · Parity" },
  description: "Proposed design on Solana devnet: lock a future USD/TRY, EUR/TRY or gram-gold rate, priced from the interest-rate gap.",
};

export const viewport: Viewport = { colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
