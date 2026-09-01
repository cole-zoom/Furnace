import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { GoogleTokensInsert } from "@/lib/database.types";

/**
 * Google OAuth token custody + Calendar reads.
 *
 * Supabase Auth already performs the Google OAuth dance for sign-in, and hands
 * back `provider_token` / `provider_refresh_token` on the callback. Rather than
 * run a second, parallel OAuth flow just for Calendar, we ask for the calendar
 * scope up front and keep those tokens.
 *
 * They only ever exist server-side: encrypted at rest, stored in a table with
 * no RLS policies, read exclusively through the service-role client.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
].join(" ");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Refresh a minute early so a token can't expire mid-flight. */
const EXPIRY_SKEW_MS = 60_000;

interface StoreTokensInput {
  userId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresIn?: number | null;
  scope?: string | null;
}

export async function storeGoogleTokens({
  userId,
  accessToken,
  refreshToken,
  expiresIn,
  scope,
}: StoreTokensInput): Promise<void> {
  if (!accessToken && !refreshToken) return;

  const admin = createAdminClient();

  // Google only returns a refresh token on the first consent (or when forced
  // with prompt=consent). On subsequent logins the field is absent — writing
  // null would silently destroy our only long-lived credential, so preserve
  // whatever is already stored.
  const patch: GoogleTokensInsert = {
    user_id: userId,
    provider: "google",
    updated_at: new Date().toISOString(),
  };

  if (accessToken) {
    patch.access_token_enc = encryptSecret(accessToken);
    patch.expires_at = new Date(
      Date.now() + (expiresIn ?? 3600) * 1000,
    ).toISOString();
  }
  if (refreshToken) patch.refresh_token_enc = encryptSecret(refreshToken);
  if (scope) patch.scope = scope;

  const { error } = await admin
    .from("google_tokens")
    .upsert(patch, { onConflict: "user_id" });

  if (error) {
    throw new Error(`Failed to persist Google tokens: ${error.message}`);
  }
}

export interface GoogleConnection {
  connected: boolean;
  scope: string | null;
  lastSyncedAt: string | null;
  needsReconnect: boolean;
}

export async function getGoogleConnection(
  userId: string,
): Promise<GoogleConnection> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_tokens")
    .select("scope, last_synced_at, refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { connected: false, scope: null, lastSyncedAt: null, needsReconnect: false };
  }

  return {
    connected: Boolean(data.refresh_token_enc),
    scope: data.scope,
    lastSyncedAt: data.last_synced_at,
    // Signed in via Google but we never captured a refresh token — the user has
    // to re-consent before background calendar reads will work.
    needsReconnect: !data.refresh_token_enc,
  };
}

/**
 * Returns a usable access token for `userId`, transparently refreshing it.
 * Throws a descriptive error the UI can surface if the user must reconnect.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("google_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at, scope")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not read Google tokens: ${error.message}`);
  if (!data) throw new Error("GOOGLE_NOT_CONNECTED");

  const notExpired =
    data.expires_at && new Date(data.expires_at).getTime() - EXPIRY_SKEW_MS > Date.now();

  if (data.access_token_enc && notExpired) {
    return decryptSecret(data.access_token_enc);
  }

  if (!data.refresh_token_enc) throw new Error("GOOGLE_NEEDS_RECONSENT");
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set, so the access token cannot be refreshed.",
    );
  }

  const refreshToken = decryptSecret(data.refresh_token_enc);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    // invalid_grant means the user revoked access or the token aged out.
    if (detail.includes("invalid_grant")) throw new Error("GOOGLE_NEEDS_RECONSENT");
    throw new Error(`Google token refresh failed (${res.status}): ${detail}`);
  }

  const payload = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  await storeGoogleTokens({
    userId,
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    scope: payload.scope ?? data.scope,
  });

  return payload.access_token;
}

// ------------------------------------------------------------------ calendar

export interface CalendarEvent {
  id: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean; responseStatus?: string }>;
  organizer?: { email?: string; displayName?: string };
  hangoutLink?: string;
}

export async function listCalendarEvents(
  userId: string,
  { daysBack = 14, daysForward = 21 }: { daysBack?: number; daysForward?: number } = {},
): Promise<CalendarEvent[]> {
  const accessToken = await getValidAccessToken(userId);

  const timeMin = new Date(Date.now() - daysBack * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + daysForward * 86_400_000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true", // expand recurring events into concrete instances
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (res.status === 401 || res.status === 403) throw new Error("GOOGLE_NEEDS_RECONSENT");
  if (!res.ok) {
    throw new Error(`Google Calendar returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { items?: CalendarEvent[] };
  return (body.items ?? []).filter((e) => e.status !== "cancelled");
}

export async function markSynced(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("google_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);
}
