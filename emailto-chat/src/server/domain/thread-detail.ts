/**
 * Thread rendering: fetched live from Gmail (format=full) every time. Bodies are parsed,
 * split (quotes / signature), sanitized, returned — and never persisted.
 * The thread is opportunistically re-indexed so the sidebar stays fresh.
 */
import type { MailAccount } from "@prisma/client";
import { analyzeThread, isFromMe, toThreadSummary } from "@/core/grouping";
import { attachmentKind } from "@/core/attachments";
import { htmlToText, splitQuotedText } from "@/core/quotes";
import type { AttachmentView, MessageBody, MessageView, ThreadDetail } from "@/core/types";
import { selfIdentity } from "../auth/account";
import { ApiError } from "../errors";
import { isGmailError } from "../gmail/errors";
import { parseGmailMessage, visibleAttachments, type ParsedMessage } from "../gmail/mime-parse";
import type { GmailApi } from "../gmail/types";
import { log } from "../log";
import { attachmentRef, attachmentUrls, attachmentViewId } from "./attachments";
import { deleteLocalThread, indexThread, toIndexable } from "./indexer";
import { sanitizeEmailHtml } from "./sanitize";

export function buildMessageBody(p: ParsedMessage, opts: { allowRemoteImages?: boolean } = {}): MessageBody {
  const cidMap = new Map<string, string>();
  for (const a of p.attachments) {
    if (!a.contentId) continue;
    const { previewUrl, downloadUrl } = attachmentUrls(p.id, attachmentRef(a.attachmentId, a.partId), a.mimeType);
    cidMap.set(a.contentId.toLowerCase(), previewUrl ?? downloadUrl);
  }
  const sanitized = p.html ? sanitizeEmailHtml(p.html, { cidMap, allowRemoteImages: opts.allowRemoteImages }) : null;
  const hasPlain = !!p.text && p.text.replace(/\s+/g, "").length > 0;
  const plain = hasPlain ? p.text! : p.html ? htmlToText(p.html) : "";
  const split = splitQuotedText(plain);
  return {
    text: split.text || null,
    quotedText: split.quotedText,
    signature: split.signature,
    html: sanitized?.html ?? null,
    hasRemoteImages: sanitized?.hasRemoteImages ?? false,
    preferHtml: !!sanitized && !hasPlain,
  };
}

export function buildMessageView(
  p: ParsedMessage,
  account: Pick<MailAccount, "emailAddress" | "aliases">,
  opts: { allowRemoteImages?: boolean } = {},
): MessageView {
  const self = selfIdentity(account);
  const fromMe = isFromMe(p, self);
  const attachments: AttachmentView[] = visibleAttachments(p.attachments).map((a) => ({
    id: attachmentViewId(p.id, a.partId),
    messageId: p.id,
    threadId: p.threadId,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    kind: attachmentKind(a.mimeType, a.filename),
    date: new Date(p.internalDate).toISOString(),
    fromMe,
    senderName: fromMe ? null : p.from?.name ?? null,
    ...attachmentUrls(p.id, attachmentRef(a.attachmentId, a.partId), a.mimeType),
  }));
  return {
    id: p.id,
    threadId: p.threadId,
    from: p.from ?? { email: "unknown@unknown", name: null },
    to: p.to,
    cc: p.cc,
    bcc: p.bcc,
    replyTo: p.replyTo,
    date: new Date(p.internalDate).toISOString(),
    subject: p.subject,
    snippet: p.snippet,
    fromMe,
    unread: p.labelIds.includes("UNREAD"),
    starred: p.labelIds.includes("STARRED"),
    rfcMessageId: p.rfcMessageId,
    references: p.references,
    body: buildMessageBody(p, opts),
    attachments,
  };
}

export async function getThreadDetail(
  account: MailAccount,
  gmail: GmailApi,
  gmailThreadId: string,
  opts: { allowRemoteImages?: boolean } = {},
): Promise<ThreadDetail> {
  let thread;
  try {
    thread = await gmail.getThread(gmailThreadId);
  } catch (e) {
    if (isGmailError(e, "not_found")) {
      await deleteLocalThread(account.id, gmailThreadId);
      throw new ApiError("not_found", "Thread not found");
    }
    throw e;
  }
  const parsed = (thread.messages ?? []).map(parseGmailMessage).filter((m) => m.id);
  if (!parsed.length) {
    await deleteLocalThread(account.id, gmailThreadId);
    throw new ApiError("not_found", "Thread not found");
  }
  for (const p of parsed) if (!p.threadId) p.threadId = gmailThreadId;
  parsed.sort((a, b) => a.internalDate - b.internalDate);

  let analysis = null;
  try {
    analysis = await indexThread(account, thread, { parsed });
  } catch {
    log.warn("reindex_on_open_failed", { accountId: account.id });
  }
  analysis ??= analyzeThread(parsed.map(toIndexable), selfIdentity(account));

  return {
    thread: toThreadSummary(analysis),
    messages: parsed.map((p) => buildMessageView(p, account, opts)),
  };
}
