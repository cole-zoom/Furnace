"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The Furnace mark.
 *
 * A Minecraft furnace is lit while it's smelting and dark when it's idle, which
 * maps neatly onto "am I actually working right now". The mark watches for real
 * activity — pointer, keys, scroll, tab focus — and fires up while you are, then
 * cools down after a stretch of nothing. It's a small thing but it makes the
 * app feel like it's paying attention.
 */

interface FurnaceMarkProps {
  size?: number;
  /** Force a state. Omit to let it follow the user's activity. */
  lit?: boolean;
  /** Milliseconds of stillness before the fire goes out. */
  idleAfter?: number;
  /** Rising ember particles while lit. Off in dense UI like the sidebar. */
  embers?: boolean;
  className?: string;
}

const ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
] as const;

export function useIsActive(idleAfter = 45_000): boolean {
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cool = () => setActive(false);

    const heat = () => {
      setActive((prev) => (prev ? prev : true));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(cool, idleAfter);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (timer.current) clearTimeout(timer.current);
        setActive(false);
      } else {
        heat();
      }
    };

    heat();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, heat, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", cool);
    window.addEventListener("focus", heat);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, heat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", cool);
      window.removeEventListener("focus", heat);
    };
  }, [idleAfter]);

  return active;
}

export function FurnaceMark({
  size = 28,
  lit,
  idleAfter = 45_000,
  embers = false,
  className,
}: FurnaceMarkProps) {
  const auto = useIsActive(idleAfter);
  const isLit = lit ?? auto;

  // Stable jitter per mount so the embers don't march in lockstep.
  const sparks = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        left: 28 + i * 20 + (i % 2 === 0 ? 6 : -4),
        delay: i * 0.55,
        duration: 1.9 + i * 0.35,
      })),
    [],
  );

  return (
    <span
      className={cn("relative inline-block shrink-0 select-none", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/furnace-idle.png"
        alt=""
        width={size}
        height={size}
        unoptimized
        className={cn(
          "pixelated absolute inset-0 transition-opacity duration-300 ease-[cubic-bezier(0,0,0,1)]",
          isLit ? "opacity-0" : "opacity-100",
        )}
      />
      <Image
        src="/furnace-lit.webp"
        alt=""
        width={size}
        height={size}
        unoptimized
        className={cn(
          "pixelated absolute inset-0 transition-opacity duration-300 ease-[cubic-bezier(0,0,0,1)]",
          isLit ? "opacity-100 animate-flicker" : "opacity-0",
        )}
      />

      {/* Heat bloom — sells the glow without touching the sprite itself. */}
      <span
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full blur-[6px] transition-opacity duration-500",
          isLit ? "opacity-60" : "opacity-0",
        )}
        style={{
          background:
            "radial-gradient(circle at 50% 78%, var(--color-ember-400) 0%, transparent 62%)",
        }}
      />

      {embers && isLit && (
        <span className="pointer-events-none absolute inset-0 overflow-visible">
          {sparks.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-[1px]"
              style={{
                left: `${s.left}%`,
                bottom: "18%",
                width: Math.max(1.5, size / 16),
                height: Math.max(1.5, size / 16),
                background: i === 1 ? "var(--color-ember-200)" : "var(--color-ember-400)",
                animation: `ember-rise ${s.duration}s ${s.delay}s ease-out infinite`,
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

/** Mark + wordmark, for the sidebar header and the login screen. */
export function FurnaceLogo({
  size = 26,
  embers = false,
  className,
}: {
  size?: number;
  embers?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <FurnaceMark size={size} embers={embers} />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
        Furnace
      </span>
    </span>
  );
}
