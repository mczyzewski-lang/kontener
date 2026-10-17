import "./helpers/env";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as modifyThreadRoute } from "@/app/api/threads/[threadId]/modify/route";
import { POST as modifyMessageRoute } from "@/app/api/messages/[messageId]/modify/route";
import { GET as originalRoute } from "@/app/api/messages/[messageId]/original/route";
import { db } from "@/server/db";
import { modifyThread } from "@/server/domain/actions";
import { getConversation, listConversations } from "@/server/domain/queries";
import { setGmailFactory } from "@/server/gmail/factory";
import { resetRateLimits } from "@/server/security/rate-limit";
import { runSync } from "@/server/sync/engine";
import { resetDb, setupTestDb } from "./helpers/db";
import { apiRequest, createTestAccount, ME, routeCtx } from "./helpers/fixtures";

const dbState = await setupTestDb();

describe.skipIf(!dbState.ok)("thread & message actions", () => {
  beforeEach(async () => {
    await resetDb();
    resetRateLimits();
  });
  afterAll(() => setGmailFactory(null));

  it("7. archiving one topic removes INBOX from that thread only", async () => {
    const { account, gmail } = await createTestAccount();
    const threads = [0, 1, 2].map((i) => gmail.addMessage({ from: "Anna <anna@example.com>", to: [ME], subject: `T${i}` }).threadId);
    gmail.addMessage({ threadId: threads[0], from: "Anna <anna@example.com>", to: [ME], subject: "Re: T0" });
    await runSync(account.id, { gmail });

    await modifyThread(account, gmail, threads[0], "archive");

    // Gmail: only that thread lost INBOX.
    expect(gmail.threadMessages(threads[0]).every((m) => !m.labelIds.includes("INBOX"))).toBe(true);
    for (const id of threads.slice(1)) expect(gmail.threadMessages(id).every((m) => m.labelIds.includes("INBOX"))).toBe(true);
    expect(gmail.calls.modifyThread).toBe(1);

    // Local index updated immediately (no Gmail re-fetch).
    const rows = await db.emailThread.findMany();
    expect(rows.filter((r) => r.inInbox).map((r) => r.gmailThreadId).sort()).toEqual(threads.slice(1).sort());
    const inbox = await listConversations(account, { mailbox: "inbox", filter: "all" });
    expect(inbox.people[0].threadCount).toBe(2);
    const archive = await listConversations(account, { mailbox: "archive", filter: "all" });
    expect(archive.people[0].threadCount).toBe(1);
    const person = await getConversation(account, { kind: "person", id: inbox.people[0].id });
    expect(person.threads).toHaveLength(3);

    // After a sync the state is the same (consistency with Gmail).
    await runSync(account.id, { gmail });
    expect((await db.emailThread.findMany({ where: { inInbox: true } })).length).toBe(2);

    await modifyThread(account, gmail, threads[0], "unarchive");
    expect((await db.emailThread.count({ where: { inInbox: true } }))).toBe(3);
  });

  it("read/unread, star (latest message) / unstar, trash via the API routes", async () => {
    const { account, gmail, token } = await createTestAccount();
    const first = gmail.addMessage({ from: "bob@example.com", to: [ME], subject: "S" });
    const second = gmail.addMessage({ threadId: first.threadId, from: "bob@example.com", to: [ME], subject: "Re: S" });
    await runSync(account.id, { gmail });

    const call = (action: string) =>
      modifyThreadRoute(apiRequest(`/api/threads/${first.threadId}/modify`, { method: "POST", token, body: { action } }), routeCtx({ threadId: first.threadId }));

    expect((await call("read")).status).toBe(200);
    expect((await db.emailThread.findFirstOrThrow()).unreadCount).toBe(0);
    expect((await call("unread")).status).toBe(200);
    expect((await db.emailThread.findFirstOrThrow()).unreadCount).toBe(2);

    expect((await call("star")).status).toBe(200);
    expect(gmail.messages.get(second.id)!.labelIds).toContain("STARRED");
    expect(gmail.messages.get(first.id)!.labelIds).not.toContain("STARRED");
    expect((await db.emailThread.findFirstOrThrow()).starred).toBe(true);
    expect((await call("unstar")).status).toBe(200);
    expect((await db.emailThread.findFirstOrThrow()).starred).toBe(false);

    const msgRes = await modifyMessageRoute(
      apiRequest(`/api/messages/${first.id}/modify`, { method: "POST", token, body: { action: "read" } }),
      routeCtx({ messageId: first.id }),
    );
    expect(msgRes.status).toBe(200);
    expect((await db.emailThread.findFirstOrThrow()).unreadCount).toBe(1);

    const bad = await call("explode");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("invalid");

    expect((await call("trash")).status).toBe(200);
    expect((await db.emailThread.findFirstOrThrow()).hidden).toBe(true);
    const list = await listConversations(account, { mailbox: "all", filter: "all" });
    expect(list.people).toHaveLength(0);

    const orig = await originalRoute(apiRequest(`/api/messages/${first.id}/original`, { token }), routeCtx({ messageId: first.id }));
    expect(orig.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(orig.headers.get("x-content-type-options")).toBe("nosniff");
    expect(orig.headers.get("content-security-policy")).toBe("sandbox");
    expect(await orig.text()).toContain("Subject: S");
  });

  it("actions on a thread deleted in Gmail → 404 and local cleanup", async () => {
    const { account, gmail } = await createTestAccount();
    const m = gmail.addMessage({ from: "bob@example.com", to: [ME], subject: "S" });
    await runSync(account.id, { gmail });
    gmail.deleteThread(m.threadId);
    await expect(modifyThread(account, gmail, m.threadId, "archive")).rejects.toMatchObject({ code: "not_found" });
    expect(await db.emailThread.count()).toBe(0);
  });
});
