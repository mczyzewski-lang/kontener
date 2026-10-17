import "./helpers/env";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as sendRoute } from "@/app/api/send/route";
import { db } from "@/server/db";
import { saveDraft, deleteDraft } from "@/server/domain/drafts";
import { getConversation, listConversations } from "@/server/domain/queries";
import { PENDING_STALE_MS, sendMessage, type SendRequest } from "@/server/domain/send";
import { ApiError } from "@/server/errors";
import { GmailError } from "@/server/gmail/errors";
import { setGmailFactory } from "@/server/gmail/factory";
import { resetRateLimits } from "@/server/security/rate-limit";
import { runSync } from "@/server/sync/engine";
import { resetDb, setupTestDb } from "./helpers/db";
import { rawHeader } from "./helpers/fake-gmail";
import { apiRequest, createTestAccount, ME, type TestAccount } from "./helpers/fixtures";

const dbState = await setupTestDb();

function req(over: Partial<SendRequest> = {}): SendRequest {
  return {
    idempotencyKey: `key_${Math.random().toString(36).slice(2, 12)}`,
    mode: "new",
    to: [{ email: "anna@example.com", name: "Anna" }],
    cc: [],
    bcc: [],
    subject: "Hello",
    text: "Hi **Anna**",
    ...over,
  };
}

describe.skipIf(!dbState.ok)("sending", () => {
  let t: TestAccount;
  beforeEach(async () => {
    await resetDb();
    resetRateLimits();
    t = await createTestAccount();
  });
  afterAll(() => setGmailFactory(null));

  const deps = () => ({ account: t.account, user: t.user, gmail: t.gmail });

  it("3. reply → messages.send with threadId, In-Reply-To, References and Re: subject", async () => {
    const orig = t.gmail.addMessage({
      from: "Anna <anna@example.com>",
      to: [ME],
      subject: "Quarterly report",
      messageId: "<orig-1@mail.example.com>",
      references: "<root-0@mail.example.com>",
    });
    await runSync(t.account.id, { gmail: t.gmail });

    const res = await sendMessage(deps(), req({ mode: "reply", threadId: orig.threadId, inReplyToMessageId: orig.id, subject: "ignored" }));
    expect(res.threadId).toBe(orig.threadId);
    expect(t.gmail.sent).toHaveLength(1);
    const s = t.gmail.sent[0];
    expect(s.threadId).toBe(orig.threadId);
    expect(rawHeader(s.decoded, "In-Reply-To")).toBe("<orig-1@mail.example.com>");
    expect(rawHeader(s.decoded, "References")).toBe("<root-0@mail.example.com> <orig-1@mail.example.com>");
    expect(rawHeader(s.decoded, "Subject")).toBe("Re: Quarterly report");
    expect(rawHeader(s.decoded, "Message-ID")).toMatch(/^<key_[a-z0-9]+@emailto\.chat>$/);
    expect(rawHeader(s.decoded, "From")).toBe(`Me Myself <${ME}>`);
    expect(s.decoded).toContain("multipart/alternative");

    // Indexed immediately: the thread now has 2 messages, last from me.
    const thread = await db.emailThread.findFirstOrThrow({ where: { gmailThreadId: orig.threadId } });
    expect(thread).toMatchObject({ messageCount: 2, lastFromMe: true, hasSent: true });
  });

  it("reply without inReplyToMessageId answers the latest message of the thread", async () => {
    const first = t.gmail.addMessage({ from: "anna@example.com", to: [ME], subject: "Plan", messageId: "<a1@x>" });
    t.gmail.addMessage({ threadId: first.threadId, from: "anna@example.com", to: [ME], subject: "Re: Plan", messageId: "<a2@x>", references: "<a1@x>" });
    await sendMessage(deps(), req({ mode: "replyAll", threadId: first.threadId }));
    const raw = t.gmail.sent[0].decoded;
    expect(rawHeader(raw, "In-Reply-To")).toBe("<a2@x>");
    expect(rawHeader(raw, "References")).toBe("<a1@x> <a2@x>");
    expect(rawHeader(raw, "Subject")).toBe("Re: Plan");
  });

  it("4. new topic to the same person → no threadId → a separate thread", async () => {
    const orig = t.gmail.addMessage({ from: "Anna <anna@example.com>", to: [ME], subject: "Old topic" });
    await runSync(t.account.id, { gmail: t.gmail });
    const res = await sendMessage(deps(), req({ mode: "newTopic", subject: "Brand new topic", threadId: orig.threadId }));
    expect(t.gmail.sent[0].threadId).toBeNull();
    expect(rawHeader(t.gmail.sent[0].decoded, "In-Reply-To")).toBeNull();
    expect(res.threadId).not.toBe(orig.threadId);

    const list = await listConversations(t.account, { mailbox: "all", filter: "all" });
    expect(list.people).toHaveLength(1);
    expect(list.people[0].threadCount).toBe(2);
    const detail = await getConversation(t.account, { kind: "person", id: list.people[0].id });
    expect(detail.threads.map((x) => x.subject).sort()).toEqual(["Brand new topic", "Old topic"]);
  });

  it("forward starts a new thread with a Fwd: subject", async () => {
    await sendMessage(deps(), req({ mode: "forward", subject: "Invoice", threadId: "abc123" }));
    expect(t.gmail.sent[0].threadId).toBeNull();
    expect(rawHeader(t.gmail.sent[0].decoded, "Subject")).toBe("Fwd: Invoice");
  });

  it("11. interrupted send (Gmail accepted, connection dropped) → retries never send twice", async () => {
    const input = req({ idempotencyKey: "retry_key_0001" });
    t.gmail.sendBehavior = "accept_then_network_error";
    await expect(sendMessage(deps(), input)).rejects.toBeInstanceOf(GmailError);
    expect(t.gmail.sent).toHaveLength(1);
    const row = await db.outboundMessage.findFirstOrThrow();
    expect(row.status).toBe("pending");

    // Immediate retry: the first attempt may still be in flight → 409, nothing sent.
    await expect(sendMessage(deps(), input)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect(t.gmail.sent).toHaveLength(1);

    // Later retry (pending is stale): found in Gmail via rfc822msgid → deduplicated.
    await db.outboundMessage.update({ where: { id: row.id }, data: { updatedAt: new Date(Date.now() - PENDING_STALE_MS - 1000) } });
    const res = await sendMessage(deps(), input);
    expect(res.deduplicated).toBe(true);
    expect(t.gmail.sent).toHaveLength(1);
    expect((await db.outboundMessage.findFirstOrThrow()).status).toBe("sent");

    // And once "sent", further retries short-circuit without any Gmail call.
    const before = t.gmail.totalCalls;
    const again = await sendMessage(deps(), input);
    expect(again).toEqual({ messageId: res.messageId, threadId: res.threadId, deduplicated: true });
    expect(t.gmail.totalCalls).toBe(before);
  });

  it("dedup falls back to the X-Emailto-Chat-Key header when Gmail rewrote the Message-ID", async () => {
    const input = req({ idempotencyKey: "rewritten_id_1" });
    t.gmail.sendBehavior = "accept_then_network_error";
    await expect(sendMessage(deps(), input)).rejects.toBeInstanceOf(GmailError);
    const sentMsg = [...t.gmail.messages.values()].find((m) => m.labelIds.includes("SENT"))!;
    sentMsg.headers = sentMsg.headers.map(([k, v]) => (k === "Message-ID" ? [k, "<CAgmail-rewritten@mail.gmail.com>"] : [k, v]));
    await db.outboundMessage.updateMany({ data: { updatedAt: new Date(Date.now() - PENDING_STALE_MS - 1000) } });
    const res = await sendMessage(deps(), input);
    expect(res).toMatchObject({ messageId: sentMsg.id, deduplicated: true });
    expect(t.gmail.sent).toHaveLength(1);
  });

  it("a send Gmail rejected is marked failed and can be retried (and then sends once)", async () => {
    const input = req({ idempotencyKey: "rejected_key_1" });
    t.gmail.sendBehavior = "reject";
    await expect(sendMessage(deps(), input)).rejects.toBeInstanceOf(GmailError);
    expect((await db.outboundMessage.findFirstOrThrow()).status).toBe("failed");
    t.gmail.sendBehavior = "ok";
    const res = await sendMessage(deps(), input);
    expect(res.deduplicated).toBeUndefined();
    expect((await db.outboundMessage.findFirstOrThrow()).status).toBe("sent");
  });

  it("validates From alias and recipients", async () => {
    await expect(sendMessage(deps(), req({ from: "someone-else@example.com" }))).rejects.toMatchObject({ code: "invalid" });
    await expect(sendMessage(deps(), req({ to: [] }))).rejects.toBeInstanceOf(ApiError);
    await expect(sendMessage(deps(), req({ to: [{ email: "not-an-address" }] }))).rejects.toMatchObject({ code: "invalid" });
    expect(t.gmail.sent).toHaveLength(0);

    await db.mailAccount.update({ where: { id: t.account.id }, data: { aliases: ["alias@example.org"] } });
    const account = await db.mailAccount.findUniqueOrThrow({ where: { id: t.account.id } });
    await sendMessage({ ...deps(), account }, req({ from: "Alias@Example.org" }));
    expect(rawHeader(t.gmail.sent[0].decoded, "From")).toBe("Me Myself <alias@example.org>");
  });

  it("deletes the Gmail draft after a successful send", async () => {
    const { draftId } = await saveDraft(deps(), { to: [{ email: "anna@example.com" }], cc: [], bcc: [], subject: "Draft", text: "wip" });
    expect(t.gmail.drafts.has(draftId)).toBe(true);
    expect(await db.draft.count()).toBe(1);
    await sendMessage(deps(), req({ draftId }));
    expect(t.gmail.drafts.has(draftId)).toBe(false);
    expect(await db.draft.count()).toBe(0);
  });

  it("drafts: create, update, delete; reply drafts carry thread headers", async () => {
    const orig = t.gmail.addMessage({ from: "anna@example.com", to: [ME], subject: "Q", messageId: "<q1@x>" });
    const { draftId } = await saveDraft(deps(), { threadId: orig.threadId, inReplyToMessageId: orig.id, to: [], cc: [], bcc: [], subject: "", text: "a" });
    const d = t.gmail.drafts.get(draftId)!;
    expect(d.threadId).toBe(orig.threadId);
    const raw = Buffer.from(d.raw, "base64url").toString("utf8");
    expect(rawHeader(raw, "In-Reply-To")).toBe("<q1@x>");
    expect(rawHeader(raw, "Subject")).toBe("Re: Q");
    const again = await saveDraft(deps(), { draftId, to: [], cc: [], bcc: [], subject: "S", text: "b" });
    expect(again.draftId).toBe(draftId);
    await deleteDraft(t.account, t.gmail, draftId);
    expect(t.gmail.drafts.size).toBe(0);
    await deleteDraft(t.account, t.gmail, draftId); // idempotent
  });

  it("POST /api/send: multipart payload + files, size limit, CSRF", async () => {
    const form = new FormData();
    form.set("payload", JSON.stringify(req({ idempotencyKey: "route_key_001" })));
    form.append("attachments", new File([new Uint8Array([1, 2, 3, 4])], "data.bin", { type: "application/octet-stream" }));
    form.append("attachments", new File(["hello"], "notes.txt", { type: "text/plain" }));
    const res = await sendRoute(apiRequest("/api/send", { method: "POST", token: t.token, body: form }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messageId).toBeTruthy();
    const raw = t.gmail.sent[0].decoded;
    expect(raw).toContain('filename="data.bin"');
    expect(raw).toContain('filename="notes.txt"');

    // Same key again over HTTP → deduplicated.
    const form2 = new FormData();
    form2.set("payload", JSON.stringify(req({ idempotencyKey: "route_key_001" })));
    const res2 = await sendRoute(apiRequest("/api/send", { method: "POST", token: t.token, body: form2 }));
    expect((await res2.json()).deduplicated).toBe(true);
    expect(t.gmail.sent).toHaveLength(1);

    // Too large.
    const big = new FormData();
    big.set("payload", JSON.stringify(req()));
    big.append("attachments", new File([new Uint8Array(21 * 1024 * 1024)], "big.bin"));
    const res3 = await sendRoute(apiRequest("/api/send", { method: "POST", token: t.token, body: big }));
    expect(res3.status).toBe(413);
    expect((await res3.json()).error.code).toBe("too_large");

    // Cross-site request.
    const evil = await sendRoute(apiRequest("/api/send", { method: "POST", token: t.token, body: { ...req() }, origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    expect(t.gmail.sent).toHaveLength(1);
  });
});
