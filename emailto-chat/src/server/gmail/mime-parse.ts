/**
 * Parse a Gmail `format=full` message payload into headers, the best text/plain and text/html
 * bodies, attachments and inline (cid:) images.
 *
 * Handles nested multipart/alternative, /related, /mixed and forwarded message/rfc822 parts.
 * Bodies are decoded from base64url and from their declared charset with TextDecoder.
 */
import { decodeEncodedWords, parseAddress, parseAddressList } from "@/core/addresses";
import { decodeEntities } from "@/core/quotes";
import type { Address } from "@/core/types";
import type { GmailMessage, GmailMessagePart } from "./types";

export interface ParsedAttachment {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
  /** base64url data when Gmail inlined the body (small parts without attachmentId). */
  data: string | null;
  /** Content-ID without angle brackets. */
  contentId: string | null;
  isInline: boolean;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: number;
  historyId: string | null;
  headers: Map<string, string[]>;
  subject: string;
  from: Address | null;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address[];
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  text: string | null;
  html: string | null;
  attachments: ParsedAttachment[];
}

type Headers = Array<{ name?: string | null; value?: string | null }> | undefined | null;

export function headerMap(headers: Headers): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const h of headers ?? []) {
    if (!h.name) continue;
    const k = h.name.toLowerCase();
    const list = map.get(k) ?? [];
    list.push(h.value ?? "");
    map.set(k, list);
  }
  return map;
}

export function header(map: Map<string, string[]>, name: string): string | null {
  return map.get(name.toLowerCase())?.[0] ?? null;
}

export function base64UrlToBytes(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, "base64url"));
}

function charsetOf(contentType: string | null): string {
  const m = contentType?.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return (m?.[1] ?? "utf-8").toLowerCase();
}

export function decodeText(data: string, charset: string): string {
  const bytes = base64UrlToBytes(data);
  const cs = charset === "utf8" ? "utf-8" : charset === "ascii" || charset === "us-ascii" ? "utf-8" : charset;
  try {
    return new TextDecoder(cs).decode(bytes);
  } catch {
    // Unknown charset label → assume UTF-8 (lossy but never throws).
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function dispositionOf(h: Map<string, string[]>): "attachment" | "inline" | null {
  const d = header(h, "content-disposition")?.trim().toLowerCase() ?? "";
  if (d.startsWith("attachment")) return "attachment";
  if (d.startsWith("inline")) return "inline";
  return null;
}

function cleanId(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^<|>$/g, "").trim();
  return s || null;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "message/rfc822": "eml",
  "text/calendar": "ics",
};

interface Extracted {
  text: string[];
  html: string[];
}

class Walker {
  attachments: ParsedAttachment[] = [];

  walk(part: GmailMessagePart, depth = 0): Extracted {
    const empty: Extracted = { text: [], html: [] };
    if (depth > 30) return empty;
    const h = headerMap(part.headers);
    const mime = (part.mimeType ?? header(h, "content-type")?.split(";")[0] ?? "text/plain").toLowerCase().trim();
    const filename = decodeEncodedWords(part.filename ?? "").trim();
    const disposition = dispositionOf(h);
    const children = part.parts ?? [];

    if (mime.startsWith("multipart/")) {
      const results = children.map((c) => this.walk(c, depth + 1));
      if (mime === "multipart/alternative") {
        // Pick the best of each representation (plain usually first, html usually last).
        const text = results.find((r) => r.text.length)?.text ?? [];
        const html = [...results].reverse().find((r) => r.html.length)?.html ?? [];
        return { text, html };
      }
      return { text: results.flatMap((r) => r.text), html: results.flatMap((r) => r.html) };
    }

    if (mime === "message/rfc822" && children.length) {
      // Forwarded message with a parsed structure: render it inline after a header block.
      const inner = children.map((c) => this.walk(c, depth + 1));
      const ih = headerMap(children[0]?.headers ?? part.headers);
      const intro = forwardedIntro(ih);
      const text = inner.flatMap((r) => r.text);
      const html = inner.flatMap((r) => r.html);
      return {
        text: text.length ? [intro.text + "\n" + text.join("\n")] : intro.text ? [intro.text] : [],
        html: html.length ? [intro.html + html.join("\n")] : [],
      };
    }

    const isTextBody =
      (mime === "text/plain" || mime === "text/html") && !filename && disposition !== "attachment";
    if (isTextBody) {
      const data = part.body?.data;
      if (!data) return empty;
      const decoded = decodeText(data, charsetOf(header(h, "content-type")));
      return mime === "text/plain" ? { text: [decoded], html: [] } : { text: [], html: [decoded] };
    }

    // Everything else with content is an attachment (or an inline image).
    const attachmentId = part.body?.attachmentId ?? null;
    const data = attachmentId ? null : part.body?.data ?? null;
    if (!attachmentId && !data) return empty;
    const contentId = cleanId(header(h, "content-id"));
    const isInline = disposition !== "attachment" && (disposition === "inline" || !!contentId) && mime.startsWith("image/");
    this.attachments.push({
      partId: part.partId || String(this.attachments.length),
      filename: filename || `attachment${this.attachments.length + 1}.${EXT_BY_TYPE[mime] ?? "bin"}`,
      mimeType: mime,
      size: part.body?.size ?? 0,
      attachmentId,
      data,
      contentId,
      isInline,
    });
    return empty;
  }
}

function forwardedIntro(h: Map<string, string[]>): { text: string; html: string } {
  const lines: Array<[string, string | null]> = [
    ["From", header(h, "from")],
    ["Date", header(h, "date")],
    ["Subject", header(h, "subject")],
    ["To", header(h, "to")],
  ];
  const present = lines.filter(([, v]) => v);
  if (!present.length) return { text: "", html: "" };
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = ["---------- Forwarded message ---------", ...present.map(([k, v]) => `${k}: ${decodeEncodedWords(v!)}`)].join("\n");
  const html =
    `<div>---------- Forwarded message ---------<br>` +
    present.map(([k, v]) => `${k}: ${esc(decodeEncodedWords(v!))}<br>`).join("") +
    `</div><br>`;
  return { text, html };
}

/** Parse a Gmail message (format=full or metadata). */
export function parseGmailMessage(msg: GmailMessage): ParsedMessage {
  const payload = msg.payload ?? {};
  const h = headerMap(payload.headers);
  const walker = new Walker();
  const extracted = msg.payload ? walker.walk(payload) : { text: [], html: [] };
  const text = extracted.text.length ? extracted.text.join("\n\n") : null;
  const html = extracted.html.length ? extracted.html.join("\n<hr>\n") : null;
  const internal = Number(msg.internalDate ?? 0);
  const dateHeader = header(h, "date");
  const fallbackDate = dateHeader ? Date.parse(dateHeader) : NaN;
  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    labelIds: msg.labelIds ?? [],
    snippet: decodeEntities(msg.snippet ?? ""),
    internalDate: internal || (Number.isFinite(fallbackDate) ? fallbackDate : 0),
    historyId: msg.historyId ?? null,
    headers: h,
    subject: decodeEncodedWords(header(h, "subject") ?? "").trim(),
    from: parseAddress(header(h, "from") ?? "") ?? null,
    to: parseAddressList(allValues(h, "to")),
    cc: parseAddressList(allValues(h, "cc")),
    bcc: parseAddressList(allValues(h, "bcc")),
    replyTo: parseAddressList(allValues(h, "reply-to")),
    rfcMessageId: normalizeMessageId(header(h, "message-id")),
    inReplyTo: normalizeMessageId(header(h, "in-reply-to")),
    references: header(h, "references")?.replace(/\s+/g, " ").trim() || null,
    text,
    html,
    attachments: walker.attachments,
  };
}

function allValues(h: Map<string, string[]>, name: string): string | null {
  const v = h.get(name);
  return v?.length ? v.join(", ") : null;
}

function normalizeMessageId(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/<[^<>\s]+>/);
  if (m) return m[0];
  const s = v.trim();
  return s ? `<${s.replace(/[<>\s]/g, "")}>` : null;
}

/** Attachments that are real files (not inline cid: images such as signature logos). */
export function visibleAttachments(atts: ParsedAttachment[]): ParsedAttachment[] {
  return atts.filter((a) => !(a.isInline && a.contentId));
}
