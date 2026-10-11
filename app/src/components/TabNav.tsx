"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";

export const TABS = [
  { href: "/advisor", label: "Advisor" },
  { href: "/markets", label: "Markets" },
  { href: "/wallet", label: "Wallet" },
  { href: "/dispatch", label: "Dispatch" },
] as const;

/** Top tab-caps nav; active tab is filled navy with a notch. */
export function TopTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-end gap-1">
        {TABS.map((t) => {
          const on = path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "t-label relative flex h-10 items-center rounded-t-[4px] border-2 border-b-0 px-4 text-sm transition-colors duration-150 active:translate-y-px",
                  on ? "border-navy bg-navy text-coupon" : "border-transparent text-navy hover:border-hairline hover:bg-coupon",
                )}
              >
                {t.label}
                {on ? <span aria-hidden className="absolute -bottom-[5px] left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-navy" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Phone bottom bar of the same tabs. */
export function BottomTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-navy bg-navy pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const on = path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "t-label flex h-14 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150 active:bg-navy-2",
                  on ? "text-coupon" : "text-copy",
                )}
              >
                <span aria-hidden className={cx("h-1 w-6 -skew-x-[20deg]", on ? "bg-red" : "bg-transparent")} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
