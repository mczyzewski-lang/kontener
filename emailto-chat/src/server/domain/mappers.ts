/** Row ↔ core view-model mapping helpers. */
import type { EmailMessage, EmailThread } from "@prisma/client";
import { normalizeEmail } from "@/core/addresses";
import type { IndexableMessage, ThreadAnalysis } from "@/core/grouping";
import type { Address, ThreadSummary } from "@/core/types";

export function asAddresses(v: unknown): Address[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is { email: string; name?: string | null } => !!a && typeof a === "object" && typeof (a as Address).email === "string")
    .map((a) => ({ email: normalizeEmail(a.email), name: a.name ?? null }));
}

export type ThreadRow = Pick<
  EmailThread,
  | "gmailThreadId"
  | "subject"
  | "snippet"
  | "lastMessageAt"
  | "messageCount"
  | "unreadCount"
  | "isGroup"
  | "participantsJson"
  | "inInbox"
  | "starred"
  | "hasAttachments"
  | "groupKey"
>;

export function threadRowToSummary(t: ThreadRow): ThreadSummary {
  return {
    id: t.gmailThreadId,
    subject: t.subject,
    snippet: t.snippet,
    lastMessageAt: t.lastMessageAt.toISOString(),
    messageCount: t.messageCount,
    unreadCount: t.unreadCount,
    isGroup: t.isGroup,
    participants: asAddresses(t.participantsJson),
    inInbox: t.inInbox,
    starred: t.starred,
    hasAttachments: t.hasAttachments,
    groupId: t.groupKey,
  };
}

/** Rebuild the analysis used by core aggregation from a stored thread row. */
export function threadRowToAnalysis(t: EmailThread): ThreadAnalysis {
  return {
    threadId: t.gmailThreadId,
    subject: t.subject,
    snippet: t.snippet,
    lastMessageAt: t.lastMessageAt.getTime(),
    messageCount: t.messageCount,
    unreadCount: t.unreadCount,
    labelIds: t.labelIds,
    inInbox: t.inInbox,
    starred: t.starred,
    hasSent: t.hasSent,
    hidden: t.hidden,
    hasAttachments: t.hasAttachments,
    others: asAddresses(t.participantsJson),
    isSelfThread: t.isSelfThread,
    isGroup: t.isGroup,
    groupKey: t.groupKey,
    counterpart: t.counterpartEmail,
    lastFromMe: t.lastFromMe,
    lastSender: t.lastSenderEmail ? { email: t.lastSenderEmail, name: t.lastSenderName } : null,
  };
}

export function messageRowToIndexable(m: EmailMessage): IndexableMessage {
  return {
    id: m.gmailMessageId,
    threadId: m.gmailThreadId,
    from: m.fromEmail ? { email: m.fromEmail, name: m.fromName } : null,
    to: asAddresses(m.toJson),
    cc: asAddresses(m.ccJson),
    bcc: asAddresses(m.bccJson),
    date: m.internalDate.getTime(),
    labelIds: m.labelIds,
    snippet: m.snippet,
    subject: m.subject,
    hasAttachments: m.hasAttachments,
  };
}

/** Thread columns derived from a core analysis. */
export function analysisToThreadData(a: ThreadAnalysis) {
  return {
    subject: a.subject,
    snippet: a.snippet,
    lastMessageAt: new Date(a.lastMessageAt),
    messageCount: a.messageCount,
    unreadCount: a.unreadCount,
    labelIds: a.labelIds,
    inInbox: a.inInbox,
    starred: a.starred,
    hasSent: a.hasSent,
    hidden: a.hidden,
    hasAttachments: a.hasAttachments,
    isGroup: a.isGroup,
    isSelfThread: a.isSelfThread,
    groupKey: a.groupKey,
    counterpartEmail: a.counterpart,
    lastFromMe: a.lastFromMe,
    lastSenderEmail: a.lastSender?.email ?? null,
    lastSenderName: a.lastSender?.name ?? null,
    participantsJson: a.others.map((o) => ({ email: o.email, name: o.name ?? null })),
  };
}
