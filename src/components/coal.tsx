"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A lump of coal. Fuel is the natural unit for a thing called Furnace, so
 * finished work is measured in coal burned rather than a bare number.
 */
export function Coal({
  size = 14,
  className,
  dim = false,
}: {
  size?: number;
  className?: string;
  /** Unburned fuel: dimmed, for the "still to come" slots in a gauge. */
  dim?: boolean;
}) {
  return (
    <Image
      src="/coal.webp"
      alt=""
      width={size}
      height={size}
      unoptimized
      aria-hidden
      className={cn(
        "pixelated shrink-0 transition-[opacity,filter] duration-200",
        dim && "opacity-25 grayscale",
        className,
      )}
    />
  );
}

/**
 * How much you've burned today. Five lumps max — past that it's a number, and
 * anyone shipping more than five things in a day doesn't need them counted out
 * one at a time.
 */
export function FuelGauge({
  burned,
  className,
}: {
  burned: number;
  className?: string;
}) {
  const lumps = Math.min(burned, 5);

  return (
    <span
      className={cn("flex items-center gap-1", className)}
      title={
        burned === 0
          ? "Nothing finished today yet"
          : `${burned} task${burned === 1 ? "" : "s"} finished today`
      }
    >
      <span className="flex items-center -space-x-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Coal key={i} size={15} dim={i >= lumps} />
        ))}
      </span>
      {burned > 5 && (
        <span className="text-[11px] font-medium text-fg-caption">+{burned - 5}</span>
      )}
      <span className="sr-only">
        {burned} task{burned === 1 ? "" : "s"} finished today
      </span>
    </span>
  );
}
