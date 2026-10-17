/**
 * Person-first indexing: how Gmail threads become people, groups and tabs.
 *
 * Rules (see README → "Data model"):
 *  1. A contact is identified ONLY by its normalized e-mail address — never by display name.
 *  2. A thread is the unit of a "topic" (tab). Its identity is Gmail's threadId — never the Subject.
 *  3. The participants of a thread = every From/To/Cc address over all its messages, minus my own
 *     addresses (primary + aliases). Bcc is ignored: a Bcc'd person is not part of the conversation.
 *  4. 0 other participants → "note to self"; 1 → direct thread with that person;
 *     ≥2 → group thread. Group threads with the exact same participant set form one group
 *     conversation (key = hash of the sorted address set) — so groups are derived from real
 *     participants of real threads, not from any single e-mail with many recipients.
 *  5. Every thread exists once. People and groups are *indexes* over threads; a person view
 *     contains their direct threads and the group threads they took part in.
 *  6. Unread counts of people/groups are aggregates over thread/message state, never stored flags.
 */
import { displayName, firstName, normalizeEmail, stableHash } from "./addresses";
import type {
  Address,
  ConversationList,
  GroupSummary,
  Mailbox,
  PersonSummary,
  ReadFilter,
  ThreadSummary,
} from "./types";

export interface IndexableMessage {
  id: string;
  threadId: string;
  from: Address | null;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  /** epoch ms */
  date: number;
  labelIds: string[];
  snippet: string;
  subject: string;
  hasAttachments: boolean;
}

export interface SelfIdentity {
  addresses: Set<string>;
  primary: string;
}

export function makeSelf(primary: string, aliases: string[] = []): SelfIdentity {
  const p = normalizeEmail(primary);
  return { primary: p, addresses: new Set([p, ...aliases.map(normalizeEmail)]) };
}

export function isFromMe(m: Pick<IndexableMessage, "labelIds" | "from">, self: SelfIdentity): boolean {
  if (m.labelIds.includes("SENT")) return true;
  return !!m.from && self.addresses.has(normalizeEmail(m.from.email));
}

export interface ThreadAnalysis {
  threadId: string;
  subject: string;
  snippet: string;
  lastMessageAt: number;
  messageCount: number;
  unreadCount: number;
  labelIds: string[];
  inInbox: boolean;
  starred: boolean;
  hasSent: boolean;
  hidden: boolean; // trash / spam
  hasAttachments: boolean;
  /** Other participants (me excluded), sorted by e-mail, with the most recent display name seen. */
  others: Address[];
  isSelfThread: boolean;
  isGroup: boolean;
  groupKey: string | null;
  /** For direct threads: the single other address. For self threads: my primary address. */
  counterpart: string | null;
  lastFromMe: boolean;
  lastSender: Address | null;
}

export const SYSTEM_HIDDEN_LABELS = ["TRASH", "SPAM"];

export function groupKeyFor(emails: string[]): string {
  const sorted = [...new Set(emails.map(normalizeEmail))].sort();
  return "g" + stableHash(sorted.join(","));
}

/** "Re: Fwd: Offer" → "Offer" (display only; never used for identity). */
export function cleanSubject(subject: string | null | undefined): string {
  const s = (subject ?? "").replace(/^\s*((re|fw|fwd|aw|wg|odp|pd|sv|vs|tr)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
  return s || "(no subject)";
}

export function analyzeThread(messages: IndexableMessage[], self: SelfIdentity): ThreadAnalysis {
  if (!messages.length) throw new Error("analyzeThread: empty thread");
  const sorted = [...messages].sort((a, b) => a.date - b.date);
  const names = new Map<string, string | null>();
  const labelSet = new Set<string>();
  let unread = 0;
  let hasAttachments = false;

  for (const m of sorted) {
    m.labelIds.forEach((l) => labelSet.add(l));
    if (m.labelIds.includes("UNREAD")) unread++;
    if (m.hasAttachments) hasAttachments = true;
    for (const a of [m.from, ...m.to, ...m.cc]) {
      if (!a) continue;
      const e = normalizeEmail(a.email);
      if (self.addresses.has(e)) continue;
      // Later messages win, but never overwrite a known name with an empty one.
      if (a.name || !names.has(e)) names.set(e, a.name || names.get(e) || null);
    }
  }
  // Sent messages may come from an address we did not know was ours (e.g. an alias not yet
  // synced). The SENT label is authoritative, so drop such From addresses from "others".
  for (const m of sorted) {
    if (m.labelIds.includes("SENT") && m.from) names.delete(normalizeEmail(m.from.email));
  }

  const others: Address[] = [...names.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => a.email.localeCompare(b.email));

  const last = sorted[sorted.length - 1];
  const first = sorted.find((m) => m.subject?.trim()) ?? sorted[0];
  const isSelfThread = others.length === 0;
  const isGroup = others.length >= 2;
  const lastFromMe = isFromMe(last, self);

  return {
    threadId: last.threadId,
    subject: first.subject?.trim() || "(no subject)",
    snippet: last.snippet,
    lastMessageAt: last.date,
    messageCount: sorted.length,
    unreadCount: unread,
    labelIds: [...labelSet].sort(),
    inInbox: labelSet.has("INBOX"),
    starred: labelSet.has("STARRED"),
    hasSent: sorted.some((m) => isFromMe(m, self)),
    hidden: SYSTEM_HIDDEN_LABELS.some((l) => labelSet.has(l)),
    hasAttachments,
    others,
    isSelfThread,
    isGroup,
    groupKey: isGroup ? groupKeyFor(others.map((o) => o.email)) : null,
    counterpart: isSelfThread ? self.primary : isGroup ? null : others[0].email,
    lastFromMe,
    lastSender: last.from ? { email: normalizeEmail(last.from.email), name: last.from.name ?? null } : null,
  };
}

/** Does a thread belong to the mailbox view? Mirrors Gmail's thread-level label semantics. */
export function threadInMailbox(t: Pick<ThreadAnalysis, "labelIds" | "hidden" | "hasSent">, mailbox: Mailbox): boolean {
  if (t.hidden) return false;
  switch (mailbox) {
    case "inbox":
      return t.labelIds.includes("INBOX");
    case "sent":
      return t.hasSent;
    case "archive":
      return !t.labelIds.includes("INBOX");
    case "all":
      return true;
  }
}

/** "Anna, Michał + 2" */
export function groupTitle(members: Address[]): string {
  if (!members.length) return "Group";
  const names = members.map((m) => firstName(m));
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} + ${names.length - 2}`;
}

/** Every address that took part in the thread (others only) — used for the person → threads index. */
export function threadContactEmails(t: ThreadAnalysis): string[] {
  return t.isSelfThread ? [t.counterpart!] : t.others.map((o) => o.email);
}

export function toThreadSummary(t: ThreadAnalysis): ThreadSummary {
  return {
    id: t.threadId,
    subject: t.subject,
    snippet: t.snippet,
    lastMessageAt: new Date(t.lastMessageAt).toISOString(),
    messageCount: t.messageCount,
    unreadCount: t.unreadCount,
    isGroup: t.isGroup,
    participants: t.others,
    inInbox: t.inInbox,
    starred: t.starred,
    hasAttachments: t.hasAttachments,
    groupId: t.groupKey,
  };
}

export interface AggregateOptions {
  mailbox: Mailbox;
  filter: ReadFilter;
  /** Maps an e-mail to a stable contact id (DB id on the server, hash in the demo). */
  contactId: (email: string) => string;
  self: SelfIdentity;
  /** Best known display names per e-mail (e.g. from the contacts table). */
  names?: Map<string, string | null>;
}

/**
 * Build the sidebar from analysed threads.
 * People are listed when they have ≥1 *direct* thread in the mailbox; their badge and ordering
 * use direct threads only, so a group message is never counted twice (person + group).
 */
export function aggregateConversations(threads: ThreadAnalysis[], opts: AggregateOptions): ConversationList {
  const people = new Map<string, PersonSummary & { _ts: number }>();
  const groups = new Map<string, GroupSummary & { _ts: number }>();
  const bestName = (email: string, fallback?: string | null) => opts.names?.get(email) ?? fallback ?? null;

  for (const t of threads) {
    if (!threadInMailbox(t, opts.mailbox)) continue;
    if (t.isGroup && t.groupKey) {
      const g = groups.get(t.groupKey) ?? {
        kind: "group" as const,
        id: t.groupKey,
        members: t.others.map((o) => ({ ...o, name: bestName(o.email, o.name) })),
        title: "",
        lastActivityAt: null,
        lastSnippet: "",
        lastSenderName: null,
        lastFromMe: false,
        unreadCount: 0,
        threadCount: 0,
        _ts: 0,
      };
      g.unreadCount += t.unreadCount;
      g.threadCount += 1;
      if (t.lastMessageAt > g._ts) {
        g._ts = t.lastMessageAt;
        g.lastActivityAt = new Date(t.lastMessageAt).toISOString();
        g.lastSnippet = t.snippet;
        g.lastFromMe = t.lastFromMe;
        g.lastSenderName = t.lastFromMe ? "You" : t.lastSender ? firstName(t.lastSender) : null;
      }
      groups.set(t.groupKey, g);
    } else if (t.counterpart) {
      const email = t.counterpart;
      const nameHint = t.isSelfThread ? null : t.others[0]?.name;
      const p = people.get(email) ?? {
        kind: "person" as const,
        id: opts.contactId(email),
        email,
        name: bestName(email, nameHint),
        isSelf: t.isSelfThread || undefined,
        lastActivityAt: null,
        lastSnippet: "",
        lastFromMe: false,
        unreadCount: 0,
        threadCount: 0,
        _ts: 0,
      };
      p.unreadCount += t.unreadCount;
      p.threadCount += 1;
      if (t.lastMessageAt > p._ts) {
        p._ts = t.lastMessageAt;
        p.lastActivityAt = new Date(t.lastMessageAt).toISOString();
        p.lastSnippet = t.snippet;
        p.lastFromMe = t.lastFromMe;
        if (!opts.names?.get(email) && nameHint) p.name = nameHint;
      }
      people.set(email, p);
    }
  }

  const strip = <T extends { _ts: number }>(x: T): Omit<T, "_ts"> => {
    const { _ts, ...rest } = x;
    void _ts;
    return rest;
  };
  const byRecent = (a: { _ts: number }, b: { _ts: number }) => b._ts - a._ts;
  const unreadOk = (x: { unreadCount: number }) => opts.filter === "all" || x.unreadCount > 0;

  return {
    people: [...people.values()].filter(unreadOk).sort(byRecent).map(strip),
    groups: [...groups.values()]
      .filter(unreadOk)
      .sort(byRecent)
      .map((g) => ({ ...strip(g), title: groupTitle(g.members) })),
  };
}

/** Threads for a person: direct threads + group threads they participated in. Newest first. */
export function threadsForPerson(threads: ThreadAnalysis[], email: string): ThreadAnalysis[] {
  const e = normalizeEmail(email);
  return threads
    .filter((t) => !t.hidden && (t.counterpart === e || t.others.some((o) => o.email === e)))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function threadsForGroup(threads: ThreadAnalysis[], groupKey: string): ThreadAnalysis[] {
  return threads.filter((t) => !t.hidden && t.groupKey === groupKey).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

/** Group messages by thread and analyse each one. */
export function analyzeMessages(messages: IndexableMessage[], self: SelfIdentity): ThreadAnalysis[] {
  const byThread = new Map<string, IndexableMessage[]>();
  for (const m of messages) {
    const list = byThread.get(m.threadId) ?? [];
    list.push(m);
    byThread.set(m.threadId, list);
  }
  return [...byThread.values()].map((list) => analyzeThread(list, self));
}

export { displayName };
