import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { SetupRequired } from "@/components/setup-required";
import { env } from "@/lib/env";

/**
 * The authenticated half of the app. `requireUser()` runs on every request into
 * this segment — proxy.ts already redirected anonymous visitors, but that's a
 * convenience layer, and this is the check that actually gates rendering.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Without this, an unconfigured deploy throws inside the Supabase client and
  // renders the generic error boundary, leaving the real cause in the logs.
  if (!env.isConfigured) return <SetupRequired />;

  const user = await requireUser();

  return (
    <AppShell
      email={user.email ?? ""}
      name={
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined)
      }
    >
      {children}
    </AppShell>
  );
}
