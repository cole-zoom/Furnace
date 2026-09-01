import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env, isEmailAllowed } from "@/lib/env";
import { storeGoogleTokens } from "@/lib/google";
import type { AuthErrorCode } from "@/lib/auth-errors";

/**
 * OAuth landing strip.
 *
 * Supabase sends the browser here with a one-time `code`. We trade it for a
 * session, re-check the allowlist, and — because we asked Google for calendar
 * scopes during sign-in — quietly bank the provider tokens that come back with
 * it. `provider_refresh_token` is only present on this exchange; if we don't
 * capture it here, it's gone until the user re-consents.
 */

/** Hostname, optionally with a port. Nothing that could carry a path or scheme. */
const SAFE_HOST = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;

/**
 * Where to send the browser afterwards.
 *
 * `x-forwarded-host` is set by the platform edge in production, but it's still
 * a client-controllable header in principle, and this response carries the
 * session cookie — so it's the last place to be relaxed about redirect targets.
 * A configured NEXT_PUBLIC_SITE_URL wins outright; the forwarded host is only
 * consulted as a fallback, and only if it looks like a bare hostname.
 */
function resolveBase(request: NextRequest): string {
  const { origin } = request.nextUrl;

  if (process.env.NODE_ENV === "development") return origin;

  if (env.siteUrl && /^https?:\/\//.test(env.siteUrl)) {
    return env.siteUrl.replace(/\/+$/, "");
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && SAFE_HOST.test(forwardedHost)) {
    return `https://${forwardedHost}`;
  }

  return origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  // Only allow relative redirects — an open redirect here would let someone
  // bounce a freshly authenticated session to a site they control.
  const rawNext = searchParams.get("next") ?? "/tasks";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/tasks";

  const base = resolveBase(request);

  /** Never reflects provider text — only a code the error page knows about. */
  const fail = (reason: AuthErrorCode) =>
    NextResponse.redirect(`${base}/auth/auth-error?code=${reason}`);

  if (searchParams.get("error") || searchParams.get("error_description")) {
    return fail("oauth_denied");
  }
  if (!code) return fail("no_code");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const message = error?.message ?? "";
    // The database allowlist trigger aborts the signup transaction, which
    // surfaces here as a generic exchange failure. Name it properly.
    console.error("[auth/callback] code exchange failed:", message);
    return fail(
      /database error|unexpected_failure/i.test(message)
        ? "not_allowlisted"
        : "exchange_failed",
    );
  }

  const { session } = data;

  if (!isEmailAllowed(session.user.email)) {
    await supabase.auth.signOut();
    return fail("not_allowlisted");
  }

  // Best-effort: a calendar-token hiccup should never block signing in.
  try {
    await storeGoogleTokens({
      userId: session.user.id,
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token,
      expiresIn: 3600,
    });
  } catch (err) {
    console.error(
      "[auth/callback] could not store Google tokens:",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  return NextResponse.redirect(`${base}${next}`);
}
