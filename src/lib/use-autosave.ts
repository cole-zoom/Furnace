"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  /** Not saveable yet, and the user needs to know why (e.g. an empty title). */
  | { kind: "blocked"; reason: string }
  | { kind: "error"; message: string };

/**
 * Debounced write-behind for an edit surface.
 *
 * Three things keep this from hammering the database:
 *
 *   1. The timer restarts on every keystroke, so a burst of typing is one
 *      write, not one per character.
 *   2. `save` receives the last *persisted* draft alongside the current one, so
 *      the caller can send only what actually changed — and send nothing at
 *      all when nothing did. Opening a record and closing it costs zero
 *      requests.
 *   3. Only one request is ever in flight. Edits made while a save is in the
 *      air are collapsed into a single follow-up rather than queueing a write
 *      per pause.
 *
 * `schedule(draft, true)` skips the timer, for changes that are a decision
 * rather than typing — picking a status, choosing a date.
 */
export function useAutosave<T>({
  enabled,
  delay = 2000,
  initial,
  validate,
  save,
}: {
  /** False disables every path, for a record that doesn't exist yet. */
  enabled: boolean;
  delay?: number;
  /** What's already in the database, so the first diff has something to run against. */
  initial: T;
  /** Return why this draft can't be written yet, or null. */
  validate?: (draft: T) => string | null;
  save: (
    draft: T,
    persisted: T,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const persisted = useRef<T>(initial);
  const pending = useRef<T | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Read through refs so `run` keeps one identity: it's held by a timer and by
   * a document listener, and a new function every render would tear both down
   * on every keystroke. Written in an effect rather than during render, and
   * that's safe here because `run` only ever fires from a timer or a handler —
   * both of which happen after the commit that updated these.
   */
  const saveRef = useRef(save);
  const validateRef = useRef(validate);
  useEffect(() => {
    saveRef.current = save;
    validateRef.current = validate;
  });

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const run = useCallback(async (): Promise<void> => {
    clearTimer();
    if (!enabled || inFlight.current) return;

    inFlight.current = true;
    try {
      /*
       * A loop, not a recursive call: anything typed while a request is in the
       * air is picked up on the next turn. That's what holds the "one request
       * at a time" guarantee for a fast typist — the alternative is a queue of
       * writes all landing at once, each one already stale.
       */
      while (pending.current !== null) {
        const draft = pending.current;

        const reason = validateRef.current?.(draft) ?? null;
        if (reason) {
          setState({ kind: "blocked", reason });
          return;
        }

        setState({ kind: "saving" });

        let result: { ok: true } | { ok: false; error: string };
        try {
          result = await saveRef.current(draft, persisted.current);
        } catch {
          // A Server Action that never came back — offline, or a redeploy mid-flight.
          result = { ok: false, error: "Couldn't reach the server." };
        }

        if (!result.ok) {
          // `pending` is deliberately left set, so a retry has something to send.
          setState({ kind: "error", message: result.error });
          return;
        }

        persisted.current = draft;
        if (pending.current === draft) pending.current = null;
        setState({ kind: "saved" });
      }
    } finally {
      inFlight.current = false;
    }
  }, [enabled, clearTimer]);

  const schedule = useCallback(
    (draft: T, immediate = false) => {
      if (!enabled) return;
      pending.current = draft;
      clearTimer();

      if (immediate) {
        void run();
        return;
      }
      // Drop a stale "Saved" the moment the draft diverges from it again.
      setState((prev) => (prev.kind === "saving" ? prev : { kind: "idle" }));
      timer.current = setTimeout(() => void run(), delay);
    },
    [enabled, delay, run, clearTimer],
  );

  const flush = useCallback(async () => {
    clearTimer();
    await run();
  }, [run, clearTimer]);

  /** Drop everything unwritten — for when the record is about to stop existing. */
  const cancel = useCallback(() => {
    clearTimer();
    pending.current = null;
    setState({ kind: "idle" });
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  /*
   * A tab being hidden or closed shouldn't take the last two seconds of typing
   * with it. visibilitychange is the one lifecycle event mobile browsers
   * reliably fire before tearing a page down — `beforeunload` is not.
   */
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [enabled, flush]);

  return { state, schedule, flush, cancel };
}
