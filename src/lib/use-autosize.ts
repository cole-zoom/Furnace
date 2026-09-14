"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Grows a textarea to fit its content instead of scrolling inside itself.
 *
 * A page-style editor has one scroll container — the page. A textarea that
 * keeps its own scrollbar breaks that: the caret can sit below the fold of a
 * box that is itself below the fold, and no amount of page scrolling reveals
 * it. Measuring and setting the height moves the overflow up to the page,
 * where there's exactly one thing to scroll.
 *
 * `useLayoutEffect`, not `useEffect`: the height is applied in the same frame
 * as the value that caused it, so typing past a line break doesn't paint one
 * frame at the old height.
 */
export function useAutosize<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse first. scrollHeight never reports less than the current height,
    // so without this the box can only ever grow.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return ref;
}
