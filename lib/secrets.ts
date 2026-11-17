import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encryption for user-supplied model API keys.
 *
 * Keys are sealed with AES-256-GCM before they touch Postgres and only opened
 * inside the agent runtime. The wrapping key is derived from `AI_SECRET_KEY`
 * (falling back to `AUTH_SECRET_KEY`, which every deployment already sets), so
 * rotating that secret makes old ciphertext unreadable — the picker then asks
 * the user to re-enter the key instead of failing a chat turn.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function secretMaterial(): string {
  const secret = process.env.AI_SECRET_KEY?.trim() || process.env.AUTH_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error("AI_SECRET_KEY or AUTH_SECRET_KEY must be set to store model credentials.");
  }
  return secret;
}

let cachedKey: { material: string; key: Buffer } | null = null;

function wrappingKey(): Buffer {
  const material = secretMaterial();
  if (cachedKey?.material === material) return cachedKey.key;

  const key = scryptSync(material, "alcatraz-agent-model-keys", 32);
  cachedKey = { material, key };
  return key;
}

/** Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, wrappingKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Throws when the payload is malformed or the secret changed. */
export function decryptSecret(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Stored model key has an unsupported format.");
  }

  const decipher = createDecipheriv(ALGORITHM, wrappingKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
