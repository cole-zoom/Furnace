/**
 * Sign-in failures are reported as a fixed code, never as free text from the
 * query string. Rendering an attacker-supplied `reason` isn't XSS — React
 * escapes it — but it does let anyone put arbitrary first-party-looking prose
 * on our domain, which is a phishing surface for the price of a link.
 */
export const AUTH_ERROR_CODES = [
  "oauth_denied",
  "no_code",
  "not_allowlisted",
  "exchange_failed",
  "unknown",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const COPY: Record<AuthErrorCode, string> = {
  oauth_denied:
    "Google didn't complete the sign-in. If you cancelled, just try again.",
  no_code:
    "Google didn't send an authorization code back. Try signing in again.",
  not_allowlisted:
    "That Google account isn't on the allowlist for this Furnace.",
  exchange_failed:
    "We couldn't establish a session from that sign-in. Try again.",
  unknown: "Something went wrong while signing you in.",
};

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return (
    typeof value === "string" &&
    (AUTH_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function authErrorMessage(value: unknown): string {
  return COPY[isAuthErrorCode(value) ? value : "unknown"];
}
