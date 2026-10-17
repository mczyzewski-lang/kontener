/** Shared compose helpers for send + drafts: reply context and MIME building. */
import type { MailAccount, User } from "@prisma/client";
import { normalizeEmail } from "@/core/addresses";
import { buildMimeMessage, formatTextToHtml, formatTextToPlain, replyHeaders, type MimeAttachment } from "@/core/mime";
import type { Address } from "@/core/types";
import { myAddresses } from "../auth/account";
import { ApiError } from "../errors";
import { isGmailError } from "../gmail/errors";
import { header, headerMap } from "../gmail/mime-parse";
import type { GmailApi } from "../gmail/types";
import { base64UrlEncode } from "@/core/mime";

export interface ReplyInfo {
  threadId: string;
  inReplyTo: string | null;
  references: string | null;
  subject: string;
}

/** Load the replied-to message's headers from Gmail and derive In-Reply-To / References / Subject. */
export async function loadReplyContext(
  gmail: GmailApi,
  messageId: string | null | undefined,
  threadId: string | null | undefined,
): Promise<ReplyInfo> {
  let target = messageId ?? null;
  if (!target) {
    if (!threadId) throw new ApiError("invalid", "Reply needs threadId or inReplyToMessageId");
    const t = await gmail.getThread(threadId).catch((e) => {
      if (isGmailError(e, "not_found")) throw new ApiError("not_found", "Thread not found");
      throw e;
    });
    const msgs = (t.messages ?? []).filter((m) => m.id && !(m.labelIds ?? []).includes("DRAFT"));
    msgs.sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));
    target = msgs[msgs.length - 1]?.id ?? null;
    if (!target) throw new ApiError("not_found", "Thread has no messages");
  }
  const msg = await gmail.getMessage(target, "metadata", ["Message-ID", "References", "Subject", "In-Reply-To"]).catch((e) => {
    if (isGmailError(e, "not_found")) throw new ApiError("not_found", "Replied message not found");
    throw e;
  });
  if (threadId && msg.threadId && msg.threadId !== threadId) throw new ApiError("invalid", "Message is not in that thread");
  const h = headerMap(msg.payload?.headers);
  const rawId = header(h, "message-id");
  const id = rawId?.match(/<[^<>\s]+>/)?.[0] ?? null;
  const r = replyHeaders({ messageId: id, references: header(h, "references"), subject: header(h, "subject") ?? "" });
  return { threadId: msg.threadId ?? threadId!, inReplyTo: r.inReplyTo, references: r.references, subject: r.subject };
}

export function resolveFrom(account: MailAccount, user: Pick<User, "name">, from?: string | null): Address {
  const mine = myAddresses(account);
  const email = from ? normalizeEmail(from) : normalizeEmail(account.emailAddress);
  if (!mine.includes(email)) throw new ApiError("invalid", "From address is not one of your Gmail addresses");
  return { email, name: user.name ?? null };
}

export interface ComposeParts {
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  text: string;
  attachments?: MimeAttachment[];
  inReplyTo?: string | null;
  references?: string | null;
  messageId?: string | null;
  /** Extra headers (ASCII, validated by caller), e.g. our idempotency marker. */
  extraHeaders?: Record<string, string>;
}

export function buildRaw(p: ComposeParts): string {
  let mime = buildMimeMessage({
    from: p.from,
    to: p.to,
    cc: p.cc,
    bcc: p.bcc,
    subject: p.subject,
    text: formatTextToPlain(p.text),
    html: p.text.trim() ? formatTextToHtml(p.text) : null,
    attachments: p.attachments,
    inReplyTo: p.inReplyTo,
    references: p.references,
    messageId: p.messageId,
  });
  const extra = Object.entries(p.extraHeaders ?? {})
    .filter(([k, v]) => /^X-[A-Za-z0-9-]+$/.test(k) && /^[\x20-\x7e]*$/.test(v))
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join("");
  if (extra) mime = extra + mime;
  return base64UrlEncode(new TextEncoder().encode(mime));
}
