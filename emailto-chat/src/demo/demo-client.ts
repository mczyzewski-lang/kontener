/**
 * Demo Mode data source: implements the same MailClient contract as the live Gmail backend,
 * entirely in the browser. Uses the real core indexing logic (src/core/grouping.ts),
 * so the demo behaves exactly like the product — only the data is simulated.
 */
import { displayName, formatAddress, normalizeEmail, stableHash } from "@/core/addresses";
import { attachmentKind } from "@/core/attachments";
import type { AttachmentScope, MailClient } from "@/core/client";
import { MailClientError } from "@/core/client";
import {
  aggregateConversations,
  analyzeMessages,
  makeSelf,
  threadsForGroup,
  threadsForPerson,
  toThreadSummary,
  type IndexableMessage,
  type ThreadAnalysis,
} from "@/core/grouping";
import { forwardSubject, replySubject } from "@/core/mime";
import { htmlToText, splitQuotedText } from "@/core/quotes";
import {
  DEFAULT_PREFERENCES,
  type AccountInfo,
  type AttachmentView,
  type ConversationDetail,
  type ConversationList,
  type ConversationRef,
  type DraftInput,
  type Mailbox,
  type MessageAction,
  type MessageView,
  type PersonSummary,
  type ReadFilter,
  type SearchResult,
  type SendInput,
  type SendResult,
  type SyncStatus,
  type ThreadAction,
  type ThreadDetail,
  type UserPreferences,
} from "@/core/types";
import { buildDemoMessages, DEMO_ME, type DemoAttachment, type DemoMessage } from "./data";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const contactId = (email: string) => "c" + stableHash(normalizeEmail(email));

const AUTO_REPLIES = [
  "Got it, thanks! (This is a simulated reply — Demo Mode.)",
  "Thanks Alex — I'll get back to you shortly. (Simulated demo reply.)",
  "Sounds good 👍 (Simulated demo reply.)",
];

export class DemoMailClient implements MailClient {
  readonly mode = "demo" as const;
  private messages: DemoMessage[];
  private self = makeSelf(DEMO_ME.email);
  private prefs: UserPreferences = { ...DEFAULT_PREFERENCES };
  private sentKeys = new Map<string, SendResult>();
  private repliedThreads = new Set<string>();
  private seq = 0;
  /** Latency makes loading states visible but keeps the demo snappy. */
  private latency: number;

  constructor(opts: { latency?: number } = {}) {
    this.messages = buildDemoMessages();
    this.latency = opts.latency ?? 120;
  }

  private async tick(ms = this.latency) {
    if (ms > 0) await delay(ms);
  }

  private toIndexable(m: DemoMessage): IndexableMessage {
    return {
      id: m.id,
      threadId: m.threadId,
      from: m.from,
      to: m.to,
      cc: m.cc,
      bcc: [],
      date: m.date,
      labelIds: m.labels,
      snippet: snippetOf(m),
      subject: m.subject,
      hasAttachments: m.attachments.length > 0,
    };
  }

  private analyze(): ThreadAnalysis[] {
    return analyzeMessages(this.messages.map((m) => this.toIndexable(m)), this.self);
  }

  private names(): Map<string, string | null> {
    const names = new Map<string, string | null>();
    for (const m of [...this.messages].sort((a, b) => a.date - b.date)) {
      for (const a of [m.from, ...m.to, ...m.cc]) if (a.name) names.set(normalizeEmail(a.email), a.name);
    }
    return names;
  }

  private personFromEmail(email: string): PersonSummary {
    const e = normalizeEmail(email);
    const threads = threadsForPerson(this.analyze(), e);
    const last = threads[0];
    return {
      kind: "person",
      id: contactId(e),
      email: e,
      name: this.names().get(e) ?? null,
      isSelf: this.self.addresses.has(e) || undefined,
      lastActivityAt: last ? new Date(last.lastMessageAt).toISOString() : null,
      lastSnippet: last?.snippet ?? "",
      lastFromMe: last?.lastFromMe ?? false,
      unreadCount: threads.filter((t) => !t.isGroup).reduce((s, t) => s + t.unreadCount, 0),
      threadCount: threads.length,
    };
  }

  private emailForContact(id: string): string | null {
    for (const m of this.messages) for (const a of [m.from, ...m.to, ...m.cc]) if (contactId(a.email) === id) return normalizeEmail(a.email);
    return null;
  }

  async me(): Promise<AccountInfo> {
    return {
      mode: "demo",
      user: { id: "demo", name: DEMO_ME.name ?? null, email: DEMO_ME.email, image: null },
      mailAccount: { email: DEMO_ME.email, status: "active", aliases: [DEMO_ME.email], pushEnabled: false },
      preferences: this.prefs,
    };
  }

  async updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    this.prefs = { ...this.prefs, ...patch };
    return this.prefs;
  }

  async listConversations(params: { mailbox: Mailbox; filter: ReadFilter }): Promise<ConversationList> {
    await this.tick();
    return aggregateConversations(this.analyze(), { ...params, contactId, self: this.self, names: this.names() });
  }

  async getConversation(ref: ConversationRef): Promise<ConversationDetail> {
    await this.tick();
    const all = this.analyze();
    if (ref.kind === "person") {
      const email = this.emailForContact(ref.id);
      if (!email) throw new MailClientError("Contact not found", "not_found", 404);
      return { conversation: this.personFromEmail(email), threads: threadsForPerson(all, email).map(toThreadSummary) };
    }
    const threads = threadsForGroup(all, ref.id);
    const list = aggregateConversations(threads, { mailbox: "all", filter: "all", contactId, self: this.self, names: this.names() });
    const group = list.groups[0];
    if (!group) throw new MailClientError("Group not found", "not_found", 404);
    return { conversation: group, threads: threads.map(toThreadSummary) };
  }

  async findPerson(email: string): Promise<PersonSummary | null> {
    const e = normalizeEmail(email);
    const known = this.messages.some((m) => [m.from, ...m.to, ...m.cc].some((a) => normalizeEmail(a.email) === e));
    return known ? this.personFromEmail(e) : null;
  }

  async getThread(threadId: string): Promise<ThreadDetail> {
    await this.tick();
    const msgs = this.messages.filter((m) => m.threadId === threadId).sort((a, b) => a.date - b.date);
    if (!msgs.length) throw new MailClientError("Thread not found", "not_found", 404);
    const analysis = analyzeMessages(msgs.map((m) => this.toIndexable(m)), this.self)[0];
    return { thread: toThreadSummary(analysis), messages: msgs.map((m) => this.toView(m)) };
  }

  private attachmentView(m: DemoMessage, a: DemoAttachment): AttachmentView {
    const made = a.make();
    const kind = attachmentKind(a.mimeType, a.filename);
    return {
      id: a.id,
      messageId: m.id,
      threadId: m.threadId,
      filename: a.filename,
      mimeType: a.mimeType,
      size: made.size,
      kind,
      date: new Date(m.date).toISOString(),
      fromMe: this.self.addresses.has(m.from.email),
      senderName: displayName(m.from),
      downloadUrl: made.dataUrl,
      previewUrl: kind === "image" || a.mimeType === "application/pdf" ? made.dataUrl : null,
    };
  }

  private toView(m: DemoMessage): MessageView {
    const plain = m.text || (m.html ? htmlToText(m.html) : "");
    const split = splitQuotedText(plain);
    const fromMe = this.self.addresses.has(normalizeEmail(m.from.email));
    return {
      id: m.id,
      threadId: m.threadId,
      from: m.from,
      to: m.to,
      cc: m.cc,
      bcc: [],
      replyTo: [],
      date: new Date(m.date).toISOString(),
      subject: m.subject,
      snippet: snippetOf(m),
      fromMe,
      unread: m.labels.includes("UNREAD"),
      starred: m.labels.includes("STARRED"),
      rfcMessageId: `<${m.id}@demo.emailto.chat>`,
      references: null,
      body: {
        text: split.text,
        quotedText: split.quotedText,
        signature: split.signature,
        html: m.html ?? null,
        hasRemoteImages: !!m.hasRemoteImages,
        preferHtml: !m.text && !!m.html,
      },
      attachments: m.attachments.map((a) => this.attachmentView(m, a)),
    };
  }

  async listAttachments(scope: AttachmentScope): Promise<AttachmentView[]> {
    await this.tick(60);
    let threadIds: Set<string>;
    if (scope.kind === "thread") threadIds = new Set([scope.threadId]);
    else {
      const detail = await this.getConversation({ kind: scope.kind, id: scope.id });
      threadIds = new Set(detail.threads.map((t) => t.id));
    }
    return this.messages
      .filter((m) => threadIds.has(m.threadId))
      .sort((a, b) => b.date - a.date)
      .flatMap((m) => m.attachments.map((a) => this.attachmentView(m, a)));
  }

  async search(query: string): Promise<SearchResult> {
    await this.tick();
    const q = query.trim().toLowerCase();
    if (!q) return { people: [], groups: [], threads: [] };
    const all = this.analyze();
    const list = aggregateConversations(all, { mailbox: "all", filter: "all", contactId, self: this.self, names: this.names() });
    const people = list.people.filter((p) => p.email.includes(q) || (p.name ?? "").toLowerCase().includes(q));
    const groups = list.groups.filter((g) => g.title.toLowerCase().includes(q) || g.members.some((m) => m.email.includes(q) || (m.name ?? "").toLowerCase().includes(q)));
    const matchingThreadIds = new Set(
      this.messages.filter((m) => m.subject.toLowerCase().includes(q) || m.text.toLowerCase().includes(q) || m.attachments.some((a) => a.filename.toLowerCase().includes(q))).map((m) => m.threadId),
    );
    const threads = all
      .filter((t) => matchingThreadIds.has(t.threadId) && !t.hidden)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .map((t) => ({
        ...toThreadSummary(t),
        conversation: t.isGroup && t.groupKey ? { kind: "group" as const, id: t.groupKey } : t.counterpart ? { kind: "person" as const, id: contactId(t.counterpart) } : null,
      }));
    return { people, groups, threads };
  }

  async modifyThread(threadId: string, action: ThreadAction): Promise<void> {
    await this.tick(80);
    const msgs = this.messages.filter((m) => m.threadId === threadId);
    if (!msgs.length) throw new MailClientError("Thread not found", "not_found", 404);
    const set = (m: DemoMessage, label: string, on: boolean) => {
      m.labels = m.labels.filter((l) => l !== label);
      if (on) m.labels.push(label);
    };
    switch (action) {
      case "archive":
        msgs.forEach((m) => set(m, "INBOX", false));
        break;
      case "unarchive":
        msgs.forEach((m) => !this.self.addresses.has(m.from.email) && set(m, "INBOX", true));
        if (!msgs.some((m) => m.labels.includes("INBOX"))) set(msgs[msgs.length - 1], "INBOX", true);
        break;
      case "read":
      case "unread": {
        if (action === "read") msgs.forEach((m) => set(m, "UNREAD", false));
        else {
          const lastIncoming = [...msgs].sort((a, b) => b.date - a.date).find((m) => !this.self.addresses.has(m.from.email)) ?? msgs[0];
          set(lastIncoming, "UNREAD", true);
        }
        break;
      }
      case "star":
        set([...msgs].sort((a, b) => b.date - a.date)[0], "STARRED", true);
        break;
      case "unstar":
        msgs.forEach((m) => set(m, "STARRED", false));
        break;
      case "trash":
        msgs.forEach((m) => set(m, "TRASH", true));
        break;
    }
  }

  async modifyMessage(messageId: string, action: MessageAction): Promise<void> {
    await this.tick(60);
    const m = this.messages.find((x) => x.id === messageId);
    if (!m) throw new MailClientError("Message not found", "not_found", 404);
    const label = action === "read" || action === "unread" ? "UNREAD" : "STARRED";
    const on = action === "unread" || action === "star";
    m.labels = m.labels.filter((l) => l !== label);
    if (on) m.labels.push(label);
  }

  async send(input: SendInput): Promise<SendResult> {
    const prior = this.sentKeys.get(input.idempotencyKey);
    if (prior) return { ...prior, deduplicated: true };
    if (!input.to.length && !input.cc.length && !input.bcc.length) throw new MailClientError("Add at least one recipient", "invalid", 400);
    await this.tick(450);

    const isReply = (input.mode === "reply" || input.mode === "replyAll") && input.threadId;
    const threadId = isReply ? input.threadId! : `t-demo-${Date.now().toString(36)}-${this.seq++}`;
    const original = input.inReplyToMessageId ? this.messages.find((m) => m.id === input.inReplyToMessageId) : null;
    const subject = isReply
      ? replySubject(original?.subject ?? input.subject)
      : input.mode === "forward"
        ? forwardSubject(input.subject)
        : input.subject.trim() || "(no subject)";

    const attachments: DemoAttachment[] = await Promise.all(
      input.attachments.map(async (a, i) => {
        const dataUrl = await blobToDataUrl(a.data, a.mimeType);
        return { id: `${threadId}-att-${Date.now()}-${i}`, filename: a.filename, mimeType: a.mimeType || "application/octet-stream", make: () => ({ dataUrl, size: a.data.size }) };
      }),
    );

    const msg: DemoMessage = {
      id: `${threadId}-${Date.now().toString(36)}`,
      threadId,
      from: DEMO_ME,
      to: input.to,
      cc: input.cc,
      date: Date.now(),
      labels: ["SENT"],
      subject,
      text: input.text,
      attachments,
    };
    this.messages.push(msg);
    const result: SendResult = { messageId: msg.id, threadId };
    this.sentKeys.set(input.idempotencyKey, result);

    // Simulate the other side answering a little later — like real e-mail, not instantly.
    const recipient = input.to[0];
    if (recipient && !this.repliedThreads.has(threadId)) {
      this.repliedThreads.add(threadId);
      const known = this.names().get(normalizeEmail(recipient.email));
      setTimeout(() => {
        this.messages.push({
          id: `${threadId}-r-${Date.now().toString(36)}`,
          threadId,
          from: { email: normalizeEmail(recipient.email), name: known ?? recipient.name ?? null },
          to: [DEMO_ME],
          cc: input.cc.filter((c) => normalizeEmail(c.email) !== normalizeEmail(recipient.email)),
          date: Date.now(),
          labels: ["INBOX", "UNREAD"],
          subject: replySubject(subject),
          text: AUTO_REPLIES[this.seq++ % AUTO_REPLIES.length],
          attachments: [],
        });
      }, 7000);
    }
    return result;
  }

  async saveDraft(input: DraftInput): Promise<{ draftId: string }> {
    return { draftId: input.draftId ?? `demo-draft-${Date.now().toString(36)}` };
  }

  async deleteDraft(): Promise<void> {}

  async getOriginal(messageId: string): Promise<string> {
    const m = this.messages.find((x) => x.id === messageId);
    if (!m) throw new MailClientError("Message not found", "not_found", 404);
    const lines = [
      `Message-ID: <${m.id}@demo.emailto.chat>`,
      `Date: ${new Date(m.date).toUTCString()}`,
      `From: ${formatAddress(m.from)}`,
      `To: ${m.to.map(formatAddress).join(", ")}`,
      ...(m.cc.length ? [`Cc: ${m.cc.map(formatAddress).join(", ")}`] : []),
      `Subject: ${m.subject}`,
      `X-Gmail-Labels: ${m.labels.join(", ")}`,
      "MIME-Version: 1.0",
      `Content-Type: ${m.html ? "text/html" : "text/plain"}; charset="UTF-8"`,
      "X-Demo: This is sample data generated by emailto.chat Demo Mode",
      "",
      m.html ?? m.text,
    ];
    return lines.join("\n");
  }

  async sync(): Promise<SyncStatus> {
    return { state: "idle", lastSyncAt: new Date().toISOString(), initialSyncComplete: true, backfillComplete: true, threadCount: new Set(this.messages.map((m) => m.threadId)).size };
  }
}

function snippetOf(m: DemoMessage): string {
  const text = m.text || (m.html ? htmlToText(m.html) : "");
  return splitQuotedText(text).text.replace(/\s+/g, " ").slice(0, 140);
}

function blobToDataUrl(blob: Blob, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;,]*/, `data:${mime || "application/octet-stream"}`));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
