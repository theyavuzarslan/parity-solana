"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { cx } from "@/lib/format";

export interface SegOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Tab-caps segmented control (radiogroup) with roving focus and arrow keys.
 * Used for the RiskSwitch, months, mint and persona choices.
 */
export function Segmented<T extends string>({
  label, options, value, onChange, size = "md", className, hideLabel,
}: { label: string; options: SegOption<T>[]; value: T; onChange: (v: T) => void; size?: "sm" | "md"; className?: string; hideLabel?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();
  const enabled = options.filter((o) => !o.disabled);
  const move = (dir: 1 | -1) => {
    const i = enabled.findIndex((o) => o.value === value);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  };
  return (
    <div className={cx("min-w-0", className)}>
      <span id={labelId} className={cx("t-label mb-1.5 block text-xs text-navy", hideLabel && "sr-only")}>{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKey} className="flex w-full rounded-[4px] border-2 border-navy bg-coupon p-0.5">
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={o.disabled}
              title={o.hint}
              onClick={() => onChange(o.value)}
              className={cx(
                "t-label flex-1 touch-manipulation rounded-[2px] px-2 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
                size === "sm" ? "h-8 text-xs" : "h-10 text-sm",
                on ? "bg-navy text-coupon" : "text-navy hover:bg-hairline",
                "disabled:cursor-not-allowed disabled:text-navy-2/60 disabled:hover:bg-transparent",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
