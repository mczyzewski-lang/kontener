/**
 * indexThread: Gmail thread (format=full) → metadata index rows.
 *
 * Idempotent: re-indexing the same thread converges to the same rows (upserts keyed by Gmail ids,
 * participants/attachments replaced per thread, messages that disappeared are deleted).
 * Bodies are parsed only to find attachments — never persisted.
 */
import type { MailAccount, Prisma } from "@prisma/client";
import { analyzeThread, isFromMe, threadContactEmails, type IndexableMessage, type ThreadAnalysis } from "@/core/grouping";
import { normalizeEmail } from "@/core/addresses";
import { db, isUniqueViolation } from "../db";
import { parseGmailMessage, visibleAttachments, type ParsedMessage } from "../gmail/mime-parse";
import type { GmailThread } from "../gmail/types";
import { selfIdentity } from "../auth/account";
import { analysisToThreadData } from "./mappers";

export type IndexAccount = Pick<MailAccount, "id" | "emailAddress" | "aliases">;

export function toIndexable(p: ParsedMessage): IndexableMessage {
  return {
    id: p.id,
    threadId: p.threadId,
    from: p.from,
    to: p.to,
    cc: p.cc,
    bcc: p.bcc,
    date: p.internalDate,
    labelIds: p.labelIds,
    snippet: p.snippet,
    subject: p.subject,
    hasAttachments: visibleAttachments(p.attachments).length > 0,
  };
}

export async function deleteLocalThread(accountId: string, gmailThreadId: string): Promise<void> {
  await db.emailThread.deleteMany({ where: { accountId, gmailThreadId } });
}

export interface IndexOptions {
  /** When the thread was confirmed to exist in Gmail (defaults to now). */
  listedAt?: Date;
  /** Already-parsed messages (avoids parsing twice when rendering). */
  parsed?: ParsedMessage[];
}

export async function indexThread(
  account: IndexAccount,
  thread: GmailThread,
  opts: IndexOptions = {},
): Promise<ThreadAnalysis | null> {
  const gmailThreadId = thread.id;
  if (!gmailThreadId) return null;
  const parsed = (opts.parsed ?? (thread.messages ?? []).map(parseGmailMessage)).filter((m) => m.id);
  if (!parsed.length) {
    await deleteLocalThread(account.id, gmailThreadId);
    return null;
  }
  for (const p of parsed) if (!p.threadId) p.threadId = gmailThreadId;
  const self = selfIdentity(account);
  const analysis = analyzeThread(parsed.map(toIndexable), self);

  for (let attempt = 0; ; attempt++) {
    try {
      await writeThread(account, gmailThreadId, thread.historyId ?? null, parsed, analysis, opts);
      return analysis;
    } catch (err) {
      // Concurrent indexers of the same thread (sync + opportunistic reindex) can collide.
      const code = (err as { code?: string }).code;
      if (attempt < 2 && (isUniqueViolation(err) || code === "P2034")) continue;
      throw err;
    }
  }
}

async function writeThread(
  account: IndexAccount,
  gmailThreadId: string,
  historyId: string | null,
  parsed: ParsedMessage[],
  analysis: ThreadAnalysis,
  opts: IndexOptions,
): Promise<void> {
  const self = selfIdentity(account);
  const accountId = account.id;
  const threadData = {
    ...analysisToThreadData(analysis),
    historyId,
    indexedAt: new Date(),
    // Any successful fetch proves the thread exists now (used by repair-sync pruning).
    listedAt: opts.listedAt ?? new Date(),
  };

  // Participant stats (per contact e-mail): roles + number of messages they appear in.
  const contactEmails = threadContactEmails(analysis);
  const stats = new Map<string, { roles: Set<string>; count: number }>();
  for (const e of contactEmails) stats.set(e, { roles: new Set(), count: 0 });
  for (const m of parsed) {
    const seen = new Set<string>();
    const add = (a: { email: string } | null, role: string) => {
      if (!a) return;
      const e = normalizeEmail(a.email);
      const s = stats.get(e);
      if (!s) return;
      s.roles.add(role);
      if (!seen.has(e)) {
        seen.add(e);
        s.count++;
      }
    };
    add(m.from, "from");
    m.to.forEach((a) => add(a, "to"));
    m.cc.forEach((a) => add(a, "cc"));
  }
  if (analysis.isSelfThread) {
    const s = stats.get(analysis.counterpart!)!;
    s.roles.add("self");
    s.count = parsed.length;
  }
  const names = new Map(analysis.others.map((o) => [o.email, o.name ?? null]));
  const lastSeenAt = new Date(analysis.lastMessageAt);

  await db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const thread = await tx.emailThread.upsert({
        where: { accountId_gmailThreadId: { accountId, gmailThreadId } },
        create: { accountId, gmailThreadId, ...threadData },
        update: threadData,
        select: { id: true },
      });

      // Contacts: identity = e-mail. Keep the most recent non-empty display name.
      const existing = await tx.contact.findMany({ where: { accountId, email: { in: contactEmails } } });
      const byEmail = new Map(existing.map((c) => [c.email, c]));
      const missing = contactEmails.filter((e) => !byEmail.has(e));
      if (missing.length) {
        await tx.contact.createMany({
          data: missing.map((email) => ({ accountId, email, name: names.get(email) ?? null, lastSeenAt })),
          skipDuplicates: true,
        });
      }
      for (const c of existing) {
        const name = names.get(c.email) ?? null;
        const newer = !c.lastSeenAt || c.lastSeenAt <= lastSeenAt;
        const data: { name?: string; lastSeenAt?: Date } = {};
        if (name && name !== c.name && (newer || !c.name)) data.name = name;
        if (newer && (!c.lastSeenAt || c.lastSeenAt.getTime() !== lastSeenAt.getTime())) data.lastSeenAt = lastSeenAt;
        if (Object.keys(data).length) await tx.contact.update({ where: { id: c.id }, data });
      }
      const contacts = await tx.contact.findMany({
        where: { accountId, email: { in: contactEmails } },
        select: { id: true, email: true },
      });

      await tx.threadParticipant.deleteMany({ where: { threadId: thread.id } });
      await tx.threadParticipant.createMany({
        data: contacts.map((c) => ({
          threadId: thread.id,
          contactId: c.id,
          roles: [...(stats.get(c.email)?.roles ?? [])].sort(),
          messageCount: stats.get(c.email)?.count ?? 0,
        })),
        skipDuplicates: true,
      });

      // Messages (metadata only). Remove the ones no longer in the thread.
      const ids = parsed.map((m) => m.id);
      await tx.emailMessage.deleteMany({ where: { threadId: thread.id, gmailMessageId: { notIn: ids } } });
      const messageRowIds: Array<{ rowId: string; parsed: ParsedMessage }> = [];
      for (const m of parsed) {
        const data = {
          threadId: thread.id,
          gmailThreadId,
          rfcMessageId: m.rfcMessageId,
          inReplyTo: m.inReplyTo,
          references: m.references,
          subject: m.subject,
          snippet: m.snippet,
          internalDate: new Date(m.internalDate),
          labelIds: m.labelIds,
          isUnread: m.labelIds.includes("UNREAD"),
          isStarred: m.labelIds.includes("STARRED"),
          isFromMe: isFromMe(m, self),
          fromEmail: m.from?.email ?? null,
          fromName: m.from?.name ?? null,
          toJson: m.to.map(plainAddress),
          ccJson: m.cc.map(plainAddress),
          bccJson: m.bcc.map(plainAddress),
          replyToJson: m.replyTo.map(plainAddress),
          hasAttachments: visibleAttachments(m.attachments).length > 0,
        };
        const row = await tx.emailMessage.upsert({
          where: { accountId_gmailMessageId: { accountId, gmailMessageId: m.id } },
          create: { accountId, gmailMessageId: m.id, ...data },
          update: data,
          select: { id: true },
        });
        messageRowIds.push({ rowId: row.id, parsed: m });
      }

      await tx.attachmentMetadata.deleteMany({ where: { messageId: { in: messageRowIds.map((r) => r.rowId) } } });
      const attachments = messageRowIds.flatMap(({ rowId, parsed: m }) =>
        m.attachments.map((a) => ({
          messageId: rowId,
          accountId,
          threadId: thread.id,
          gmailMessageId: m.id,
          gmailAttachmentId: a.attachmentId,
          partId: a.partId,
          filename: a.filename.slice(0, 500),
          mimeType: a.mimeType.slice(0, 200),
          size: a.size,
          contentId: a.contentId,
          isInline: a.isInline,
        })),
      );
      if (attachments.length) await tx.attachmentMetadata.createMany({ data: attachments, skipDuplicates: true });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

function plainAddress(a: { email: string; name?: string | null }) {
  return { email: a.email, name: a.name ?? null };
}
