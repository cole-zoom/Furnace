"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from "@/components/ui/badge";
import { createTask, deleteTask, updateTask } from "@/lib/actions";
import type { Task, TaskPriority, TaskStatus } from "@/lib/database.types";

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Omit to create. Provide to edit. */
  task?: Task | null;
  defaultStatus?: TaskStatus;
}

/**
 * Seeded once, at mount. AppShell gives this component a fresh `key` on every
 * open, so each visit remounts with the right values and a stale draft can
 * never leak from one task into the next — no syncing effect needed.
 */
function seed(task: Task | null | undefined, defaultStatus?: TaskStatus) {
  return task
    ? {
        title: task.title,
        description: task.description ?? "",
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ?? "",
      }
    : {
        title: "",
        description: "",
        status: defaultStatus ?? ("todo" as TaskStatus),
        priority: "medium" as TaskPriority,
        due_date: "",
      };
}

export function TaskDialog({ open, onClose, task, defaultStatus }: TaskDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(() => seed(task, defaultStatus));

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Give the task a title");
      return;
    }

    startTransition(async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
      };

      const result = task
        ? await updateTask(task.id, payload)
        : await createTask(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(task ? "Task updated" : "Task created");
      onClose();
      router.refresh();
    });
  };

  const remove = () => {
    if (!task) return;
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Task deleted");
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? "Edit task" : "New task"}
      footer={
        <>
          {task && (
            <Button variant="danger" size="sm" onClick={remove} disabled={pending} className="mr-auto">
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={pending}>
            {task ? "Save" : "Create task"}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Title">
          <Input
            data-autofocus
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="What needs doing?"
            onKeyDown={(e) => {
              // ⌘↵ submits from anywhere in the form.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
        </Field>

        <Field label="Description">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Context, links, whatever helps future you."
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => set("status", e.target.value as TaskStatus)}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Priority">
            <Select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value as TaskPriority)}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_META[p].label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Due">
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => set("due_date", e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
