import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/env";
import { storeGoogleTokens } from "@/lib/google";

/**
 * OAuth landing strip.
 *
 * Supabase sends the browser here with a one-time `code`. We trade it for a
 * session, re-check the allowlist, and — because we asked Google for calendar
 * scopes during sign-in — quietly bank the provider tokens that come back with
 * it. `provider_refresh_token` is only present on this exchange; if we don't
 * capture it here, it's gone until the user re-consents.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  // Only allow relative redirects — an open redirect here would let someone
  // bounce a freshly authenticated session to a site they control.
  const rawNext = searchParams.get("next") ?? "/tasks";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/tasks";

  // Vercel terminates TLS at the edge, so trust the forwarded host in prod.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base = isLocal || !forwardedHost ? origin : `https://${forwardedHost}`;

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${base}/auth/auth-error?reason=${encodeURIComponent(reason)}`,
    );

  if (oauthError) return fail(oauthError);
  if (!code) return fail("No authorization code was returned.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    // The database allowlist trigger aborts the signup transaction, which
    // surfaces here as a generic exchange failure. Name it properly.
    const message = error?.message ?? "Could not establish a session.";
    return fail(
      /database error|unexpected_failure/i.test(message)
        ? "That Google account isn't on the allowlist for this Furnace."
        : message,
    );
  }

  const { session } = data;
  const email = session.user.email;

  if (!isEmailAllowed(email)) {
    await supabase.auth.signOut();
    return fail("That Google account isn't on the allowlist for this Furnace.");
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
    console.error("[auth/callback] could not store Google tokens:", err);
  }

  return NextResponse.redirect(`${base}${next}`);
}
