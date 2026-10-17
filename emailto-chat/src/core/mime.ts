/**
 * RFC 5322 / MIME message construction for messages.send and drafts.
 * Runtime-independent (no Buffer) so it can be unit-tested and reused by native apps.
 */
import { formatAddress } from "./addresses";
import type { Address } from "./types";

export interface MimeAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface ReplyContext {
  /** Message-ID of the message being answered, with angle brackets. */
  messageId: string | null;
  /** Its References header. */
  references: string | null;
  subject: string;
}

export interface BuildMessageInput {
  from: Address;
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  subject: string;
  text: string;
  html?: string | null;
  attachments?: MimeAttachment[];
  inReplyTo?: string | null;
  references?: string | null;
  /** Our own Message-ID (lets us find the message again after an interrupted send). */
  messageId?: string | null;
  date?: Date;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + "==";
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=";
  }
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function wrap76(s: string): string {
  return s.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
}

/** RFC 2047 encode a header value when it contains non-ASCII characters. */
export function encodeHeaderValue(value: string): string {
  // Strip CR/LF — prevents header injection.
  const v = value.replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  // Split into chunks so encoded-words stay under ~75 chars.
  const chunks: string[] = [];
  let cur = "";
  for (const ch of v) {
    if (utf8(cur + ch).length > 42) {
      chunks.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => `=?UTF-8?B?${bytesToBase64(utf8(c))}?=`).join("\r\n ");
}

function encodeAddress(a: Address): string {
  const email = a.email.replace(/[\r\n<>]/g, "");
  if (!a.name) return email;
  const name = a.name.replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(name)) return formatAddress({ email, name });
  return `${encodeHeaderValue(name)} <${email}>`;
}

function encodeAddressList(list: Address[]): string {
  return list.map(encodeAddress).join(", ");
}

function encodeFilename(name: string): string {
  const safe = name.replace(/[\r\n"\\]/g, "_");
  if (/^[\x20-\x7e]*$/.test(safe)) return `filename="${safe}"`;
  return `filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function boundary(): string {
  const rnd = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  return `=_etc_${rnd}`;
}

function textPart(text: string, subtype: "plain" | "html"): string {
  return [
    `Content-Type: text/${subtype}; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(bytesToBase64(utf8(text.replace(/\r?\n/g, "\r\n")))),
  ].join("\r\n");
}

/** Build a full RFC 822 message. Returns the raw string (ASCII only — safe to base64url). */
export function buildMimeMessage(input: BuildMessageInput): string {
  const headers: string[] = [];
  headers.push(`From: ${encodeAddress(input.from)}`);
  if (input.to.length) headers.push(`To: ${encodeAddressList(input.to)}`);
  if (input.cc?.length) headers.push(`Cc: ${encodeAddressList(input.cc)}`);
  // Gmail removes the Bcc header from the delivered copies but uses it for delivery.
  if (input.bcc?.length) headers.push(`Bcc: ${encodeAddressList(input.bcc)}`);
  headers.push(`Subject: ${encodeHeaderValue(input.subject)}`);
  headers.push(`Date: ${(input.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`);
  if (input.messageId) headers.push(`Message-ID: ${sanitizeId(input.messageId)}`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${sanitizeId(input.inReplyTo)}`);
  if (input.references) headers.push(`References: ${input.references.replace(/[\r\n]+/g, " ").trim()}`);
  headers.push("MIME-Version: 1.0");

  const alt = input.html
    ? (() => {
        const b = boundary();
        return {
          type: `multipart/alternative; boundary="${b}"`,
          body: [`--${b}`, textPart(input.text, "plain"), `--${b}`, textPart(input.html!, "html"), `--${b}--`].join("\r\n"),
        };
      })()
    : null;

  const attachments = input.attachments ?? [];
  if (!attachments.length) {
    if (alt) return [...headers, `Content-Type: ${alt.type}`, "", alt.body].join("\r\n");
    return [...headers, textPart(input.text, "plain")].join("\r\n");
  }

  const b = boundary();
  const parts: string[] = [];
  parts.push(`--${b}`);
  parts.push(alt ? `Content-Type: ${alt.type}\r\n\r\n${alt.body}` : textPart(input.text, "plain"));
  for (const a of attachments) {
    parts.push(`--${b}`);
    const type = /^[\w.+-]+\/[\w.+-]+$/.test(a.mimeType) ? a.mimeType : "application/octet-stream";
    parts.push(
      [
        `Content-Type: ${type}; name="${a.filename.replace(/[\r\n"\\]/g, "_")}"`,
        `Content-Disposition: attachment; ${encodeFilename(a.filename)}`,
        "Content-Transfer-Encoding: base64",
        "",
        wrap76(bytesToBase64(a.data)),
      ].join("\r\n"),
    );
  }
  parts.push(`--${b}--`);
  return [...headers, `Content-Type: multipart/mixed; boundary="${b}"`, "", parts.join("\r\n")].join("\r\n");
}

function sanitizeId(id: string): string {
  const v = id.replace(/[\r\n\s]+/g, "");
  return v.startsWith("<") ? v : `<${v}>`;
}

/** Subject for a reply: keeps the original subject, adds a single "Re: ". */
export function replySubject(subject: string): string {
  const s = subject.trim();
  return /^re\s*:/i.test(s) ? s : `Re: ${s || "(no subject)"}`;
}

export function forwardSubject(subject: string): string {
  const s = subject.trim();
  return /^(fwd?|fw)\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

/** In-Reply-To / References for a reply, per RFC 5322 §3.6.4. */
export function replyHeaders(ctx: ReplyContext): { inReplyTo: string | null; references: string | null; subject: string } {
  const refs = (ctx.references ?? "").split(/\s+/).filter(Boolean);
  if (ctx.messageId && !refs.includes(ctx.messageId)) refs.push(ctx.messageId);
  // Keep the header bounded: first reference + the most recent ones.
  const bounded = refs.length > 20 ? [refs[0], ...refs.slice(-19)] : refs;
  return {
    inReplyTo: ctx.messageId,
    references: bounded.length ? bounded.join(" ") : null,
    subject: replySubject(ctx.subject),
  };
}

/** Recipients for Reply / Reply all, excluding my own addresses. */
export function replyRecipients(
  original: { from: Address; to: Address[]; cc: Address[]; replyTo: Address[]; fromMe: boolean },
  myAddresses: Set<string>,
  all: boolean,
): { to: Address[]; cc: Address[] } {
  const mine = (a: Address) => myAddresses.has(a.email.toLowerCase());
  const uniq = (list: Address[], exclude: Set<string>) => {
    const out: Address[] = [];
    for (const a of list) {
      const e = a.email.toLowerCase();
      if (exclude.has(e) || mine(a)) continue;
      exclude.add(e);
      out.push(a);
    }
    return out;
  };
  // Replying to my own message → continue to its original recipients.
  const primary = original.fromMe ? original.to : original.replyTo.length ? original.replyTo : [original.from];
  const seen = new Set<string>();
  const to = uniq(primary, seen);
  if (!all) return { to: to.length ? to : uniq(original.to, new Set()), cc: [] };
  const extraTo = original.fromMe ? [] : original.to;
  const cc = uniq([...extraTo, ...original.cc], seen);
  return { to, cc };
}

/** Minimal "Markdown-ish" formatting → HTML for the composer's basic formatting buttons. */
export function formatTextToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>")
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>');
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  for (const line of lines) {
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const kind = ul ? "ul" : ol ? "ol" : null;
    if (kind !== list) {
      if (list) out.push(`</${list}>`);
      if (kind) out.push(`<${kind}>`);
      list = kind;
    }
    if (kind) out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    else out.push(line.trim() ? `${inline(line)}<br>` : "<br>");
  }
  if (list) out.push(`</${list}>`);
  return `<div dir="auto" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${out.join("\n")}</div>`;
}

/** Plain-text version: strip our lightweight markers. */
export function formatTextToPlain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[\s(])_(.+?)_(?=[\s).,!?]|$)/g, "$1$2");
}
