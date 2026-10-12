"use client";

import type { ReactNode } from "react";
import { ParityProvider, useParityQuery } from "@/data/provider";
import { ChainWallet } from "./ChainWallet";
import { ConditionsStrip } from "./ConditionsStrip";
import { DemoChip, PreviewChip } from "./DemoChip";
import { ThemeToggle } from "./ThemeToggle";
import { BottomTabs, TopTabs } from "./TabNav";
import { WalletButton } from "./WalletButton";
import { Wordmark } from "./Wordmark";

function Chrome({ children }: { children: ReactNode }) {
  const { value: demo } = useParityQuery((d) => d.getDemo());
  const demoMode = demo?.demoMode ?? false;
  const { value: info } = useParityQuery((d) => (d.info ? d.info() : Promise.resolve(null)));
  const preview = info?.kind === "preview";
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <a href="#main" className="t-label sr-only rounded-[4px] bg-navy px-3 py-2 text-coupon focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50">
        Skip to content
      </a>
      <header className="border-b-2 border-navy bg-stock">
        <div className="mx-auto flex max-w-[1440px] items-end justify-between gap-4 px-4 pt-3 md:px-8">
          <div className="flex items-center gap-3 pb-2.5">
            <Wordmark />
            <span className="t-label hidden rounded-[3px] border-[1.5px] border-navy px-1.5 py-0.5 text-xs text-navy xl:inline-flex">DEVNET</span>
            {demoMode ? <span className="hidden xl:inline-flex"><DemoChip /></span> : null}
            {preview ? <span className="hidden xl:inline-flex"><PreviewChip /></span> : null}
          </div>
          <TopTabs />
          <div className="flex items-center gap-3 pb-2">
            <ThemeToggle className="hidden md:inline-flex" />
            <WalletButton />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-hairline px-4 py-1.5 md:px-8 xl:hidden">
          <span className="t-label rounded-[3px] border-[1.5px] border-navy px-1.5 py-0.5 text-xs text-navy">DEVNET</span>
          {demoMode ? <DemoChip /> : null}
          {preview ? <PreviewChip /> : null}
          <ThemeToggle className="ml-auto inline-flex md:hidden" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
      <ConditionsStrip demoMode={demoMode} />
      <BottomTabs />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ChainWallet>
      <ParityProvider>
        <Chrome>{children}</Chrome>
      </ParityProvider>
    </ChainWallet>
  );
}
