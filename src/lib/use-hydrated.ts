"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards.
 *
 * For values that genuinely differ between server and browser — anything
 * formatted with Intl, which resolves in the server's timezone on Vercel and
 * the reader's locally — this is the honest way to render them. Marking the
 * mismatch with `suppressHydrationWarning` only hides the warning: React never
 * patches a mismatched attribute, so the DOM keeps the *server's* string
 * forever and a reader in Berlin is left hovering a UTC timestamp.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
