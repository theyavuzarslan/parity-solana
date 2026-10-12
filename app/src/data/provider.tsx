"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createMockProvider } from "./mockProvider";
import type { ParityData } from "./types";

/**
 * The one place that decides which ParityData implementation the app uses.
 * The chain task swaps `createMockProvider()` for the Anchor/devnet provider.
 */
let singleton: ParityData | null = null;
function defaultProvider(): ParityData {
  if (!singleton) singleton = createMockProvider();
  return singleton;
}

interface Ctx {
  data: ParityData;
  version: number;
}
const ParityContext = createContext<Ctx | null>(null);

export function ParityProvider({ children, data }: { children: ReactNode; data?: ParityData }) {
  const [instance] = useState<ParityData>(() => data ?? defaultProvider());
  const versionRef = useRef(0);
  const version = useSyncExternalStore(
    useCallback(
      (cb: () => void) =>
        instance.subscribe(() => {
          versionRef.current += 1;
          cb();
        }),
      [instance],
    ),
    () => versionRef.current,
    () => 0,
  );
  return <ParityContext.Provider value={{ data: instance, version }}>{children}</ParityContext.Provider>;
}

export function useParity(): Ctx {
  const ctx = useContext(ParityContext);
  if (!ctx) throw new Error("useParity must be used inside <ParityProvider>");
  return ctx;
}

/**
 * Re-runs `load` whenever provider state changes (and every `pollMs` if set).
 * Keeps the previous value while refetching so numbers cross-fade instead of blanking.
 */
export function useParityQuery<T>(
  load: (d: ParityData) => Promise<T>,
  deps: unknown[] = [],
  pollMs?: number,
  /** optional synchronous seed for the first render (e.g. d.peek?.markets()) */
  initial?: (d: ParityData) => T | undefined,
) {
  const { data, version } = useParity();
  const [state, setState] = useState<{ value: T | undefined; error: string | null; loading: boolean }>(() => {
    const value = initial?.(data);
    return { value, error: null, loading: value === undefined };
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  useEffect(() => {
    let alive = true;
    load(data)
      .then((value) => alive && setState({ value, error: null, loading: false }))
      .catch((e: unknown) => alive && setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e), loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, version, tick, ...deps]);

  return state;
}
