"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CheckSquare,
  CornerDownLeft,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Kbd } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * ⌘K palette.
 *
 * Searching runs against Supabase from the browser under the user's own JWT, so
 * RLS scopes the results without any extra filtering here — there is no way for
 * this query to return someone else's rows even if the term matched them.
 */

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  run: () => void | Promise<void>;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNewTask,
  onPasteTranscript,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewTask: () => void;
  onPasteTranscript: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<Item[]>([]);
  // The term the results in state actually correspond to. Comparing it against
  // the live query gives us "is a search in flight" as derived state, instead of
  // a second state flag we'd have to flip inside the effect.
  const [settledTerm, setSettledTerm] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const term = query.trim();
  const searching = term.length >= 2 && settledTerm !== term;

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setCursor(0);
    setResults([]);
    setSettledTerm("");
  }, [onOpenChange]);

  const commands = useMemo<Item[]>(
    () => [
      {
        id: "new-task",
        label: "New task",
        hint: "N",
        icon: Plus,
        group: "Actions",
        run: () => {
          close();
          onNewTask();
        },
      },
      {
        id: "paste",
        label: "Paste meeting transcript",
        hint: "T",
        icon: FileText,
        group: "Actions",
        run: () => {
          close();
          onPasteTranscript();
        },
      },
      {
        id: "sync",
        label: "Sync Google Calendar",
        icon: RefreshCw,
        group: "Actions",
        run: async () => {
          close();
          const pending = toast.loading("Syncing calendar…");
          try {
            const res = await fetch("/api/calendar/sync", { method: "POST" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.message ?? body.error ?? "Sync failed");
            toast.success(
              `Synced ${body.synced} event${body.synced === 1 ? "" : "s"}`,
              { id: pending },
            );
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Sync failed", {
              id: pending,
            });
          }
        },
      },
      { id: "go-tasks", label: "Go to Tasks", icon: CheckSquare, group: "Navigate", run: () => { close(); router.push("/tasks"); } },
      { id: "go-meetings", label: "Go to Meetings", icon: CalendarDays, group: "Navigate", run: () => { close(); router.push("/meetings"); } },
      { id: "go-people", label: "Go to People", icon: Users, group: "Navigate", run: () => { close(); router.push("/people"); } },
      { id: "go-settings", label: "Go to Settings", icon: Settings, group: "Navigate", run: () => { close(); router.push("/settings"); } },
    ],
    [close, onNewTask, onPasteTranscript, router],
  );

  // Debounced search. 160ms is short enough to feel live, long enough that a
  // fast typist doesn't fire a request per keystroke.
  useEffect(() => {
    // Below two characters there is nothing to search and nothing to clear —
    // `visibleResults` already hides stale rows, so this returns without
    // touching state.
    if (term.length < 2) return;

    const handle = setTimeout(async () => {
      const supabase = createClient();
      const pattern = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;

      const [tasks, meetings, people] = await Promise.all([
        supabase.from("tasks").select("id, title, status").ilike("title", pattern).limit(5),
        supabase.from("meetings").select("id, title, start_time").ilike("title", pattern).limit(5),
        supabase.from("people").select("id, full_name, email").or(
          `full_name.ilike.${pattern},email.ilike.${pattern}`,
        ).limit(5),
      ]);

      const found: Item[] = [
        ...(tasks.data ?? []).map((t) => ({
          id: `task-${t.id}`,
          label: t.title,
          hint: "Task",
          icon: CheckSquare,
          group: "Results",
          run: () => { close(); router.push(`/tasks?task=${t.id}`); },
        })),
        ...(meetings.data ?? []).map((m) => ({
          id: `meeting-${m.id}`,
          label: m.title,
          hint: "Meeting",
          icon: CalendarDays,
          group: "Results",
          run: () => { close(); router.push(`/meetings/${m.id}`); },
        })),
        ...(people.data ?? []).map((p) => ({
          id: `person-${p.id}`,
          label: p.full_name || p.email || "Unnamed",
          hint: "Person",
          icon: Users,
          group: "Results",
          run: () => { close(); router.push(`/people?person=${p.id}`); },
        })),
      ];

      setResults(found);
      setSettledTerm(term);
    }, 160);

    return () => clearTimeout(handle);
  }, [term, close, router]);

  const visible = useMemo(() => {
    const needle = term.toLowerCase();
    const filtered = needle
      ? commands.filter((c) => c.label.toLowerCase().includes(needle))
      : commands;
    // Keep showing the previous term's rows while the next search lands, but
    // drop them entirely once the query is too short to have any.
    const visibleResults = term.length >= 2 ? results : [];
    return [...visibleResults, ...filtered];
  }, [commands, results, term]);

  // Reset the highlight when the query changes, adjusted during render rather
  // than in an effect so the list never paints with a stale selection.
  const [cursorFor, setCursorFor] = useState(query);
  if (cursorFor !== query) {
    setCursorFor(query);
    setCursor(0);
  }

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, visible.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); void visible[cursor]?.run(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, visible, cursor, close]);

  if (!open || typeof document === "undefined") return null;

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 mt-[12vh] w-full max-w-[560px] overflow-hidden rounded-xl bg-bg
                   surface-e5 animate-fade-up"
      >
        <div className="flex items-center gap-2 border-b border-[var(--stroke)] px-3">
          <Search className="size-4 shrink-0 text-fg-caption" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, meetings, people…"
            className="h-11 w-full bg-transparent text-sm text-fg-body outline-none placeholder:text-fg-caption"
          />
          {searching && (
            <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-fg-caption border-t-transparent" />
          )}
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-fg-caption">
              No matches for “{query}”
            </p>
          ) : (
            visible.map((item, index) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              const Icon = item.icon;

              return (
                <div key={item.id}>
                  {showGroup && (
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.055em] text-fg-caption">
                      {item.group}
                    </p>
                  )}
                  <button
                    data-index={index}
                    onMouseMove={() => setCursor(index)}
                    onClick={() => void item.run()}
                    className={cn(
                      "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px]",
                      "transition-colors duration-[50ms]",
                      index === cursor ? "bg-bg-inset text-fg" : "text-fg-body",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 text-fg-caption" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="shrink-0 text-[11px] text-fg-caption">{item.hint}</span>
                    )}
                    {index === cursor && (
                      <CornerDownLeft className="size-3 shrink-0 text-fg-caption" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--stroke)] px-3 py-1.5 text-[11px] text-fg-caption">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
          <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
