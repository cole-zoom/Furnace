import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGoogleConnection } from "@/lib/google";
import { env } from "@/lib/env";
import { SettingsView, type SettingsData } from "@/components/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // A missing service-role key makes getGoogleConnection throw; that's a
  // configuration problem, not a reason to fail the whole page.
  const google = await getGoogleConnection(user.id).catch(() => ({
    connected: false,
    scope: null,
    lastSyncedAt: null,
    needsReconnect: false,
  }));

  const [tasks, meetings, people] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("meetings").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("people").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  // Only ever reports whether a value is present — never the value itself.
  const data: SettingsData = {
    email: user.email ?? "",
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined),
    google,
    config: [
      {
        key: "SUPABASE_SERVICE_ROLE_KEY",
        label: "Supabase service role key",
        set: Boolean(env.supabaseServiceRoleKey),
        hint: "Needed for calendar sync",
      },
      {
        key: "GOOGLE_CLIENT_ID",
        label: "Google OAuth client ID",
        set: Boolean(env.googleClientId),
        hint: "Needed to refresh tokens",
      },
      {
        key: "GOOGLE_CLIENT_SECRET",
        label: "Google OAuth client secret",
        set: Boolean(env.googleClientSecret),
        hint: "Needed to refresh tokens",
      },
      {
        key: "GEMINI_API_KEY",
        label: "Gemini API key",
        set: Boolean(env.geminiApiKey),
        hint: "Needed to summarise transcripts",
      },
      {
        key: "TOKEN_ENCRYPTION_KEY",
        label: "Token encryption key",
        set: Boolean(env.tokenEncryptionKey),
        hint: "Encrypts Google tokens at rest",
      },
      {
        key: "ALLOWED_EMAILS",
        label: "Sign-in allowlist",
        set: env.allowedEmails.length > 0,
        hint: "Nobody can sign in without it",
      },
    ],
    counts: {
      tasks: tasks.count ?? 0,
      meetings: meetings.count ?? 0,
      people: people.count ?? 0,
    },
  };

  return <SettingsView data={data} />;
}
