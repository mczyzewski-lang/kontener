import "./helpers/env";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { indexThread } from "@/server/domain/indexer";
import { getConversation, listConversations } from "@/server/domain/queries";
import { setGmailFactory } from "@/server/gmail/factory";
import { runSync } from "@/server/sync/engine";
import { resetDb, setupTestDb } from "./helpers/db";
import { createTestAccount, ME, reloadAccount } from "./helpers/fixtures";

const dbState = await setupTestDb();

describe.skipIf(!dbState.ok)("sync engine + person-first index", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(() => setGmailFactory(null));

  it("1. 20 messages from one person in 5 threads → one person with threadCount 5", async () => {
    const { account, gmail } = await createTestAccount();
    for (let t = 0; t < 5; t++) {
      const first = gmail.addMessage({ from: "Anna Kowalska <anna@example.com>", to: [ME], subject: `Topic ${t}` });
      for (let i = 1; i < 4; i++) {
        gmail.addMessage({ threadId: first.threadId, from: "Anna Kowalska <anna@example.com>", to: [ME], subject: `Re: Topic ${t}` });
      }
    }
    expect(gmail.messages.size).toBe(20);

    const status = await runSync(account.id, { gmail });
    expect(status.state).toBe("idle");
    expect(status.initialSyncComplete).toBe(true);
    expect(status.backfillComplete).toBe(true);
    expect(status.threadCount).toBe(5);

    const list = await listConversations(account, { mailbox: "inbox", filter: "all" });
    expect(list.groups).toHaveLength(0);
    expect(list.people).toHaveLength(1);
    expect(list.people[0]).toMatchObject({ kind: "person", email: "anna@example.com", name: "Anna Kowalska", threadCount: 5, unreadCount: 20 });

    const detail = await getConversation(account, { kind: "person", id: list.people[0].id });
    expect(detail.threads).toHaveLength(5);
    expect(detail.threads.every((t) => t.messageCount === 4)).toBe(true);

    const unread = await listConversations(account, { mailbox: "inbox", filter: "unread" });
    expect(unread.people).toHaveLength(1);
    expect(await db.emailMessage.count()).toBe(20);
  });

  it("2. one e-mail to 4 recipients → group conversation with correct members and title", async () => {
    const { account, gmail } = await createTestAccount();
    gmail.addMessage({
      from: "Anna Nowak <anna@example.com>",
      to: [ME, "Bartek <bartek@example.com>", "Celina <celina@example.com>"],
      cc: ["Dorota <dorota@example.com>"],
      subject: "Team offsite",
    });
    await runSync(account.id, { gmail });
    const list = await listConversations(account, { mailbox: "inbox", filter: "all" });
    expect(list.people).toHaveLength(0);
    expect(list.groups).toHaveLength(1);
    const g = list.groups[0];
    expect(g.members.map((m) => m.email)).toEqual(["anna@example.com", "bartek@example.com", "celina@example.com", "dorota@example.com"]);
    expect(g.title).toBe("Anna, Bartek + 2");
    expect(g.threadCount).toBe(1);
    expect(g.lastSenderName).toBe("Anna");

    const detail = await getConversation(account, { kind: "group", id: g.id });
    expect(detail.threads).toHaveLength(1);
    expect(detail.threads[0].isGroup).toBe(true);

    // Each member's person view includes the group thread (via ThreadParticipant).
    const anna = await db.contact.findFirstOrThrow({ where: { email: "anna@example.com" } });
    const annaDetail = await getConversation(account, { kind: "person", id: anna.id });
    expect(annaDetail.threads.map((t) => t.groupId)).toEqual([g.id]);
    expect(annaDetail.conversation).toMatchObject({ kind: "person", threadCount: 0 });
  });

  it("5. two contacts with the same display name but different addresses stay separate", async () => {
    const { account, gmail } = await createTestAccount();
    gmail.addMessage({ from: "Jan Kowalski <jan@firma.pl>", to: [ME], subject: "Faktura" });
    gmail.addMessage({ from: "Jan Kowalski <jan.kowalski@gmail.com>", to: [ME], subject: "Weekend" });
    await runSync(account.id, { gmail });
    const list = await listConversations(account, { mailbox: "all", filter: "all" });
    expect(list.people).toHaveLength(2);
    expect(new Set(list.people.map((p) => p.email))).toEqual(new Set(["jan@firma.pl", "jan.kowalski@gmail.com"]));
    expect(new Set(list.people.map((p) => p.id)).size).toBe(2);
    expect(list.people.every((p) => p.threadCount === 1)).toBe(true);
  });

  it("6. a message sent from classic Gmail appears after incremental sync in the right conversation", async () => {
    const { account, gmail } = await createTestAccount();
    const first = gmail.addMessage({ from: "Bob <bob@example.com>", to: [ME], subject: "Lunch?" });
    await runSync(account.id, { gmail });
    const historyBefore = (await db.syncState.findUniqueOrThrow({ where: { accountId: account.id } })).historyId;

    // Reply typed in Gmail web: shows up only in history.
    gmail.addMessage({ threadId: first.threadId, from: `Me <${ME}>`, to: ["bob@example.com"], subject: "Re: Lunch?", labels: ["SENT"] });
    // And a brand-new thread started from Gmail web.
    gmail.addMessage({ from: `Me <${ME}>`, to: ["Bob <bob@example.com>"], subject: "Photos", labels: ["SENT"] });
    const listsBefore = gmail.calls.listThreads ?? 0;

    const status = await runSync(account.id, { gmail });
    expect(status.state).toBe("idle");
    expect(gmail.calls.listThreads ?? 0).toBe(listsBefore); // incremental only, no relisting
    const state = await db.syncState.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(Number(state.historyId)).toBeGreaterThan(Number(historyBefore));

    const sent = await listConversations(account, { mailbox: "sent", filter: "all" });
    expect(sent.people).toHaveLength(1);
    expect(sent.people[0]).toMatchObject({ email: "bob@example.com", threadCount: 2, lastFromMe: true });
    const detail = await getConversation(account, { kind: "person", id: sent.people[0].id });
    const lunch = detail.threads.find((t) => t.id === first.threadId)!;
    expect(lunch.messageCount).toBe(2);
  });

  it("12. expired history cursor → full repair sync, consistent state", async () => {
    const { account, gmail } = await createTestAccount();
    const keep = gmail.addMessage({ from: "Anna <anna@example.com>", to: [ME], subject: "Keep" });
    const gone = gmail.addMessage({ from: "Bob <bob@example.com>", to: [ME], subject: "Will be deleted" });
    await runSync(account.id, { gmail });
    expect(await db.emailThread.count()).toBe(2);

    gmail.deleteThread(gone.threadId);
    const fresh = gmail.addMessage({ from: "Cecil <cecil@example.com>", to: [ME], subject: "New while offline" });
    gmail.addMessage({ threadId: keep.threadId, from: `Me <${ME}>`, to: ["anna@example.com"], subject: "Re: Keep", labels: ["SENT"] });
    gmail.expireHistory();

    const status = await runSync(account.id, { gmail });
    expect(status.state).toBe("idle");
    expect(status.backfillComplete).toBe(true);
    const threads = await db.emailThread.findMany({ orderBy: { lastMessageAt: "asc" } });
    expect(threads.map((t) => t.gmailThreadId).sort()).toEqual([keep.threadId, fresh.threadId].sort());
    expect(threads.find((t) => t.gmailThreadId === keep.threadId)!.messageCount).toBe(2);
    const state = await db.syncState.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(state.historyId).toBe(String(gmail.historyId));
    expect(state.fullSyncStartedAt).toBeNull();
    expect(state.lastFullSyncAt).not.toBeNull();

    // Incremental works again with the new cursor.
    gmail.addMessage({ from: "Dan <dan@example.com>", to: [ME], subject: "After repair" });
    await runSync(account.id, { gmail });
    expect(await db.emailThread.count()).toBe(3);
    const people = (await listConversations(account, { mailbox: "all", filter: "all" })).people.map((p) => p.email).sort();
    expect(people).toEqual(["anna@example.com", "cecil@example.com", "dan@example.com"]);
  });

  it("re-indexing the same thread twice is idempotent", async () => {
    const { account, gmail } = await createTestAccount();
    const m = gmail.addMessage({
      from: "Anna <anna@example.com>",
      to: [ME, "bob@example.com"],
      subject: "Hello",
      attachments: [{ filename: "a.pdf", mimeType: "application/pdf", data: new Uint8Array([1, 2, 3]) }],
    });
    const thread = await gmail.getThread(m.threadId);
    await indexThread(account, thread);
    const snapshot = async () => ({
      threads: await db.emailThread.count(),
      messages: await db.emailMessage.count(),
      contacts: await db.contact.count(),
      participants: await db.threadParticipant.count(),
      attachments: await db.attachmentMetadata.count(),
    });
    const a = await snapshot();
    await indexThread(account, thread);
    await Promise.all([indexThread(account, thread), indexThread(account, thread)]);
    expect(await snapshot()).toEqual(a);
    expect(a).toEqual({ threads: 1, messages: 1, contacts: 2, participants: 2, attachments: 1 });
  });

  it("progressive initial sync: first page immediately, backfill continues, respects MAX_BACKFILL_THREADS", async () => {
    const { account, gmail } = await createTestAccount();
    for (let i = 0; i < 100; i++) gmail.addMessage({ from: `p${i}@example.com`, to: [ME], subject: `S${i}` });

    // Tiny budget: only the first page (25 threads) is indexed.
    const first = await runSync(account.id, { gmail, budgetMs: 0, maxBackfillThreads: 60 });
    expect(first.initialSyncComplete).toBe(true);
    expect(first.backfillComplete).toBe(false);
    expect(first.threadCount).toBe(25);
    // Newest first.
    const newest = await db.emailThread.findFirst({ orderBy: { lastMessageAt: "desc" } });
    expect(newest?.subject).toBe("S99");

    const second = await runSync(account.id, { gmail, maxBackfillThreads: 60 });
    expect(second.backfillComplete).toBe(true);
    // Pages of 25: the page that crosses the cap (60) is the last one → 75 threads.
    expect(second.threadCount).toBe(75);
    // Further syncs do not list again.
    const lists = gmail.calls.listThreads;
    await runSync(account.id, { gmail, maxBackfillThreads: 60 });
    expect(gmail.calls.listThreads).toBe(lists);
  });

  it("DB lock: concurrent syncs for one account do not run twice", async () => {
    const { account, gmail } = await createTestAccount();
    for (let i = 0; i < 10; i++) gmail.addMessage({ from: `p${i}@example.com`, to: [ME], subject: `S${i}` });
    const [a, b] = await Promise.all([runSync(account.id, { gmail }), runSync(account.id, { gmail })]);
    expect([a.state, b.state].sort()).toEqual(["idle", "syncing"]);
    expect(gmail.calls.getProfile).toBe(1);
    expect(await db.emailThread.count()).toBe(10);
  });

  it("aliases are refreshed on initial sync and count as me", async () => {
    const { account, gmail } = await createTestAccount();
    gmail.sendAs = [{ sendAsEmail: "Alias@Example.org", verificationStatus: "accepted" }];
    gmail.addMessage({ from: "alias@example.org", to: ["zoe@example.com"], subject: "From alias", labels: ["INBOX"] });
    await runSync(account.id, { gmail });
    expect((await reloadAccount(account.id)).aliases).toEqual(["alias@example.org"]);
    const list = await listConversations(await reloadAccount(account.id), { mailbox: "all", filter: "all" });
    expect(list.people.map((p) => p.email)).toEqual(["zoe@example.com"]);
    expect(list.people[0].lastFromMe).toBe(true);
  });

  it("needs_reauth from Gmail flips the account status and sync reports it", async () => {
    const { account, gmail } = await createTestAccount();
    const { GmailError } = await import("@/server/gmail/errors");
    gmail.getProfile = async () => {
      throw new GmailError("needs_reauth", "gmail_needs_reauth_401", 401);
    };
    const s = await runSync(account.id, { gmail });
    expect(s.state).toBe("needs_reauth");
    expect((await reloadAccount(account.id)).status).toBe("needs_reauth");
  });
});
