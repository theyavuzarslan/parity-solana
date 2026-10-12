"use client";

import { useEffect, useState } from "react";

/** Unix seconds, captured once and refreshed every `everyMs` (render stays pure). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
