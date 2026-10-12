"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/format";
import { Orb } from "./Orb";
import { Stamp, type StampKind } from "./Stamp";

type Variant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  /** loading: orb + label, input disabled */
  loading?: boolean;
  loadingLabel?: string;
  /** success: the label is replaced by a stamp */
  success?: StampKind | null;
  /** error text rendered under the button and linked via aria-describedby */
  error?: string | null;
  children: ReactNode;
  block?: boolean;
}

const base =
  "t-label relative inline-flex items-center justify-center gap-2 rounded-[4px] select-none touch-manipulation " +
  "transition-[transform,background-color,color,box-shadow] duration-150 ease-out " +
  "active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "btn-primary bg-red text-coupon border-2 border-red hover:bg-red-press hover:border-red-press active:bg-red-press " +
    "disabled:bg-navy-2/30 disabled:border-transparent disabled:text-navy",
  secondary:
    "bg-coupon text-navy border-2 border-navy hover:bg-navy hover:text-coupon active:bg-navy-2 active:text-coupon " +
    "disabled:border-hairline disabled:text-navy-2 disabled:hover:bg-coupon disabled:hover:text-navy-2",
  ghost:
    "text-navy underline decoration-1 underline-offset-4 hover:decoration-2 hover:text-navy-2 disabled:text-navy-2 disabled:no-underline",
};

const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-5 text-base", lg: "h-14 px-8 text-lg tracking-[0.08em]" };

/** Link styled as the primary (red) button, for navigation CTAs. */
export const primaryLinkCls =
  "btn-primary t-label inline-flex h-14 items-center justify-center rounded-[4px] border-2 border-red bg-red px-8 text-lg tracking-[0.08em] text-coupon transition-[background-color,transform] duration-150 hover:bg-red-press hover:border-red-press active:scale-[0.97]";
/** Link styled as the secondary (navy outline) button. */
export const secondaryLinkCls =
  "btn-secondary t-label inline-flex h-14 items-center justify-center rounded-[4px] border-2 border-navy bg-coupon px-8 text-lg tracking-[0.08em] text-navy transition-[background-color,color,transform] duration-150 hover:bg-navy hover:text-coupon active:scale-[0.97]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, loadingLabel = "Signing…", success, error, children, className, block, disabled, id, ...rest },
  ref,
) {
  const errId = error && id ? `${id}-error` : undefined;
  return (
    <span className={cx("inline-flex flex-col gap-1.5", block && "w-full")}>
      <button
        ref={ref}
        id={id}
        aria-busy={loading || undefined}
        aria-describedby={errId}
        disabled={(disabled || loading) && !success}
        aria-disabled={success ? true : undefined}
        className={cx(
          base,
          variants[variant],
          variant !== "ghost" && sizes[size],
          variant === "ghost" && "px-1 py-1 text-sm",
          error && variant !== "ghost" && "ring-2 ring-red ring-offset-2 ring-offset-stock",
          block && "w-full",
          loading && "cursor-progress",
          success && "pointer-events-none",
          success && variant === "primary" && "border-navy bg-navy hover:bg-navy",
          className,
        )}
        {...rest}
        onClick={success ? undefined : rest.onClick}
      >
        {loading ? (
          <>
            <Orb label={loadingLabel} />
            <span>{loadingLabel}</span>
          </>
        ) : success ? (
          <Stamp kind={success} size="sm" inverse={variant === "primary"} />
        ) : (
          children
        )}
      </button>
      {error ? (
        <span id={errId} role="alert" className="text-sm text-red">
          {error}
        </span>
      ) : null}
    </span>
  );
});
