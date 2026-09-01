import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

/**
 * AES-256-GCM for Google OAuth tokens at rest.
 *
 * The refresh token is the crown jewel here — it grants long-lived access to
 * the user's calendar and (later) mail. Supabase already keeps the row behind
 * service_role-only access, but a database dump, a log leak, or a misconfigured
 * backup shouldn't hand anyone a working token. Encrypting with a key that
 * lives in the app environment rather than the database means an attacker needs
 * both to win.
 *
 * Layout: [12-byte IV][16-byte auth tag][ciphertext], base64.
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  if (!env.tokenEncryptionKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  const decoded = Buffer.from(env.tokenEncryptionKey, "base64");
  if (decoded.length !== KEY_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes, got ${decoded.length}. ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }

  cachedKey = decoded;
  return decoded;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error("Ciphertext is too short to be valid");
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time compare, for anything that gates access on a secret value. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
