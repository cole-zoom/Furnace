"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, LogOut, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Avatar, SectionHeading } from "@/components/ui/misc";
import { GoogleSignIn } from "@/components/google-signin";
import { ThemeToggle } from "@/components/theme";
import { relativeTime } from "@/lib/utils";

export interface SettingsData {
  email: string;
  name?: string | null;
  google: {
    connected: boolean;
    scope: string | null;
    lastSyncedAt: string | null;
    needsReconnect: boolean;
  };
  config: Array<{ key: string; label: string; set: boolean; hint: string }>;
  counts: { tasks: number; meetings: number; people: number };
}

export function SettingsView({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();

  const sync = () =>
    startSync(async () => {
      const pending = toast.loading("Syncing Google Calendar…");
      try {
        const res = await fetch("/api/calendar/sync", { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? body.error ?? "Sync failed");
        toast.success(
          `${body.created} new · ${body.updated} updated · ${body.people} people`,
          { id: pending },
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Sync failed", { id: pending });
      }
    });

  const missing = data.config.filter((c) => !c.set);

  return (
    <>
      <PageHeader title="Settings" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-7 px-6 py-6">
          {/* -- account ---------------------------------------------------- */}
          <section className="space-y-2.5">
            <SectionHeading>Account</SectionHeading>
            <div className="flex items-center gap-3 rounded-lg bg-bg p-3 surface">
              <Avatar name={data.name} email={data.email} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">
                  {data.name || data.email}
                </p>
                {data.name && (
                  <p className="truncate text-[12px] text-fg-caption">{data.email}</p>
                )}
              </div>
              <form action="/auth/signout" method="post">
                <Button type="submit" size="sm" variant="secondary">
                  <LogOut className="size-3.5" />
                  Sign out
                </Button>
              </form>
            </div>
            <p className="text-[12px] leading-[1.5] text-fg-caption">
              Only allowlisted accounts can sign in. The allowlist is enforced by a
              trigger on the database, so a stranger completing Google&apos;s OAuth
              flow never gets an account created at all.
            </p>
          </section>

          {/* -- google ----------------------------------------------------- */}
          <section className="space-y-2.5">
            <SectionHeading>Google Calendar</SectionHeading>
            <div className="rounded-lg bg-bg p-3 surface">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-fg">
                      {data.google.connected ? "Connected" : "Not connected"}
                    </span>
                    {data.google.connected ? (
                      <Chip tone="success">
                        <Check className="size-2.5" />
                        Read-only
                      </Chip>
                    ) : (
                      <Chip tone="neutral">
                        <X className="size-2.5" />
                        Off
                      </Chip>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-fg-caption">
                    {data.google.lastSyncedAt
                      ? `Last synced ${relativeTime(data.google.lastSyncedAt)}`
                      : "Never synced"}
                  </p>
                </div>

                {data.google.connected && (
                  <Button size="sm" onClick={sync} loading={syncing}>
                    {!syncing && <RefreshCw className="size-3.5" />}
                    Sync now
                  </Button>
                )}
              </div>

              {(!data.google.connected || data.google.needsReconnect) && (
                <div className="mt-3 border-t border-[var(--stroke)] pt-3">
                  <p className="mb-2.5 text-[12px] leading-[1.5] text-fg-muted">
                    {data.google.needsReconnect
                      ? "Google didn't hand back a refresh token last time, so calendar reads will stop once the current one expires. Reconnecting forces the consent screen and fixes it."
                      : "Connect your calendar to pull meetings in automatically."}
                  </p>
                  <GoogleSignIn
                    next="/settings"
                    label={data.google.needsReconnect ? "Reconnect Google" : "Connect Google Calendar"}
                    variant="secondary"
                    className="h-8"
                  />
                </div>
              )}
            </div>
          </section>

          {/* -- configuration ---------------------------------------------- */}
          <section className="space-y-2.5">
            <SectionHeading>Configuration</SectionHeading>
            {missing.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-yellow-500/[.09] p-2.5 text-[12px] leading-[1.5] text-fg-body">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" />
                <span>
                  {missing.length} setting{missing.length === 1 ? " is" : "s are"} missing.
                  Add {missing.length === 1 ? "it" : "them"} to <code className="font-mono text-[11px]">.env.local</code>{" "}
                  (and to your Vercel project) and restart.
                </span>
              </div>
            )}
            <div className="divide-y divide-[var(--stroke-weak)] overflow-hidden rounded-lg surface">
              {data.config.map((item) => (
                <div key={item.key} className="flex items-center gap-3 bg-bg px-3 py-2">
                  <span
                    className={
                      item.set
                        ? "grid size-4 shrink-0 place-items-center rounded-full bg-green-500 text-white"
                        : "grid size-4 shrink-0 place-items-center rounded-full bg-bg-inset text-fg-caption"
                    }
                  >
                    {item.set ? <Check className="size-2.5" strokeWidth={3.5} /> : <X className="size-2.5" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-fg-body">{item.label}</p>
                    <p className="truncate font-mono text-[11px] text-fg-caption">{item.key}</p>
                  </div>
                  {!item.set && (
                    <span className="shrink-0 text-[11px] text-fg-caption">{item.hint}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* -- data ------------------------------------------------------- */}
          <section className="space-y-2.5">
            <SectionHeading>Your data</SectionHeading>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["Tasks", data.counts.tasks],
                ["Meetings", data.counts.meetings],
                ["People", data.counts.people],
              ] as const).map(([label, count]) => (
                <div
                  key={label}
                  className="rounded-lg bg-bg p-3 surface"
                >
                  <p className="text-[22px] font-semibold tracking-[-0.02em] text-fg">{count}</p>
                  <p className="text-[12px] text-fg-caption">{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* -- appearance ------------------------------------------------- */}
          <section className="space-y-2.5">
            <SectionHeading>Appearance</SectionHeading>
            <div className="flex items-center justify-between rounded-lg bg-bg p-3 surface">
              <div>
                <p className="text-[13px] text-fg-body">Theme</p>
                <p className="text-[12px] text-fg-caption">Follows your system by default.</p>
              </div>
              <ThemeToggle />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
