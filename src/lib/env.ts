import "server-only";

/**
 * Configuration access.
 *
 * Every field is a getter, deliberately. The obvious shape —
 *
 *     export const env = { supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL") }
 *
 * — evaluates at module load, and Next imports every route module during the
 * "Collecting page data" phase of `next build`. So a missing variable doesn't
 * produce a helpful runtime error, it fails the *build*, before the deploy has
 * any chance to supply the value. That's exactly backwards for a first deploy:
 * you can't get a URL to configure until the build passes, and the build won't
 * pass until it's configured.
 *
 * With getters, importing is always safe and the check moves to first read —
 * which happens inside a request, where the error can actually be surfaced to
 * someone who can fix it. Settings renders a checklist from the `optional`
 * fields for exactly this reason.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in .env.local locally, or in your Vercel project settings.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabasePublishableKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  get supabaseServiceRoleKey() {
    return optional("SUPABASE_SERVICE_ROLE_KEY");
  },
  get googleClientId() {
    return optional("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return optional("GOOGLE_CLIENT_SECRET");
  },
  get geminiApiKey() {
    return optional("GEMINI_API_KEY");
  },
  get tokenEncryptionKey() {
    return optional("TOKEN_ENCRYPTION_KEY");
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  },

  /**
   * Belt-and-braces companion to the database allowlist trigger. The database
   * is the real gate; this just lets us refuse politely before we get there.
   */
  get allowedEmails(): string[] {
    return (process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },

  /** True once the app has enough configuration to actually sign someone in. */
  get isConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
} as const;

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = env.allowedEmails;
  // An empty allowlist means "not configured" — deny rather than allow-all.
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}
