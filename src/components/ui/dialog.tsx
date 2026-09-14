"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /**
   * Accessible name for a dialog that draws its own chrome instead of taking a
   * `title` bar. Without it such a panel announces as an unnamed dialog.
   */
  ariaLabel?: string;
  /** Replaces the body's default padding, for panels that own their layout. */
  bodyClassName?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  ariaLabel,
  bodyClassName,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      // Minimal focus trap: enough to keep Tab inside the panel without
      // pulling in a dependency for it.
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Let the panel mount before reaching for the first field.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      /*
       * Two queries, not one selector list. `querySelector` returns the first
       * match in *document* order, not in the order the selectors are written,
       * and the close button sits above the fields in every dialog here — so
       * the combined selector always landed on Close and `data-autofocus` did
       * nothing. Asking for the opt-in first makes it mean what it says.
       */
      const target =
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.querySelector<HTMLElement>("input,textarea,button");
      target?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      cancelAnimationFrame(raf);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[2px] animate-[fade-up_.12s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        className={cn(
          "relative z-10 mt-[8vh] w-full max-w-lg rounded-xl bg-bg",
          "surface-e5 animate-fade-up",
          className,
        )}
      >
        {(title || description) && (
          <header className="flex items-start justify-between gap-4 border-b border-[var(--stroke)] px-4 py-3">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-fg">{title}</h2>}
              {description && (
                <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-fg-caption
                         transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
            >
              <X className="size-4" />
            </button>
          </header>
        )}

        <div className={cn("px-4 py-4", bodyClassName)}>{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--stroke)] px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
