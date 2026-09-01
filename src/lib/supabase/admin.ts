import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS ENTIRELY.
 *
 * Only two things legitimately need it, and both are google_tokens operations
 * that the browser must never be able to perform: storing the OAuth tokens we
 * receive at login, and reading them back to call Google on the user's behalf.
 *
 * Rules for anything that touches this client:
 *   - never import it into a Client Component (the `server-only` guard makes
 *     that a build error rather than a runtime surprise)
 *   - always scope the query by a user_id you derived from `auth.getUser()`,
 *     never from a request body or query parameter
 */
export function createAdminClient() {
  if (!env.supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Google Calendar sync needs it to " +
        "read and write the google_tokens table.",
    );
  }

  return createSupabaseClient<Database>(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
