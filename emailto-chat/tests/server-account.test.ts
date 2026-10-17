import "./helpers/env";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as conversationsRoute } from "@/app/api/conversations/route";
import { GET as meRoute } from "@/app/api/me/route";
import { PATCH as prefsRoute } from "@/app/api/preferences/route";
import { GET as syncGet, POST as syncPost } from "@/app/api/sync/route";
import { GET as threadRoute } from "@/app/api/threads/[threadId]/route";
import { DELETE as deleteAccountRoute } from "@/app/api/account/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { disconnectAccount } from "@/server/auth/account";
import { db } from "@/server/db";
import { setGmailFactory } from "@/server/gmail/factory";
import { resetRateLimits } from "@/server/security/rate-limit";
import { sha256Hex } from "@/server/security/crypto";
import { runSync } from "@/server/sync/engine";
import { resetDb, setupTestDb } from "./helpers/db";
import { apiRequest, createTestAccount, ME, routeCtx } from "./helpers/fixtures";

const dbState = await setupTestDb();

describe.skipIf(!dbState.ok)("account lifecycle, sessions, isolation", () => {
  beforeEach(async () => {
    await resetDb();
    resetRateLimits();
  });
  afterAll(() => setGmailFactory(null));

  it("8. disconnect → tokens and all mail data deleted; later API calls fail without touching Gmail", async () => {
    const { account, gmail, token, user } = await createTestAccount();
    gmail.addMessage({
      from: "Anna <anna@example.com>",
      to: [ME, "bob@example.com"],
      subject: "With file",
      attachments: [{ filename: "a.pdf", mimeType: "application/pdf", data: new Uint8Array([1]) }],
    });
    await runSync(account.id, { gmail });
    await db.mailAccount.update({ where: { id: account.id }, data: { pushExpiration: new Date(Date.now() + 86400_000) } });
    await db.draft.create({ data: { accountId: account.id, gmailDraftId: "r-1" } });
    await db.outboundMessage.create({ data: { accountId: account.id, idempotencyKey: "k_12345678", rfcMessageId: "<k@x>" } });
    expect(await db.emailThread.count()).toBe(1);

    const revoke = vi.fn(async () => undefined);
    await disconnectAccount(account.id, { gmail, revoke });
    expect(revoke).toHaveBeenCalledWith("fake-refresh-token");
    expect(gmail.calls.stop).toBe(1);

    expect(await db.mailAccount.count()).toBe(0);
    for (const count of [
      db.emailThread.count(),
      db.emailMessage.count(),
      db.contact.count(),
      db.threadParticipant.count(),
      db.attachmentMetadata.count(),
      db.draft.count(),
      db.outboundMessage.count(),
      db.syncState.count(),
    ]) {
      expect(await count).toBe(0);
    }
    // The user and session remain (signed in, Gmail disconnected).
    expect(await db.user.count()).toBe(1);

    const callsBefore = gmail.totalCalls;
    const conv = await conversationsRoute(apiRequest("/api/conversations?mailbox=inbox", { token }));
    expect(conv.status).toBe(403);
    expect((await conv.json()).error.code).toBe("needs_reauth");
    const thread = await threadRoute(apiRequest("/api/threads/abc", { token }), routeCtx({ threadId: "abc" }));
    expect(thread.status).toBe(403);
    const sync = await syncPost(apiRequest("/api/sync", { method: "POST", token }));
    expect((await sync.json()).state).toBe("disconnected");
    expect(gmail.totalCalls).toBe(callsBefore);

    const me = await (await meRoute(apiRequest("/api/me", { token }))).json();
    expect(me).toMatchObject({ mode: "live", user: { id: user.id }, mailAccount: null });
  });

  it("unauthenticated requests get 401; sessions are stored hashed; logout invalidates", async () => {
    const { token } = await createTestAccount();
    const anon = await conversationsRoute(apiRequest("/api/conversations"));
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: { code: "unauthorized", message: "Not signed in" } });
    const forged = await conversationsRoute(apiRequest("/api/conversations", { token: "x".repeat(43) }));
    expect(forged.status).toBe(401);

    expect(await db.session.findUnique({ where: { id: sha256Hex(token) } })).not.toBeNull();
    expect(await db.session.findUnique({ where: { id: token } })).toBeNull();

    const out = await logoutRoute(apiRequest("/api/auth/logout", { method: "POST", token }));
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toMatch(/etc_session=; Path=\/; Max-Age=0/);
    expect((await meRoute(apiRequest("/api/me", { token }))).status).toBe(401);
  });

  it("logout from a plain HTML form → 303 to / (CSRF still enforced)", async () => {
    const { token } = await createTestAccount();
    const form = { "content-type": "application/x-www-form-urlencoded", accept: "text/html" };
    const evil = await logoutRoute(apiRequest("/api/auth/logout", { method: "POST", token, origin: "https://evil.example", headers: form }));
    expect(evil.status).toBe(403);
    const res = await logoutRoute(apiRequest("/api/auth/logout", { method: "POST", token, headers: form }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await db.session.count()).toBe(0);
  });

  it("expired sessions are rejected; old sessions slide", async () => {
    const { token, user } = await createTestAccount();
    await db.session.update({ where: { id: sha256Hex(token) }, data: { lastSeenAt: new Date(Date.now() - 2 * 86400_000) } });
    const res = await meRoute(apiRequest("/api/me", { token }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/etc_session=.*HttpOnly; SameSite=Lax/);
    const s = await db.session.findUniqueOrThrow({ where: { id: sha256Hex(token) } });
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);

    await db.session.update({ where: { id: sha256Hex(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await meRoute(apiRequest("/api/me", { token }))).status).toBe(401);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("strict isolation: another user's conversation ids are not found", async () => {
    const a = await createTestAccount({ email: "alice@example.com" });
    a.gmail.addMessage({ from: "secret@example.com", to: ["alice@example.com"], subject: "Private" });
    await runSync(a.account.id, { gmail: a.gmail });
    const contact = await db.contact.findFirstOrThrow({ where: { accountId: a.account.id } });

    const b = await createTestAccount({ email: "bob@example.com" });
    const { GET: personRoute } = await import("@/app/api/conversations/person/[id]/route");
    const res = await personRoute(apiRequest(`/api/conversations/person/${contact.id}`, { token: b.token }), routeCtx({ id: contact.id }));
    expect(res.status).toBe(404);
    const own = await personRoute(apiRequest(`/api/conversations/person/${contact.id}`, { token: a.token }), routeCtx({ id: contact.id }));
    expect(own.status).toBe(200);
  });

  it("preferences PATCH validates and persists; /api/me returns AccountInfo", async () => {
    const { token } = await createTestAccount();
    const res = await prefsRoute(apiRequest("/api/preferences", { method: "PATCH", token, body: { theme: "dark", pollIntervalSec: 60 } }));
    expect(await res.json()).toEqual({ enterToSend: true, theme: "dark", alwaysLoadRemoteImages: false, pollIntervalSec: 60 });
    const bad = await prefsRoute(apiRequest("/api/preferences", { method: "PATCH", token, body: { theme: "neon" } }));
    expect(bad.status).toBe(400);
    const unknown = await prefsRoute(apiRequest("/api/preferences", { method: "PATCH", token, body: { admin: true } }));
    expect(unknown.status).toBe(400);
    const me = await (await meRoute(apiRequest("/api/me", { token }))).json();
    expect(me.mailAccount).toEqual({ email: ME, status: "active", aliases: [ME], pushEnabled: false });
    expect(me.preferences.theme).toBe("dark");
  });

  it("GET /api/sync reports status without calling Gmail; needs_reauth surfaces", async () => {
    const { token, gmail, account } = await createTestAccount();
    const s1 = await (await syncGet(apiRequest("/api/sync", { token }))).json();
    expect(s1).toMatchObject({ state: "idle", initialSyncComplete: false });
    expect(gmail.totalCalls).toBe(0);
    const s2 = await (await syncPost(apiRequest("/api/sync", { method: "POST", token }))).json();
    expect(s2).toMatchObject({ state: "idle", initialSyncComplete: true, backfillComplete: true });

    await db.mailAccount.update({ where: { id: account.id }, data: { status: "needs_reauth" } });
    const s3 = await (await syncPost(apiRequest("/api/sync", { method: "POST", token }))).json();
    expect(s3.state).toBe("needs_reauth");
    const thread = await threadRoute(apiRequest("/api/threads/abc", { token }), routeCtx({ threadId: "abc" }));
    expect(thread.status).toBe(403);
    expect((await thread.json()).error.code).toBe("needs_reauth");
    // Local sidebar still readable while re-auth is pending.
    expect((await conversationsRoute(apiRequest("/api/conversations", { token }))).status).toBe(200);
  });

  it("DELETE /api/account deletes user, sessions, preferences and mail data", async () => {
    const { token, gmail, account } = await createTestAccount();
    gmail.addMessage({ from: "anna@example.com", to: [ME], subject: "x" });
    await runSync(account.id, { gmail });
    await prefsRoute(apiRequest("/api/preferences", { method: "PATCH", token, body: { theme: "dark" } }));
    // Revocation would call Google: run this path without stored tokens.
    await db.mailAccount.update({ where: { id: account.id }, data: { refreshToken: null, accessToken: null } });
    const res = await deleteAccountRoute(apiRequest("/api/account", { method: "DELETE", token }));
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    for (const c of [db.user.count(), db.session.count(), db.userPreference.count(), db.mailAccount.count(), db.emailThread.count()]) {
      expect(await c).toBe(0);
    }
  });

  it("CSRF: mutating routes require a same-origin Origin/Referer", async () => {
    const { token } = await createTestAccount();
    const noOrigin = await prefsRoute(apiRequest("/api/preferences", { method: "PATCH", token, body: { theme: "dark" }, origin: null }));
    expect(noOrigin.status).toBe(403);
    const evil = await prefsRoute(apiRequest("/api/preferences", { method: "PATCH", token, body: { theme: "dark" }, origin: "https://evil.com" }));
    expect(evil.status).toBe(403);
    const referer = await prefsRoute(
      apiRequest("/api/preferences", { method: "PATCH", token, body: { theme: "dark" }, origin: null, headers: { referer: "http://localhost:3000/app" } }),
    );
    expect(referer.status).toBe(200);
  });
});
