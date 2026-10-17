/**
 * Sending with idempotency.
 *
 * 1. An OutboundMessage(pending) row is created for (account, idempotencyKey) BEFORE calling Gmail.
 * 2. Same key again:
 *      sent                      → return the stored result, `deduplicated: true` (no second send)
 *      pending and < 2 min old   → 409 conflict (the first attempt may still be in flight)
 *      pending (stale) / failed  → look the message up in Gmail (rfc822msgid:<our Message-ID>, then
 *                                  our X-Emailto-Chat-Key header among recent sent mail); found →
 *                                  mark sent and return it; not found → send again.
 * Our Message-ID is `<idempotencyKey@emailto.chat>`.
 */
import type { MailAccount, User } from "@prisma/client";
import { dedupeAddresses, isValidEmail } from "@/core/addresses";
import { forwardSubject } from "@/core/mime";
import type { MimeAttachment } from "@/core/mime";
import type { SendInput, SendResult } from "@/core/types";
import { db, isUniqueViolation } from "../db";
import { ApiError } from "../errors";
import { GmailError } from "../gmail/errors";
import { header, headerMap } from "../gmail/mime-parse";
import type { GmailApi } from "../gmail/types";
import { log } from "../log";
import { buildRaw, loadReplyContext, resolveFrom } from "./compose";
import { indexThread } from "./indexer";

export const IDEMPOTENCY_HEADER = "X-Emailto-Chat-Key";
export const PENDING_STALE_MS = 2 * 60_000;
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export type SendRequest = Omit<SendInput, "attachments">;

export function rfcMessageIdFor(key: string): string {
  return `<${key}@emailto.chat>`;
}

/** Look for a message we already sent with this key. */
export async function findSentByKey(gmail: GmailApi, key: string): Promise<{ id: string; threadId: string } | null> {
  const byId = await gmail.listMessages({ q: `rfc822msgid:${key}@emailto.chat`, maxResults: 1, includeSpamTrash: true });
  if (byId.messages[0]) return byId.messages[0];
  // Fallback: Gmail may replace a client Message-ID; our custom header survives.
  const recent = await gmail.listMessages({ q: "in:sent newer_than:2d", maxResults: 25 });
  for (const m of recent.messages) {
    const full = await gmail.getMessage(m.id, "metadata", [IDEMPOTENCY_HEADER]);
    if (header(headerMap(full.payload?.headers), IDEMPOTENCY_HEADER) === key) return { id: m.id, threadId: m.threadId };
  }
  return null;
}

export interface SendDeps {
  account: MailAccount;
  user: Pick<User, "name">;
  gmail: GmailApi;
}

export async function sendMessage(deps: SendDeps, input: SendRequest, attachments: MimeAttachment[] = []): Promise<SendResult> {
  const { account, gmail } = deps;
  const key = input.idempotencyKey;
  if (!IDEMPOTENCY_KEY_RE.test(key)) throw new ApiError("invalid", "idempotencyKey must be 8-100 chars [A-Za-z0-9_-]");
  const to = dedupeAddresses(input.to);
  const cc = dedupeAddresses(input.cc, to.map((a) => a.email));
  const bcc = dedupeAddresses(input.bcc, [...to, ...cc].map((a) => a.email));
  const all = [...to, ...cc, ...bcc];
  if (!all.length) throw new ApiError("invalid", "Add at least one recipient");
  const bad = all.find((a) => !isValidEmail(a.email));
  if (bad) throw new ApiError("invalid", "Invalid recipient address");
  const from = resolveFrom(account, deps.user, input.from);
  const rfcMessageId = rfcMessageIdFor(key);

  // --- idempotency gate -------------------------------------------------------------------------
  let outboundId: string;
  try {
    const row = await db.outboundMessage.create({
      data: { accountId: account.id, idempotencyKey: key, status: "pending", rfcMessageId },
    });
    outboundId = row.id;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await db.outboundMessage.findUnique({
      where: { accountId_idempotencyKey: { accountId: account.id, idempotencyKey: key } },
    });
    if (!existing) throw new ApiError("conflict", "Send in progress — retry");
    if (existing.status === "sent" && existing.gmailMessageId && existing.gmailThreadId) {
      return { messageId: existing.gmailMessageId, threadId: existing.gmailThreadId, deduplicated: true };
    }
    if (existing.status === "pending" && Date.now() - existing.updatedAt.getTime() < PENDING_STALE_MS) {
      throw new ApiError("conflict", "This message is already being sent");
    }
    // Claim the retry atomically so two concurrent retries cannot both send.
    const claimed = await db.outboundMessage.updateMany({
      where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
      data: { status: "pending" },
    });
    if (!claimed.count) throw new ApiError("conflict", "This message is already being sent");
    const found = await findSentByKey(gmail, key);
    if (found) {
      await db.outboundMessage.update({
        where: { id: existing.id },
        data: { status: "sent", gmailMessageId: found.id, gmailThreadId: found.threadId },
      });
      log.info("send_deduplicated", { accountId: account.id, outboundId: existing.id });
      return { messageId: found.id, threadId: found.threadId, deduplicated: true };
    }
    outboundId = existing.id;
  }

  // --- compose ------------------------------------------------------------------------------------
  let threadId: string | null = null;
  let subject = input.subject;
  let inReplyTo: string | null = null;
  let references: string | null = null;
  try {
    if (input.mode === "reply" || input.mode === "replyAll") {
      const ctx = await loadReplyContext(gmail, input.inReplyToMessageId, input.threadId);
      threadId = ctx.threadId;
      subject = ctx.subject;
      inReplyTo = ctx.inReplyTo;
      references = ctx.references;
    } else if (input.mode === "forward") {
      subject = forwardSubject(input.subject);
    }
  } catch (e) {
    await db.outboundMessage.update({ where: { id: outboundId }, data: { status: "failed" } });
    throw e;
  }

  const raw = buildRaw({
    from,
    to,
    cc,
    bcc,
    subject,
    text: input.text,
    attachments,
    inReplyTo,
    references,
    messageId: rfcMessageId,
    extraHeaders: { [IDEMPOTENCY_HEADER]: key },
  });

  // --- send ---------------------------------------------------------------------------------------
  let sent: { id: string; threadId: string };
  try {
    sent = await gmail.sendMessage({ raw, threadId });
  } catch (e) {
    // Gmail answered with an error → definitely a failure (retry will look up first anyway).
    // No response (network) → outcome unknown, leave pending; a retry after 2 min looks it up.
    if (e instanceof GmailError && e.hadResponse) {
      await db.outboundMessage.update({ where: { id: outboundId }, data: { status: "failed" } }).catch(() => undefined);
    }
    log.warn("send_failed", { accountId: account.id, outboundId, code: (e as { kind?: string }).kind ?? "unknown" });
    throw e;
  }

  await db.outboundMessage.update({
    where: { id: outboundId },
    data: { status: "sent", gmailMessageId: sent.id, gmailThreadId: sent.threadId },
  });
  log.info("send_ok", { accountId: account.id, outboundId });

  // --- after-send housekeeping (best effort) -----------------------------------------------------
  if (input.draftId) {
    await gmail.deleteDraft(input.draftId).catch(() => undefined);
    await db.draft.deleteMany({ where: { accountId: account.id, gmailDraftId: input.draftId } });
  }
  try {
    await indexThread(account, await gmail.getThread(sent.threadId));
  } catch {
    log.warn("index_after_send_failed", { accountId: account.id });
  }
  return { messageId: sent.id, threadId: sent.threadId };
}
