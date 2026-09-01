"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { updatePerson } from "@/lib/actions";
import { relativeTime } from "@/lib/utils";
import type { Person } from "@/lib/database.types";

export function PeopleView({ people }: { people: Person[] }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Person | null>(
    () => people.find((p) => p.id === searchParams.get("person")) ?? null,
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return people;
    return people.filter((p) =>
      `${p.full_name ?? ""} ${p.email ?? ""} ${p.company ?? ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [people, query]);

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`${people.length} contact${people.length === 1 ? "" : "s"}`}
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-caption" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find someone…"
              className="h-7 w-[190px] rounded-md bg-bg pl-7 pr-2 text-[13px] text-fg-body
                         surface outline-none
                         transition-shadow duration-[50ms] placeholder:text-fg-caption
                         focus:surface-accent"
            />
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {people.length === 0 ? (
          <EmptyState
            icon={<Users className="size-4" />}
            title="No contacts yet"
            description="People are picked up automatically from the attendees on your synced calendar events."
          />
        ) : filtered.length === 0 ? (
          <EmptyState title={`Nobody matches “${query}”`} />
        ) : (
          <>
            <div className="flex h-8 items-center gap-3 border-b border-[var(--stroke)] bg-bg-raised/60 px-4
                            text-[11px] font-semibold uppercase tracking-[0.055em] text-fg-caption">
              <span className="min-w-0 flex-1">Name</span>
              <span className="hidden w-[220px] shrink-0 sm:block">Company / role</span>
              <span className="w-[120px] shrink-0 text-right">Last met</span>
            </div>

            {filtered.map((person) => (
              <button
                key={person.id}
                onClick={() => setEditing(person)}
                className="flex w-full items-center gap-3 border-b border-[var(--stroke-weak)] px-4 py-2
                           text-left transition-colors duration-[50ms] hover:bg-bg-subtle"
              >
                <Avatar name={person.full_name} email={person.email} size={24} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {person.full_name || person.email}
                  </p>
                  {person.full_name && person.email && (
                    <p className="truncate text-[12px] text-fg-caption">{person.email}</p>
                  )}
                </div>
                <span className="hidden w-[220px] shrink-0 truncate text-[12px] text-fg-muted sm:block">
                  {[person.company, person.role].filter(Boolean).join(" · ") || "—"}
                </span>
                <span className="w-[120px] shrink-0 text-right text-[12px] text-fg-caption">
                  {person.last_met_at ? relativeTime(person.last_met_at) : "—"}
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      <PersonDialog person={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function PersonDialog({
  person,
  onClose,
}: {
  person: Person | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ full_name: "", company: "", role: "", notes: "" });
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seed from the row the first time this particular person opens.
  if (person && seeded !== person.id) {
    setSeeded(person.id);
    setForm({
      full_name: person.full_name ?? "",
      company: person.company ?? "",
      role: person.role ?? "",
      notes: person.notes ?? "",
    });
  }

  const save = () => {
    if (!person) return;
    startTransition(async () => {
      const result = await updatePerson(person.id, {
        full_name: form.full_name.trim() || null,
        company: form.company.trim() || null,
        role: form.role.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Contact saved");
      onClose();
    });
  };

  return (
    <Dialog
      open={Boolean(person)}
      onClose={onClose}
      title={person?.full_name || person?.email || "Contact"}
      description={person?.full_name ? (person.email ?? undefined) : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Name">
          <Input
            data-autofocus
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Input
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            />
          </Field>
          <Field label="Role">
            <Input
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="What matters about this person."
          />
        </Field>
      </div>
    </Dialog>
  );
}
