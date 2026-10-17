import "./helpers/env";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "@/server/env";
import { isAllowedOrigin } from "@/server/security/csrf";
import { decrypt, encrypt, signJson, verifySignedJson } from "@/server/security/crypto";
import { resetRateLimits, takeToken } from "@/server/security/rate-limit";
import { classifyGoogleError, withRetry } from "@/server/gmail/retry";
import { GmailError } from "@/server/gmail/errors";

describe("AES-256-GCM token encryption", () => {
  it("round-trips with a versioned format and random IVs", () => {
    const a = encrypt("ya29.secret-token");
    const b = encrypt("ya29.secret-token");
    expect(a).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("ya29.secret-token");
    expect(a).not.toContain("secret");
  });

  it("detects tampering and wrong keys", () => {
    const enc = encrypt("token");
    const [v, iv, tag, ct] = enc.split(":");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => decrypt([v, iv, tag, flipped.toString("base64url")].join(":"))).toThrow();
    expect(() => decrypt(enc, randomBytes(32))).toThrow();
    expect(() => decrypt("v2:a:b:c")).toThrow(/unsupported/);
  });
});

describe("signed state cookie", () => {
  it("verifies, rejects modifications", () => {
    const s = signJson({ intent: "login", state: "abc" });
    expect(verifySignedJson(s)).toEqual({ intent: "login", state: "abc" });
    const [body, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ intent: "connect", state: "abc" })).toString("base64url");
    expect(verifySignedJson(`${forged}.${sig}`)).toBeNull();
    expect(verifySignedJson(`${body}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`)).toBeNull();
    expect(verifySignedJson(null)).toBeNull();
  });
});

describe("CSRF origin rules", () => {
  it("allows the app origin, localhost only in dev", () => {
    expect(isAllowedOrigin("https://emailto.chat", "https://emailto.chat", true)).toBe(true);
    expect(isAllowedOrigin("https://evil.chat", "https://emailto.chat", true)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3001", "https://emailto.chat", true)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3001", "https://emailto.chat", false)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", "https://emailto.chat", false)).toBe(true);
  });
});

describe("rate limiter", () => {
  it("token bucket limits bursts per key", async () => {
    resetRateLimits();
    let limited = 0;
    for (let i = 0; i < 8; i++) if ((await takeToken("sync", "user-a")) > 0) limited++;
    expect(limited).toBe(2); // capacity 6
    expect(await takeToken("sync", "user-b")).toBe(0);
  });
});

describe("env", () => {
  it("is validated lazily and reports only variable names", () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    resetEnvCache();
    expect(() => getEnv()).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => getEnv()).not.toThrow(/too-short/);
    process.env.TOKEN_ENCRYPTION_KEY = saved;
    resetEnvCache();
    const env = getEnv();
    expect(env.MAX_BACKFILL_THREADS).toBe(1500);
    expect(env.MAX_UPLOAD_MB).toBe(20);
    expect(env.PUBSUB_AUDIENCE).toBe("http://localhost:3000/api/webhooks/gmail");
  });

  it("MAX_UPLOAD_MB defaults to 4 on Vercel", () => {
    process.env.VERCEL = "1";
    resetEnvCache();
    expect(getEnv().MAX_UPLOAD_MB).toBe(4);
    delete process.env.VERCEL;
    resetEnvCache();
  });
});

describe("Gmail error classification + retry", () => {
  it("maps Google errors", () => {
    expect(classifyGoogleError({ status: 404 }).kind).toBe("not_found");
    expect(classifyGoogleError({ status: 401 }).kind).toBe("needs_reauth");
    expect(classifyGoogleError({ response: { status: 400, data: { error: "invalid_grant" } } }).kind).toBe("needs_reauth");
    expect(classifyGoogleError({ status: 403, response: { status: 403, data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } } } }).kind).toBe("rate_limited");
    expect(classifyGoogleError({ status: 403, response: { status: 403, data: { error: { errors: [{ reason: "insufficientPermissions" }] } } } }).kind).toBe("needs_reauth");
    expect(classifyGoogleError({ status: 503 }).kind).toBe("server");
    expect(classifyGoogleError(new Error("ECONNRESET")).kind).toBe("network");
  });

  it("retries 429/5xx with backoff, not 4xx", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const res = await withRetry(
      async () => {
        n++;
        if (n < 3) throw { status: n === 1 ? 429 : 503 };
        return "ok";
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(res).toBe("ok");
    expect(n).toBe(3);
    expect(sleeps).toHaveLength(2);

    let m = 0;
    await expect(withRetry(async () => { m++; throw { status: 400 }; }, { sleep: async () => {} })).rejects.toBeInstanceOf(GmailError);
    expect(m).toBe(1);

    let k = 0;
    await expect(withRetry(async () => { k++; throw { status: 500 }; }, { sleep: async () => {} })).rejects.toMatchObject({ kind: "server" });
    expect(k).toBe(5);
  });
});
