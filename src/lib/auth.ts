import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/env";

/**
 * The data access layer's front door.
 *
 * Every page, Server Action and Route Handler calls one of these before it
 * touches data. Proxy redirects are a nicety for humans; this is the check that
 * actually holds, because it runs inside the request that does the work.
 */

export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // A session can outlive a change to the allowlist. Re-check every time so
  // revoking access is immediate rather than "whenever their token expires".
  if (!isEmailAllowed(user.email)) return null;

  return user;
}

/** Returns the user, or redirects to /login and never returns. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Route-handler variant: no redirect, just null, so the caller can answer with
 * a 401 instead of an HTML login page.
 */
export async function requireApiUser(): Promise<User | null> {
  return getUser();
}
