"use client";

import { useEffect, useState } from "react";

/**
 * The server's instant until hydration, the browser's afterwards.
 *
 * This started far more elaborate — anchoring to the server and advancing with
 * performance.now() to avoid ever trusting the local wall clock. That was the
 * wrong instinct twice over: performance.now() doesn't advance while a machine
 * sleeps, so a laptop closed at 5pm and opened at 9am reported yesterday
 * evening; and an anchor from Next's Router Cache can arrive twenty minutes
 * stale with no path to correct it, because elapsed-time-since-mount is zero.
 *
 * The simple rule is also the right one. The server value exists only so the
 * markup and the hydration render agree; past that, "now" means the reader's
 * clock — which is what every other app on their machine shows, advances
 * through suspend, and re-corrects itself when NTP does.
 */
export function useTickingClock(serverNow: number, intervalMs = 60_000): number {
  const [clock, setClock] = useState(serverNow);

  useEffect(() => {
    const tick = () => setClock(Date.now());

    // Immediately: this is the first moment the reader's own clock is legible,
    // and it's what corrects a stale server value served from the Router Cache.
    tick();

    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    // Fires on bfcache restore, where neither an interval nor visibilitychange
    // is guaranteed to have run.
    window.addEventListener("pageshow", tick);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tick);
    };
  }, [intervalMs]);

  return clock;
}
