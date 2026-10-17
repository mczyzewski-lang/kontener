/**
 * Crypto primitives (Node runtime only).
 *  - AES-256-GCM token encryption, versioned format `v1:<iv>:<tag>:<ciphertext>` (base64url parts).
 *  - sha256 for session ids, HMAC-SHA256 for signed cookies, constant-time comparisons.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "../env";

const VERSION = "v1";

function key(): Buffer {
  return Buffer.from(getEnv().TOKEN_ENCRYPTION_KEY, "base64");
}

export function encrypt(plaintext: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(":");
}

export function decrypt(payload: string, k: Buffer = key()): string {
  const [version, iv, tag, ct] = payload.split(":");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("decrypt: unsupported payload format");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptOptional(v: string | null | undefined): string | null {
  return v ? encrypt(v) : null;
}

export function decryptOptional(v: string | null | undefined): string | null {
  return v ? decrypt(v) : null;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function hmac(value: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(value).digest("base64url");
}

/** `<base64url(json)>.<hmac>` */
export function signJson(data: unknown): string {
  const body = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifySignedJson<T>(signed: string | null | undefined): T | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  if (!safeEqual(sig, hmac(body))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
