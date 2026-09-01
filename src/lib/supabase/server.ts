import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/**
 * Server client, scoped to the caller's session cookies. Still passes through
 * RLS — this is not an escape hatch, it's the same permissions the browser has,
 * just executed server-side.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Next 16 forbids writing cookies during Server Component render.
            // Harmless here: proxy.ts refreshes the session on every request,
            // so the rotated tokens are already on their way to the browser.
          }
        },
      },
    },
  );
}
