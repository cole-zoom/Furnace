import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "3 days ago", "in 2 hours", "just now" — short enough for a dense table.
 *
 * `now` is a parameter so a server-rendered caller can pass the same instant it
 * rendered with. Reading the clock internally makes the output differ between
 * the server render and hydration whenever the row crosses a bucket boundary in
 * between — the 45-second "just now" cutoff, or any whole minute — which React
 * reports as a hydration error.
 */
export function relativeTime(
  input: string | Date | null | undefined,
  now: number = Date.now(),
): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = date.getTime() - now;
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

/**
 * Calendar-aware day labels, so "Today" doesn't drift with the clock.
 *
 * `now` is nullable, and passing null is how a server render says "I can't
 * answer this". "Today" and "Tomorrow" are relative to the *reader's* calendar
 * day, which resolves in the server's timezone during SSR — a task due Sep 14
 * renders "Tomorrow" from a UTC server while a reader in Tokyo is already on
 * Sep 14 and should see "Today". With null it falls back to the absolute date,
 * which is timezone-independent because it's built from the date parts, and the
 * caller upgrades to the relative wording once hydrated.
 */
export function dueLabel(
  due: string | null | undefined,
  now: number | null = Date.now(),
): {
  label: string;
  tone: "overdue" | "today" | "soon" | "later" | "none";
} {
  if (!due) return { label: "", tone: "none" };

  if (now === null) {
    const [y, m, d] = due.split("-").map(Number);
    return {
      label: new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      tone: "later",
    };
  }

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  // A bare YYYY-MM-DD parses as UTC midnight, which lands on the previous day
  // in western timezones. Split it so the date means what it says locally.
  const [y, m, d] = due.split("-").map(Number);
  const target = startOfDay(new Date(y, (m ?? 1) - 1, d ?? 1));
  const today = startOfDay(new Date(now));
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
