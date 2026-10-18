import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEmailAllowed, appMode } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/elevenlabs/server";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("single-account access", () => {
  beforeEach(() => {
    process.env.HABLO_ALLOWED_EMAIL = "Me@Example.com";
  });
  it("allows only the configured e-mail (case-insensitive)", () => {
    expect(isEmailAllowed("me@example.com")).toBe(true);
    expect(isEmailAllowed(" ME@EXAMPLE.COM ")).toBe(true);
    expect(isEmailAllowed("someone@example.com")).toBe(false);
    expect(isEmailAllowed(null)).toBe(false);
  });
  it("denies everyone when no e-mail is configured", () => {
    delete process.env.HABLO_ALLOWED_EMAIL;
    expect(isEmailAllowed("me@example.com")).toBe(false);
  });
  it("never falls back to demo mode silently", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.HABLO_DEMO_MODE;
    expect(appMode()).toBe("unconfigured");
    process.env.HABLO_DEMO_MODE = "1";
    expect(appMode()).toBe("demo");
  });

  it("rejects and signs out a valid Supabase session of another user (server-side)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    const signOut = vi.fn(async () => ({ error: null }));
    vi.doMock("@/lib/supabase/server", () => ({
      createUserClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1", email: "intruder@example.com" } }, error: null }), signOut },
      }),
      createServiceClient: () => null,
    }));
    vi.doMock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`); } }));
    const { getSession } = await import("@/lib/session");
    expect(await getSession()).toBeNull();
    expect(signOut).toHaveBeenCalled();
  });
});

describe("ElevenLabs webhook signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "c1" } });
  const sign = (t: number, b = body) => `t=${t},v0=${createHmac("sha256", secret).update(`${t}.${b}`).digest("hex")}`;
  it("accepts a valid signature", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(body, sign(t), secret)).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets, stale timestamps and missing headers", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(body + " ", sign(t), secret)).toBe(false);
    expect(verifyWebhookSignature(body, sign(t), "other")).toBe(false);
    expect(verifyWebhookSignature(body, sign(t - 3600), secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });
});
