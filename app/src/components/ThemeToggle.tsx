"use client";

import { useTheme, type Theme } from "@/lib/theme";
import { cx } from "@/lib/format";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "ticket", label: "Ticket" },
  { value: "solana", label: "Solana" },
];

/** Top-bar skin switch. Persists in localStorage; default Ticket. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cx("theme-toggle rounded-[4px] border-[1.5px] border-navy p-0.5", className)}>
      {OPTIONS.map((o) => {
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(o.value)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                setTheme(theme === "ticket" ? "solana" : "ticket");
                (e.currentTarget.parentElement?.querySelector(`[aria-checked="false"]`) as HTMLElement | null)?.focus();
              }
            }}
            tabIndex={on ? 0 : -1}
            className={cx(
              "t-label h-7 rounded-[2px] px-2.5 text-xs transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
              on ? "bg-navy text-coupon" : "text-navy hover:bg-hairline",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
