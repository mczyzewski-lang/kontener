/** Attachment metadata views, safe download headers and byte fetching. */
import type { MailAccount } from "@prisma/client";
import { attachmentKind, isInlineSafe } from "@/core/attachments";
import { displayName } from "@/core/addresses";
import type { AttachmentScope } from "@/core/client";
import type { AttachmentView } from "@/core/types";
import { db } from "../db";
import { ApiError } from "../errors";
import { isGmailError } from "../gmail/errors";
import { base64UrlToBytes, parseGmailMessage } from "../gmail/mime-parse";
import type { GmailApi, GmailMessagePart } from "../gmail/types";

/** Path segment that identifies an attachment: Gmail's attachmentId, or `part-<partId>` for inlined data. */
export function attachmentRef(attachmentId: string | null, partId: string): string {
  return attachmentId ?? `part-${partId}`;
}

export function attachmentUrls(gmailMessageId: string, ref: string, mimeType: string) {
  const base = `/api/attachments/${encodeURIComponent(gmailMessageId)}/${encodeURIComponent(ref)}`;
  return { downloadUrl: `${base}?download=1`, previewUrl: isInlineSafe(mimeType) ? base : null };
}

export function attachmentViewId(gmailMessageId: string, partId: string): string {
  return `${gmailMessageId}:${partId}`;
}

/** RFC 6266 / 5987 Content-Disposition with an ASCII fallback. */
export function contentDisposition(type: "attachment" | "inline", filename: string): string {
  const clean = filename.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim() || "attachment";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").replace(/[;]/g, "_");
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Headers for serving attachment bytes from our origin. Anything that is not a known-safe inline
 * type (images/PDF — never HTML/SVG/XML) is forced to application/octet-stream + attachment.
 */
export function buildAttachmentHeaders(a: { filename: string; mimeType: string; size?: number; download: boolean }): Headers {
  const safe = isInlineSafe(a.mimeType);
  const inline = safe && !a.download;
  const h = new Headers();
  h.set("Content-Type", safe ? a.mimeType.toLowerCase() : "application/octet-stream");
  h.set("Content-Disposition", contentDisposition(inline ? "inline" : "attachment", a.filename));
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Content-Security-Policy", "sandbox; default-src 'none'");
  h.set("Cache-Control", "private, max-age=300");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  if (a.size !== undefined) h.set("Content-Length", String(a.size));
  return h;
}

async function threadIdsForScope(accountId: string, scope: AttachmentScope): Promise<string[]> {
  if (scope.kind === "thread") {
    const t = await db.emailThread.findUnique({
      where: { accountId_gmailThreadId: { accountId, gmailThreadId: scope.threadId } },
      select: { id: true },
    });
    return t ? [t.id] : [];
  }
  if (scope.kind === "group") {
    const rows = await db.emailThread.findMany({ where: { accountId, groupKey: scope.id, hidden: false }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const contact = await db.contact.findFirst({ where: { id: scope.id, accountId }, select: { id: true } });
  if (!contact) return [];
  const rows = await db.threadParticipant.findMany({
    where: { contactId: contact.id, thread: { accountId, hidden: false } },
    select: { threadId: true },
  });
  return rows.map((r) => r.threadId);
}

/**
 * Attachments of a thread / person / group (newest first). Inline images referenced by Content-ID
 * (signature logos, embedded pictures) are excluded — they are shown inside the message HTML.
 */
export async function listAttachments(accountId: string, scope: AttachmentScope): Promise<AttachmentView[]> {
  const threadIds = await threadIdsForScope(accountId, scope);
  if (!threadIds.length) return [];
  const rows = await db.attachmentMetadata.findMany({
    where: { accountId, threadId: { in: threadIds }, NOT: { isInline: true, contentId: { not: null } } },
    include: {
      message: { select: { internalDate: true, isFromMe: true, fromName: true, fromEmail: true, gmailThreadId: true } },
    },
    orderBy: [{ message: { internalDate: "desc" } }, { partId: "asc" }],
    take: 1000,
  });
  return rows.map((r) => ({
    id: attachmentViewId(r.gmailMessageId, r.partId),
    messageId: r.gmailMessageId,
    threadId: r.message.gmailThreadId,
    filename: r.filename,
    mimeType: r.mimeType,
    size: r.size,
    kind: attachmentKind(r.mimeType, r.filename),
    date: r.message.internalDate.toISOString(),
    fromMe: r.message.isFromMe,
    senderName: r.message.isFromMe
      ? null
      : r.message.fromName ?? (r.message.fromEmail ? displayName({ email: r.message.fromEmail }) : null),
    ...attachmentUrls(r.gmailMessageId, attachmentRef(r.gmailAttachmentId, r.partId), r.mimeType),
  }));
}

function findPart(part: GmailMessagePart | undefined, partId: string): GmailMessagePart | null {
  if (!part) return null;
  if (part.partId === partId) return part;
  for (const c of part.parts ?? []) {
    const f = findPart(c, partId);
    if (f) return f;
  }
  return null;
}

export interface AttachmentBytes {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

/**
 * Fetch attachment bytes. The message must belong to the account: we check our index first and,
 * if the message is not indexed yet, fetch it with the account's own Gmail credentials (which can
 * only see that mailbox). Gmail attachment ids are not stable across fetches, so a stale id falls
 * back to the part id.
 */
export async function fetchAttachment(
  account: Pick<MailAccount, "id">,
  gmail: GmailApi,
  gmailMessageId: string,
  ref: string,
): Promise<AttachmentBytes> {
  const meta = await db.attachmentMetadata.findFirst({
    where: ref.startsWith("part-")
      ? { accountId: account.id, gmailMessageId, partId: ref.slice(5) }
      : { accountId: account.id, gmailMessageId, gmailAttachmentId: ref },
  });

  if (meta?.gmailAttachmentId && !ref.startsWith("part-")) {
    try {
      const a = await gmail.getAttachment(gmailMessageId, meta.gmailAttachmentId);
      return { bytes: base64UrlToBytes(a.data), filename: meta.filename, mimeType: meta.mimeType };
    } catch (e) {
      if (!isGmailError(e, "not_found") && !isGmailError(e, "invalid")) throw e;
    }
  }

  // Slow path: re-read the message structure (also verifies existence/ownership).
  const msg = await gmail.getMessage(gmailMessageId, "full").catch((e) => {
    if (isGmailError(e, "not_found")) throw new ApiError("not_found", "Attachment not found");
    throw e;
  });
  const parsed = parseGmailMessage(msg);
  const partId = ref.startsWith("part-") ? ref.slice(5) : meta?.partId;
  const att = parsed.attachments.find((a) => (partId ? a.partId === partId : a.attachmentId === ref));
  if (!att) throw new ApiError("not_found", "Attachment not found");
  let data = att.data;
  if (!data && att.attachmentId) data = (await gmail.getAttachment(gmailMessageId, att.attachmentId)).data;
  if (!data) {
    const part = findPart(msg.payload ?? undefined, att.partId);
    data = part?.body?.data ?? null;
  }
  if (!data) throw new ApiError("not_found", "Attachment not found");
  return { bytes: base64UrlToBytes(data), filename: att.filename, mimeType: att.mimeType };
}
