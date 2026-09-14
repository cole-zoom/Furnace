"use client";

import { useEffect, useState } from "react";

/**
 * A clock anchored to the server and advanced by elapsed time.
 *
 * Deliberately never reads the browser's wall clock. Earlier versions did, and
 * the two failure modes pull in opposite directions:
 *
 *   - take the newer of server and browser, and one fast reading from a laptop
 *     waking out of suspend latches permanently — every correct server value
 *     afterwards loses the comparison and is discarded;
 *   - take the server outright, and a browser running slightly ahead gets pulled
 *     back on the next refresh, flipping a meeting that just started back to
 *     "upcoming" until the next tick.
 *
 * Anchoring to the server and measuring elapsed time with performance.now()
 * avoids the trade entirely: the origin is always the server's answer, the
 * offset is monotonic and independent of any clock the user can set wrong, and
 * a fresh server value simply re-anchors.
 */
export function useTickingClock(serverNow: number, intervalMs = 60_000): number {
  const [clock, setClock] = useState(serverNow);

  /*
   * Re-anchor during render when a newer server value arrives — after a
   * router.refresh(), say — so the first paint already uses it rather than
   * showing the old instant for a frame.
   */
  const [anchor, setAnchor] = useState(serverNow);
  if (anchor !== serverNow) {
    setAnchor(serverNow);
    setClock(serverNow);
  }

  useEffect(() => {
    // Captured on the client, after hydration, so SSR is never involved.
    const origin = performance.now();
    const tick = () => setClock(anchor + (performance.now() - origin));

    /*
     * Immediately, not just on the interval. Next serves back/forward
     * navigations from the Router Cache, so a remount can arrive carrying a
     * `serverNow` from twenty minutes ago, and the render-phase re-anchor
     * can't help — the prop didn't change.
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
  }, [anchor, intervalMs]);

  return clock;
}
