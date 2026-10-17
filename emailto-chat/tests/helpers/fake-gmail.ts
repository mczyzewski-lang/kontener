/**
 * FakeGmail — an in-memory implementation of the GmailApi interface used by the sync engine,
 * the domain layer and the routes. Models the parts of Gmail semantics the app relies on:
 * threads, labels, history records (with expirable cursors), send (with RFC 822 header parsing),
 * drafts, attachments, rfc822msgid: search, watch/stop.
 */
import { GmailError } from "@/server/gmail/errors";
import type {
  GmailApi,
  GmailHistory,
  GmailMessage,
  GmailMessagePart,
  GmailThread,
  HistoryPage,
  LabelChange,
  ListMessagesParams,
  ListThreadsParams,
  MessageFormat,
  SendAs,
} from "@/server/gmail/types";

export interface FakeAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
  contentId?: string;
  inline?: boolean;
}

export interface FakeMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate: number;
  historyId: number;
  headers: Array<[string, string]>;
  text: string | null;
  html: string | null;
  attachments: FakeAttachment[];
  snippet: string;
}

export interface AddMessageInput {
  threadId?: string;
  from: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  labels?: string[];
  date?: number;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: FakeAttachment[];
}

type HistoryRecord = { id: number; kind: "messagesAdded" | "messagesDeleted" | "labelsAdded" | "labelsRemoved"; messageId: string; threadId: string };

const b64url = (s: string | Uint8Array) => Buffer.from(typeof s === "string" ? Buffer.from(s, "utf8") : s).toString("base64url");

export class FakeGmail implements GmailApi {
  readonly messages = new Map<string, FakeMessage>();
  readonly drafts = new Map<string, { raw: string; threadId: string | null }>();
  readonly sent: Array<{ raw: string; threadId: string | null; decoded: string }> = [];
  readonly calls: Record<string, number> = {};
  history: HistoryRecord[] = [];
  historyId = 1000;
  /** history.list with a startHistoryId below this → 404 (expired cursor). */
  minHistoryId = 0;
  sendAs: SendAs[] = [];
  watching = false;
  /** Failure injection for send. */
  sendBehavior: "ok" | "accept_then_network_error" | "reject" = "ok";
  private seq = 0;
  private clock = Date.UTC(2026, 0, 1);

  constructor(public emailAddress = "me@example.com") {}

  private count(name: string) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  get totalCalls(): number {
    return Object.values(this.calls).reduce((a, b) => a + b, 0);
  }

  private newId(prefix = ""): string {
    this.seq++;
    return `${prefix}${(0x18c0000000 + this.seq * 7919).toString(16)}`;
  }

  private bump(kind: HistoryRecord["kind"], m: FakeMessage) {
    this.historyId++;
    m.historyId = this.historyId;
    this.history.push({ id: this.historyId, kind, messageId: m.id, threadId: m.threadId });
  }

  /** Add a message (as if it arrived / was sent from Gmail web). Returns the message. */
  addMessage(input: AddMessageInput): FakeMessage {
    const id = this.newId();
    const threadId = input.threadId ?? id;
    this.clock += 60_000;
    const date = input.date ?? this.clock;
    const headers: Array<[string, string]> = [
      ["From", input.from],
      ["To", (input.to ?? []).join(", ")],
      ...(input.cc?.length ? [["Cc", input.cc.join(", ")] as [string, string]] : []),
      ["Subject", input.subject ?? "(no subject)"],
      ["Date", new Date(date).toUTCString()],
      ["Message-ID", input.messageId ?? `<${id}@mail.example.com>`],
      ...(input.inReplyTo ? [["In-Reply-To", input.inReplyTo] as [string, string]] : []),
      ...(input.references ? [["References", input.references] as [string, string]] : []),
    ];
    const text = input.text === undefined ? `Message ${id}` : input.text;
    const m: FakeMessage = {
      id,
      threadId,
      labelIds: input.labels ?? ["INBOX", "UNREAD"],
      internalDate: date,
      historyId: 0,
      headers: headers.filter(([, v]) => v !== ""),
      text,
      html: input.html ?? null,
      attachments: input.attachments ?? [],
      snippet: (text ?? input.html ?? "").replace(/<[^>]+>/g, "").slice(0, 100),
    };
    this.messages.set(id, m);
    this.bump("messagesAdded", m);
    return m;
  }

  deleteMessage(id: string) {
    const m = this.messages.get(id);
    if (!m) return;
    this.messages.delete(id);
    this.bump("messagesDeleted", m);
  }

  deleteThread(threadId: string) {
    for (const m of [...this.messages.values()]) if (m.threadId === threadId) this.deleteMessage(m.id);
  }

  /** Simulate Gmail expiring old history: cursors older than "now" become invalid. */
  expireHistory() {
    this.minHistoryId = this.historyId + 1;
    this.history = [];
  }

  threadMessages(threadId: string): FakeMessage[] {
    return [...this.messages.values()].filter((m) => m.threadId === threadId).sort((a, b) => a.internalDate - b.internalDate);
  }

  // ---- schema builders -------------------------------------------------------------------------

  private textPart(partId: string, type: "plain" | "html", content: string): GmailMessagePart {
    const data = b64url(content);
    return {
      partId,
      mimeType: `text/${type}`,
      filename: "",
      headers: [{ name: "Content-Type", value: `text/${type}; charset="UTF-8"` }],
      body: { data, size: Buffer.byteLength(content) },
    };
  }

  private payload(m: FakeMessage): GmailMessagePart {
    const headers = m.headers.map(([name, value]) => ({ name, value }));
    const body: GmailMessagePart[] = [];
    let bodyPart: GmailMessagePart;
    if (m.html && m.text !== null) {
      bodyPart = {
        partId: "0",
        mimeType: "multipart/alternative",
        filename: "",
        headers: [{ name: "Content-Type", value: 'multipart/alternative; boundary="b1"' }],
        body: { size: 0 },
        parts: [this.textPart("0.0", "plain", m.text), this.textPart("0.1", "html", m.html)],
      };
    } else if (m.html) bodyPart = this.textPart("0", "html", m.html);
    else bodyPart = this.textPart("0", "plain", m.text ?? "");
    if (!m.attachments.length) {
      return { ...bodyPart, partId: "", headers: [...headers, ...(bodyPart.headers ?? [])], parts: bodyPart.parts?.map((p, i) => ({ ...p, partId: String(i) })) };
    }
    body.push(bodyPart);
    m.attachments.forEach((a, i) => {
      const h = [
        { name: "Content-Type", value: `${a.mimeType}; name="${a.filename}"` },
        { name: "Content-Disposition", value: `${a.inline ? "inline" : "attachment"}; filename="${a.filename}"` },
        ...(a.contentId ? [{ name: "Content-ID", value: `<${a.contentId}>` }] : []),
      ];
      body.push({
        partId: String(i + 1),
        mimeType: a.mimeType,
        filename: a.filename,
        headers: h,
        body: { attachmentId: `att_${m.id}_${i + 1}`, size: a.data.byteLength },
      });
    });
    return {
      partId: "",
      mimeType: "multipart/mixed",
      filename: "",
      headers: [...headers, { name: "Content-Type", value: 'multipart/mixed; boundary="b0"' }],
      body: { size: 0 },
      parts: body,
    };
  }

  private toSchema(m: FakeMessage, format: MessageFormat = "full", metadataHeaders?: string[]): GmailMessage {
    const base: GmailMessage = {
      id: m.id,
      threadId: m.threadId,
      labelIds: [...m.labelIds],
      snippet: m.snippet,
      internalDate: String(m.internalDate),
      historyId: String(m.historyId),
    };
    if (format === "raw") return { ...base, raw: b64url(this.rawOf(m)) };
    if (format === "metadata") {
      const wanted = metadataHeaders?.map((h) => h.toLowerCase());
      return {
        ...base,
        payload: {
          headers: m.headers
            .filter(([n]) => !wanted || wanted.includes(n.toLowerCase()))
            .map(([name, value]) => ({ name, value })),
        },
      };
    }
    if (format === "minimal") return base;
    return { ...base, payload: this.payload(m) };
  }

  private rawOf(m: FakeMessage): string {
    return [...m.headers.map(([k, v]) => `${k}: ${v}`), "Content-Type: text/plain; charset=UTF-8", "", m.text ?? m.html ?? ""].join("\r\n");
  }

  private visibleThreadIds(includeSpamTrash = false): string[] {
    const latest = new Map<string, number>();
    for (const m of this.messages.values()) {
      if (!includeSpamTrash && (m.labelIds.includes("SPAM") || m.labelIds.includes("TRASH"))) continue;
      latest.set(m.threadId, Math.max(latest.get(m.threadId) ?? 0, m.internalDate));
    }
    return [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }

  private applyLabels(m: FakeMessage, change: LabelChange) {
    const before = new Set(m.labelIds);
    const remove = new Set(change.removeLabelIds ?? []);
    m.labelIds = [...new Set([...m.labelIds.filter((l) => !remove.has(l)), ...(change.addLabelIds ?? [])])];
    const added = m.labelIds.some((l) => !before.has(l));
    const removed = [...before].some((l) => !m.labelIds.includes(l));
    if (added) this.bump("labelsAdded", m);
    if (removed) this.bump("labelsRemoved", m);
  }

  // ---- GmailApi ----------------------------------------------------------------------------------

  async getProfile() {
    this.count("getProfile");
    return { emailAddress: this.emailAddress, historyId: String(this.historyId) };
  }

  async listThreads(p: ListThreadsParams) {
    this.count("listThreads");
    const ids = this.visibleThreadIds(p.includeSpamTrash);
    const start = p.pageToken ? Number(p.pageToken) : 0;
    const size = p.maxResults ?? 100;
    const page = ids.slice(start, start + size);
    return {
      threads: page.map((id) => ({
        id,
        historyId: String(Math.max(...this.threadMessages(id).map((m) => m.historyId))),
      })),
      nextPageToken: start + size < ids.length ? String(start + size) : null,
    };
  }

  async getThread(threadId: string): Promise<GmailThread> {
    this.count("getThread");
    const msgs = this.threadMessages(threadId);
    if (!msgs.length) throw new GmailError("not_found", "gmail_not_found_404", 404);
    return {
      id: threadId,
      historyId: String(Math.max(...msgs.map((m) => m.historyId))),
      messages: msgs.map((m) => this.toSchema(m)),
    };
  }

  async modifyThread(threadId: string, change: LabelChange) {
    this.count("modifyThread");
    const msgs = this.threadMessages(threadId);
    if (!msgs.length) throw new GmailError("not_found", "gmail_not_found_404", 404);
    msgs.forEach((m) => this.applyLabels(m, change));
  }

  async trashThread(threadId: string) {
    this.count("trashThread");
    const msgs = this.threadMessages(threadId);
    if (!msgs.length) throw new GmailError("not_found", "gmail_not_found_404", 404);
    msgs.forEach((m) => this.applyLabels(m, { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }));
  }

  async getMessage(messageId: string, format: MessageFormat, metadataHeaders?: string[]) {
    this.count("getMessage");
    const m = this.messages.get(messageId);
    if (!m) throw new GmailError("not_found", "gmail_not_found_404", 404);
    return this.toSchema(m, format, metadataHeaders);
  }

  async modifyMessage(messageId: string, change: LabelChange) {
    this.count("modifyMessage");
    const m = this.messages.get(messageId);
    if (!m) throw new GmailError("not_found", "gmail_not_found_404", 404);
    this.applyLabels(m, change);
  }

  async sendMessage(input: { raw: string; threadId?: string | null }) {
    this.count("sendMessage");
    if (this.sendBehavior === "reject") throw new GmailError("invalid", "gmail_invalid_400", 400);
    const decoded = Buffer.from(input.raw, "base64url").toString("utf8");
    this.sent.push({ raw: input.raw, threadId: input.threadId ?? null, decoded });
    const headers = parseRawHeaders(decoded);
    const get = (n: string) => headers.find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1] ?? "";
    if (input.threadId && !this.threadMessages(input.threadId).length) throw new GmailError("not_found", "gmail_not_found_404", 404);
    const m = this.addMessage({
      threadId: input.threadId ?? undefined,
      from: get("From"),
      to: get("To") ? [get("To")] : [],
      cc: get("Cc") ? [get("Cc")] : undefined,
      subject: get("Subject"),
      messageId: get("Message-ID") || undefined,
      inReplyTo: get("In-Reply-To") || undefined,
      references: get("References") || undefined,
      labels: ["SENT"],
      text: "(sent via API)",
    });
    for (const [k, v] of headers) if (k.toLowerCase().startsWith("x-")) m.headers.push([k, v]);
    if (this.sendBehavior === "accept_then_network_error") {
      this.sendBehavior = "ok";
      throw new GmailError("network", "gmail_network");
    }
    return { id: m.id, threadId: m.threadId };
  }

  async getAttachment(messageId: string, attachmentId: string) {
    this.count("getAttachment");
    const m = this.messages.get(messageId);
    const idx = Number(attachmentId.split("_").pop()) - 1;
    const a = m?.attachments[idx];
    if (!m || !a || attachmentId !== `att_${m.id}_${idx + 1}`) throw new GmailError("not_found", "gmail_not_found_404", 404);
    return { data: b64url(a.data), size: a.data.byteLength };
  }

  async listMessages(p: ListMessagesParams) {
    this.count("listMessages");
    const q = (p.q ?? "").trim();
    let list = [...this.messages.values()];
    if (!p.includeSpamTrash) list = list.filter((m) => !m.labelIds.includes("SPAM") && !m.labelIds.includes("TRASH"));
    const rfc = q.match(/^rfc822msgid:(\S+)$/i);
    if (rfc) {
      const want = `<${rfc[1].replace(/^<|>$/g, "")}>`;
      list = list.filter((m) => m.headers.some(([k, v]) => k.toLowerCase() === "message-id" && v === want));
    } else if (/^in:sent/i.test(q)) {
      list = list.filter((m) => m.labelIds.includes("SENT"));
    } else if (q) {
      const needle = q.toLowerCase();
      list = list.filter((m) =>
        [m.text ?? "", m.html ?? "", ...m.headers.map(([, v]) => v)].some((s) => s.toLowerCase().includes(needle)),
      );
    }
    list.sort((a, b) => b.internalDate - a.internalDate);
    return { messages: list.slice(0, p.maxResults ?? 100).map((m) => ({ id: m.id, threadId: m.threadId })), nextPageToken: null };
  }

  async createDraft(input: { raw: string; threadId?: string | null }) {
    this.count("createDraft");
    const id = this.newId("r-");
    this.drafts.set(id, { raw: input.raw, threadId: input.threadId ?? null });
    return { id };
  }

  async updateDraft(draftId: string, input: { raw: string; threadId?: string | null }) {
    this.count("updateDraft");
    if (!this.drafts.has(draftId)) throw new GmailError("not_found", "gmail_not_found_404", 404);
    this.drafts.set(draftId, { raw: input.raw, threadId: input.threadId ?? null });
    return { id: draftId };
  }

  async deleteDraft(draftId: string) {
    this.count("deleteDraft");
    if (!this.drafts.delete(draftId)) throw new GmailError("not_found", "gmail_not_found_404", 404);
  }

  async listHistory(p: { startHistoryId: string; pageToken?: string | null }): Promise<HistoryPage> {
    this.count("listHistory");
    const start = Number(p.startHistoryId);
    if (start < this.minHistoryId) throw new GmailError("not_found", "gmail_not_found_404", 404);
    const records = this.history.filter((h) => h.id > start);
    const history: GmailHistory[] = records.map((h) => ({
      id: String(h.id),
      [h.kind]: [{ message: { id: h.messageId, threadId: h.threadId } }],
    }));
    return { history, nextPageToken: null, historyId: String(this.historyId) };
  }

  async watch() {
    this.count("watch");
    this.watching = true;
    return { historyId: String(this.historyId), expiration: String(Date.now() + 7 * 24 * 3600 * 1000) };
  }

  async stop() {
    this.count("stop");
    this.watching = false;
  }

  async listSendAs() {
    this.count("listSendAs");
    return [{ sendAsEmail: this.emailAddress, isPrimary: true, verificationStatus: null }, ...this.sendAs];
  }
}

/** Parse RFC 822 headers (with folding) from a raw message string. */
export function parseRawHeaders(raw: string): Array<[string, string]> {
  const head = raw.split(/\r?\n\r?\n/)[0];
  const lines = head.split(/\r?\n/);
  const out: Array<[string, string]> = [];
  for (const line of lines) {
    if (/^\s/.test(line) && out.length) out[out.length - 1][1] += " " + line.trim();
    else {
      const i = line.indexOf(":");
      if (i > 0) out.push([line.slice(0, i), line.slice(i + 1).trim()]);
    }
  }
  return out;
}

export function rawHeader(raw: string, name: string): string | null {
  return parseRawHeaders(raw).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
}
