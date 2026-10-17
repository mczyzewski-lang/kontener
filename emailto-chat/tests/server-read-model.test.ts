import "./helpers/env";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as lookupRoute } from "@/app/api/people/lookup/route";
import { GET as searchRoute } from "@/app/api/search/route";
import { GET as threadRoute } from "@/app/api/threads/[threadId]/route";
import { GET as cronRoute } from "@/app/api/cron/sync/route";
import { POST as webhookRoute } from "@/app/api/webhooks/gmail/route";
import { db } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { getThreadDetail } from "@/server/domain/thread-detail";
import { getConversation, search } from "@/server/domain/queries";
import { setGmailFactory } from "@/server/gmail/factory";
import { resetRateLimits } from "@/server/security/rate-limit";
import { runSync } from "@/server/sync/engine";
import { resetDb, setupTestDb } from "./helpers/db";
import { apiRequest, createTestAccount, ME, routeCtx } from "./helpers/fixtures";

const dbState = await setupTestDb();

describe.skipIf(!dbState.ok)("read model: thread detail, search, lookup, webhook, cron", () => {
  beforeEach(async () => {
    await resetDb();
    resetRateLimits();
  });
  afterAll(() => setGmailFactory(null));

  it("thread detail: live from Gmail, oldest first, quote/signature split, sanitized HTML, no bodies stored", async () => {
    const { account, gmail, token } = await createTestAccount();
    const a = gmail.addMessage({
      from: "Anna <anna@example.com>",
      to: [ME],
      subject: "Plan",
      text: "Sounds good.\n\nBest regards,\nAnna\nCEO, Example\n+48 123\n\nOn Mon, Jan 1, 2026 at 10:00 Me <me@example.com> wrote:\n> earlier",
    });
    gmail.addMessage({
      threadId: a.threadId,
      from: `Me <${ME}>`,
      to: ["anna@example.com"],
      subject: "Re: Plan",
      text: null,
      html: '<div>Only <b>HTML</b><img src="https://t.example/p.gif"><script>x()</script></div>',
      labels: ["SENT"],
    });
    const res = await threadRoute(apiRequest(`/api/threads/${a.threadId}`, { token }), routeCtx({ threadId: a.threadId }));
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.thread).toMatchObject({ id: a.threadId, subject: "Plan", messageCount: 2, isGroup: false });
    expect(detail.messages.map((m: { fromMe: boolean }) => m.fromMe)).toEqual([false, true]);
    const [m1, m2] = detail.messages;
    expect(m1.body.text).toBe("Sounds good.\n\nBest regards,\nAnna");
    expect(m1.body.signature).toBe("CEO, Example\n+48 123");
    expect(m1.body.quotedText).toMatch(/^On Mon, Jan 1, 2026/);
    expect(m1.body.preferHtml).toBe(false);
    expect(m1.unread).toBe(true);
    expect(m2.body.preferHtml).toBe(true);
    expect(m2.body.text).toBe("Only HTML");
    expect(m2.body.hasRemoteImages).toBe(true);
    expect(m2.body.html).not.toContain("<script");
    expect(m2.rfcMessageId).toMatch(/^<.+>$/);

    // Opened thread was indexed on the fly; nothing body-like stored.
    const row = await db.emailThread.findFirstOrThrow();
    expect(row.messageCount).toBe(2);
    const cols = Object.keys(await db.emailMessage.findFirstOrThrow());
    expect(cols.some((c) => /body|html|text/i.test(c))).toBe(false);

    // Deleted in Gmail → 404 and removed locally.
    gmail.deleteThread(a.threadId);
    await expect(getThreadDetail(account, gmail, a.threadId)).rejects.toMatchObject({ code: "not_found" });
    expect(await db.emailThread.count()).toBe(0);
  });

  it("search: people by name, groups by member, subjects, and Gmail full-text with on-the-fly indexing", async () => {
    const { account, gmail, token } = await createTestAccount();
    gmail.addMessage({ from: "Zofia Nowak <zofia@example.com>", to: [ME], subject: "Garden party" });
    gmail.addMessage({ from: "Zofia Nowak <zofia@example.com>", to: [ME, "piotr@example.com"], subject: "Trip" });
    await runSync(account.id, { gmail });
    // Arrives after sync (not indexed yet) — only Gmail full-text finds it.
    const late = gmail.addMessage({ from: "olaf@example.com", to: [ME], subject: "Hello", text: "the secret word is pineapple" });

    const r1 = await search(account, gmail, "zofia");
    expect(r1.people.map((p) => p.email)).toEqual(["zofia@example.com"]);
    expect(r1.groups).toHaveLength(1);
    const r2 = await search(account, gmail, "garden");
    expect(r2.threads.map((t) => t.subject)).toEqual(["Garden party"]);
    expect(r2.threads[0].conversation).toMatchObject({ kind: "person" });

    const res = await searchRoute(apiRequest("/api/search?q=pineapple", { token }));
    const r3 = await res.json();
    expect(r3.threads.map((t: { id: string }) => t.id)).toEqual([late.threadId]);
    expect(await db.emailThread.count()).toBe(3);

    // LIKE wildcards are literal.
    expect((await search(account, null, "%")).people).toHaveLength(0);
    expect((await search(account, null, "")).threads).toHaveLength(0);
  });

  it("people lookup: existing person, new valid address, invalid → null", async () => {
    const { account, gmail, token } = await createTestAccount();
    gmail.addMessage({ from: "Anna <anna@example.com>", to: [ME], subject: "x" });
    await runSync(account.id, { gmail });
    const known = await (await lookupRoute(apiRequest("/api/people/lookup?email=ANNA@example.com", { token }))).json();
    expect(known).toMatchObject({ kind: "person", email: "anna@example.com", name: "Anna", threadCount: 1 });
    const fresh = await (await lookupRoute(apiRequest("/api/people/lookup?email=new.person@example.com", { token }))).json();
    expect(fresh).toMatchObject({ email: "new.person@example.com", threadCount: 0, lastActivityAt: null });
    expect((await getConversation(account, { kind: "person", id: fresh.id })).threads).toEqual([]);
    const invalid = await (await lookupRoute(apiRequest("/api/people/lookup?email=nope", { token }))).json();
    expect(invalid).toBeNull();
  });

  it("Pub/Sub webhook: 503 when unconfigured, token verified, triggers incremental sync", async () => {
    const { account, gmail } = await createTestAccount();
    await runSync(account.id, { gmail });
    const body = { message: { data: Buffer.from(JSON.stringify({ emailAddress: ME, historyId: 99999 })).toString("base64"), messageId: "1" } };
    const post = (q = "") => webhookRoute(new Request(`http://localhost:3000/api/webhooks/gmail${q}`, { method: "POST", body: JSON.stringify(body) }));

    expect((await post()).status).toBe(503);
    process.env.PUBSUB_VERIFICATION_TOKEN = "hook-secret";
    resetEnvCache();
    try {
      expect((await post("?token=wrong")).status).toBe(401);
      gmail.addMessage({ from: "push@example.com", to: [ME], subject: "Pushed" });
      expect((await post("?token=hook-secret")).status).toBe(204);
      // Outside a Next request scope the sync runs fire-and-forget; wait for it.
      for (let i = 0; i < 50 && (await db.emailThread.count()) < 1; i++) await new Promise((r) => setTimeout(r, 20));
      expect(await db.emailThread.count()).toBe(1);
    } finally {
      delete process.env.PUBSUB_VERIFICATION_TOKEN;
      resetEnvCache();
    }
  });

  it("cron: requires CRON_SECRET bearer and syncs active accounts", async () => {
    const { account, gmail } = await createTestAccount();
    await runSync(account.id, { gmail });
    gmail.addMessage({ from: "cron@example.com", to: [ME], subject: "Cron" });
    const unauth = await cronRoute(new Request("http://localhost:3000/api/cron/sync", { headers: { authorization: "Bearer nope" } }));
    expect(unauth.status).toBe(401);
    const ok = await cronRoute(new Request("http://localhost:3000/api/cron/sync", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(await ok.json()).toMatchObject({ accounts: 1, synced: 1 });
    expect(await db.emailThread.count()).toBe(1);
  });
});
