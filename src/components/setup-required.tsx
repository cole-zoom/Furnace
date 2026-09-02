import { Check, X } from "lucide-react";
import { FurnaceMark } from "@/components/furnace-mark";

/**
 * Shown instead of a generic 500 when the app has no Supabase credentials.
 *
 * Without this, a fresh deploy renders the error boundary — "Something broke
 * while loading this page" — and the actual cause sits in the server logs where
 * you have to go looking for it. A missing environment variable is the single
 * most likely reason this app fails, and it's completely diagnosable, so it
 * should diagnose itself.
 *
 * Reports presence only. Never a value.
 */

interface Item {
  key: string;
  what: string;
  where: string;
  required: boolean;
}

const VARS: Item[] = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    what: "Supabase project URL",
    where: "Supabase → Project Settings → API",
    required: true,
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    what: "Supabase publishable key",
    where: "Supabase → Project Settings → API Keys",
    required: true,
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    what: "Supabase service role key",
    where: "Supabase → Project Settings → API Keys",
    required: false,
  },
  {
    key: "GOOGLE_CLIENT_ID",
    what: "Google OAuth client ID",
    where: "Google Cloud → APIs & Services → Credentials",
    required: false,
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    what: "Google OAuth client secret",
    where: "Google Cloud → APIs & Services → Credentials",
    required: false,
  },
  {
    key: "GEMINI_API_KEY",
    what: "Gemini API key",
    where: "aistudio.google.com/apikey",
    required: false,
  },
  {
    key: "TOKEN_ENCRYPTION_KEY",
    what: "Token encryption key",
    where: "openssl rand -base64 32",
    required: false,
  },
  {
    key: "ALLOWED_EMAILS",
    what: "Sign-in allowlist",
    where: "your own email address",
    required: false,
  },
  {
    key: "NEXT_PUBLIC_SITE_URL",
    what: "Public site URL",
    where: "this deployment's domain",
    required: false,
  },
];

export function SetupRequired() {
  const rows = VARS.map((v) => ({ ...v, set: Boolean(process.env[v.key]) }));
  const missingRequired = rows.filter((r) => r.required && !r.set);

  return (
    <div className="flex min-h-dvh items-start justify-center bg-bg px-5 py-14">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 flex justify-center">
          <FurnaceMark size={56} lit={false} />
        </div>

        <h1 className="text-center text-[22px] font-semibold tracking-[-0.025em] text-fg">
          Furnace isn&apos;t configured yet
        </h1>
        <p className="mx-auto mt-2 max-w-[420px] text-center text-[13px] leading-[1.55] text-fg-muted">
          {missingRequired.length > 0 ? (
            <>
              {missingRequired.length === 1
                ? "One required variable is"
                : `${missingRequired.length} required variables are`}{" "}
              missing. Add {missingRequired.length === 1 ? "it" : "them"} in your
              Vercel project settings (or <code className="font-mono text-[12px]">.env.local</code>{" "}
              locally), then redeploy.
            </>
          ) : (
            <>Almost there — the optional pieces below unlock calendar sync and transcripts.</>
          )}
        </p>

        <div className="mt-6 divide-y divide-[var(--stroke-weak)] overflow-hidden rounded-lg surface">
          {rows.map((row) => (
            <div key={row.key} className="flex items-start gap-3 bg-bg px-3 py-2.5">
              <span
                className={
                  row.set
                    ? "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-green-500 text-white"
                    : row.required
                      ? "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-red-500 text-white"
                      : "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-bg-inset text-fg-caption"
                }
              >
                {row.set ? (
                  <Check className="size-2.5" strokeWidth={3.5} />
                ) : (
                  <X className="size-2.5" strokeWidth={3} />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] text-fg-body">
                  {row.what}
                  {row.required && !row.set && (
                    <span className="rounded bg-red-500/12 px-1 text-[10px] font-semibold uppercase tracking-wide text-danger">
                      required
                    </span>
                  )}
                </p>
                <p className="break-all font-mono text-[11px] text-fg-caption">{row.key}</p>
              </div>

              {!row.set && (
                <span className="hidden w-[190px] shrink-0 pt-0.5 text-right text-[11px] leading-[1.45] text-fg-caption sm:block">
                  {row.where}
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[12px] leading-[1.6] text-fg-caption">
          Don&apos;t forget <code className="font-mono">supabase db push</code> to create the
          tables, and add this domain&apos;s{" "}
          <code className="font-mono">/auth/callback</code> to Supabase&apos;s redirect
          allowlist.
        </p>
      </div>
    </div>
  );
}
