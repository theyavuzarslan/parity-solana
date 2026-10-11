"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeBoot";

export { THEME_KEY };

/**
 * Two skins over the same components and data: "ticket" (Coupon Wallet, default)
 * and "solana" (Solana-native finance). The choice lives on <html data-theme>,
 * is persisted in localStorage, and is applied before paint by THEME_BOOT.
 */
export type Theme = "ticket" | "solana";
const EVENT = "parity-theme-change";

export function readTheme(): Theme {
  if (typeof document === "undefined") return "ticket";
  return document.documentElement.dataset.theme === "solana" ? "solana" : "ticket";
}

export function applyTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode: the toggle still works for this page view */
  }
  if (t === "solana") document.documentElement.dataset.theme = "solana";
  else delete document.documentElement.dataset.theme;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  // another tab changed the theme: mirror it onto this document, then notify
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    if (e.newValue === "solana") document.documentElement.dataset.theme = "solana";
    else delete document.documentElement.dataset.theme;
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "ticket" as Theme);
  const setTheme = useCallback((t: Theme) => applyTheme(t), []);
  return { theme, setTheme };
}
