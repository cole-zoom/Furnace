import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "3 days ago", "in 2 hours", "just now" — short enough for a dense table. */
export function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];

  if (abs < 45_000) return "just now";

  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/** Calendar-aware day labels, so "Today" doesn't drift with the clock. */
export function dueLabel(due: string | null | undefined): {
  label: string;
  tone: "overdue" | "today" | "soon" | "later" | "none";
} {
  if (!due) return { label: "", tone: "none" };

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  // A bare YYYY-MM-DD parses as UTC midnight, which lands on the previous day
  // in western timezones. Split it so the date means what it says locally.
  const [y, m, d] = due.split("-").map(Number);
  const target = startOfDay(new Date(y, (m ?? 1) - 1, d ?? 1));
  const today = startOfDay(new Date());
  const days = Math.round((target - today) / 86_400_000);

  if (days < 0) {
    return { label: days === -1 ? "Yesterday" : `${Math.abs(days)}d overdue`, tone: "overdue" };
  }
  if (days === 0) return { label: "Today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  if (days <= 7) {
    return {
      label: new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", { weekday: "short" }),
      tone: "soon",
    };
  }
  return {
    label: new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    tone: "later",
  };
}

export function formatDateTime(input: string | null | undefined): string {
  if (!input) return "";
  return new Date(input).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Midpoint between two fractional sort keys, so a kanban drop only rewrites the
 * card that moved instead of renumbering the whole column.
 */
export function midpoint(before: number | null, after: number | null): number {
  if (before === null && after === null) return Date.now();
  if (before === null) return after! - 1000;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
