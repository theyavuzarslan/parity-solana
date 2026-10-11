"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/lib/format";

/** Ruled input with a tab label above (PASSENGER-style). Numbers render as carbon numerals. */
export function NumberField({
  label, value, onChange, min, max, step = 1, prefix, suffix, hint, error, className,
}: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number;
  prefix?: string; suffix?: string; hint?: ReactNode; error?: string | null; className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className="t-label inline-block rounded-t-[4px] border-2 border-b-0 border-navy bg-coupon px-2.5 pt-1 text-xs text-navy">
        {label}
      </label>
      <div
        className={cx(
          "flex h-12 items-center gap-2 rounded-[0_4px_4px_4px] border-2 bg-coupon px-3 transition-colors duration-150",
          "focus-within:border-carbon focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
          error ? "border-red" : "border-navy hover:border-navy-2",
        )}
      >
        {prefix ? <span className="t-num text-navy-2">{prefix}</span> : null}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-d` : undefined}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          className="t-num w-full min-w-0 bg-transparent text-xl text-carbon outline-none placeholder:text-navy-2 focus-visible:outline-none"
        />
        {suffix ? <span className="t-label shrink-0 text-sm text-navy-2">{suffix}</span> : null}
      </div>
      {error || hint ? (
        <p id={`${id}-d`} className={cx("mt-1.5 text-sm", error ? "text-red" : "text-navy-2")} role={error ? "alert" : undefined}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
