"use client";

import { useEffect, useState } from "react";

/**
 * A clock seeded by the server and kept current in the browser.
 *
 * Server-rendered views that classify by time need three things at once, and
 * getting any one wrong has its own failure:
 *
 *   - the same instant on the server and in the hydration render, or the markup
 *     and the first client render disagree;
 *   - the newest server value whenever one arrives, or a router.refresh() is
 *     classified against a stale instant;
 *   - forward movement while the tab sits open, or a meeting that started an
 *     hour ago is still filed as upcoming.
 *
 * The tick is monotonic so a machine running slow can't rewind behind the
 * server, while a fresh server value is always adopted outright — taking the
 * newer of the two would let one fast reading from a laptop waking out of
 * suspend latch permanently.
 */
export function useTickingClock(serverNow: number, intervalMs = 60_000): number {
  const [clock, setClock] = useState(serverNow);

  const [seenServerClock, setSeenServerClock] = useState(serverNow);
  if (seenServerClock !== serverNow) {
    setSeenServerClock(serverNow);
    setClock(serverNow);
  }

  useEffect(() => {
    const tick = () => setClock((current) => Math.max(current, Date.now()));

    /*
     * Immediately, not just on the interval. Next serves back/forward
     * navigations from the Router Cache, so a remount can arrive with a
     * `serverNow` from twenty minutes ago — and the render-phase adoption above
     * won't help, because the prop didn't change.
     */
    tick();

    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return clock;
}
