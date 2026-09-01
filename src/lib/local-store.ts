"use client";

/**
 * A tiny `useSyncExternalStore`-compatible wrapper around localStorage.
 *
 * The obvious way to read a stored preference is `useState` plus an effect that
 * calls `setState` after mount — but that's a cascading render on every load,
 * and React 19's `react-hooks/set-state-in-effect` rule (correctly) rejects it.
 * `useSyncExternalStore` is the sanctioned answer: it renders the server
 * snapshot during hydration so the markup matches, then swaps to the real
 * client value in the same commit, with no extra render pass and no hydration
 * mismatch.
 *
 * `localStorage.setItem` doesn't fire `storage` in the tab that wrote it, so we
 * keep our own listener set to notify the current tab, and listen to `storage`
 * for the others.
 */
export interface LocalStore<T extends string> {
  subscribe: (onChange: () => void) => () => void;
  get: () => T;
  getServer: () => T;
  set: (value: T) => void;
}

export function createLocalStore<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => boolean = () => true,
): LocalStore<T> {
  const listeners = new Set<() => void>();
  // getSnapshot must be referentially stable between renders or React loops,
  // so the value is cached and only invalidated on an actual write.
  let cache: T | null = null;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    cache = null;
    notify();
  };

  return {
    subscribe(onChange) {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },

    get() {
      if (cache !== null) return cache;
      try {
        const stored = localStorage.getItem(key);
        cache = stored && isValid(stored) ? (stored as T) : fallback;
      } catch {
        // Private mode, disabled storage, embedded contexts.
        cache = fallback;
      }
      return cache;
    },

    getServer() {
      return fallback;
    },

    set(value) {
      cache = value;
      try {
        localStorage.setItem(key, value);
      } catch {
        // Preference just won't persist; the session still works.
      }
      notify();
    },
  };
}
