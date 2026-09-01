"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TranscriptDialog } from "@/components/meetings/transcript-dialog";
import type { Task, TaskStatus } from "@/lib/database.types";

interface ShellApi {
  openCommand: () => void;
  newTask: (status?: TaskStatus) => void;
  editTask: (task: Task) => void;
  pasteTranscript: () => void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}

/**
 * Owns every global overlay — palette, task editor, transcript paste — so any
 * page can summon them through context rather than each one shipping its own
 * copy of the same dialog.
 */
export function AppShell({
  email,
  name,
  children,
}: {
  email: string;
  name?: string | null;
  children: React.ReactNode;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [transcript, setTranscript] = useState({ open: false, seq: 0 });
  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    task?: Task | null;
    status?: TaskStatus;
    // Bumped on every open. Used as the dialog's React key so each visit gets a
    // freshly mounted form — opening "new task" twice in a row can't resurrect
    // the previous draft.
    seq: number;
  }>({ open: false, seq: 0 });

  const openCommand = useCallback(() => setCommandOpen(true), []);
  const newTask = useCallback(
    (status?: TaskStatus) =>
      setTaskDialog((prev) => ({ open: true, task: null, status, seq: prev.seq + 1 })),
    [],
  );
  const editTask = useCallback(
    (task: Task) =>
      setTaskDialog((prev) => ({ open: true, task, seq: prev.seq + 1 })),
    [],
  );
  const pasteTranscript = useCallback(
    () => setTranscript((prev) => ({ open: true, seq: prev.seq + 1 })),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }

      // Bare-letter shortcuts, but never while the user is writing something.
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") {
        e.preventDefault();
        newTask();
      } else if (e.key === "t") {
        e.preventDefault();
        pasteTranscript();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [newTask, pasteTranscript]);

  const api: ShellApi = { openCommand, newTask, editTask, pasteTranscript };

  return (
    <ShellContext.Provider value={api}>
      <div className="flex h-dvh overflow-hidden bg-bg">
        <Sidebar email={email} name={name} onOpenCommand={openCommand} />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNewTask={() => newTask()}
        onPasteTranscript={pasteTranscript}
      />
      <TaskDialog
        key={`task-${taskDialog.seq}`}
        open={taskDialog.open}
        task={taskDialog.task}
        defaultStatus={taskDialog.status}
        onClose={() => setTaskDialog((prev) => ({ ...prev, open: false }))}
      />
      <TranscriptDialog
        key={`transcript-${transcript.seq}`}
        open={transcript.open}
        onClose={() => setTranscript((prev) => ({ ...prev, open: false }))}
      />
    </ShellContext.Provider>
  );
}

/** Standard page chrome: title row, actions, then scrollable content. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--stroke)] px-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-fg">
          {title}
        </h1>
        {subtitle && (
          <span className="shrink-0 text-[12px] text-fg-caption">{subtitle}</span>
        )}
      </div>
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </header>
  );
}
