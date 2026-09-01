import "server-only";

/**
 * Fail fast and loudly on missing configuration. A half-configured deploy that
 * boots and then 500s on the first Supabase call is much harder to debug than
 * one that refuses to start.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),
  geminiApiKey: optional("GEMINI_API_KEY"),
  tokenEncryptionKey: optional("TOKEN_ENCRYPTION_KEY"),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",

  /**
   * Belt-and-braces companion to the database allowlist trigger. The database
   * is the real gate; this just lets us refuse politely before we get there.
   */
  allowedEmails: (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
} as const;

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  // An empty allowlist means "not configured" — deny rather than allow-all.
  if (env.allowedEmails.length === 0) return false;
  return env.allowedEmails.includes(email.toLowerCase());
}
