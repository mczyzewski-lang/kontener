import type { Address } from "./types";

/** Lower-case and trim. Gmail addresses are case-insensitive in practice. */
export function normalizeEmail(email: string): string {
  return email.trim().replace(/^<|>$/g, "").toLowerCase();
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Decode RFC 2047 encoded-words (=?UTF-8?B?...?= / =?UTF-8?Q?...?=). */
export function decodeEncodedWords(input: string): string {
  return input
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, data: string) => {
      try {
        let bytes: Uint8Array;
        if (enc.toUpperCase() === "B") {
          bytes = base64ToBytes(data);
        } else {
          const s = data.replace(/_/g, " ");
          const out: number[] = [];
          for (let i = 0; i < s.length; i++) {
            if (s[i] === "=" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
              out.push(parseInt(s.slice(i + 1, i + 3), 16));
              i += 2;
            } else out.push(s.charCodeAt(i));
          }
          bytes = new Uint8Array(out);
        }
        return new TextDecoder(charset.toLowerCase() === "utf8" ? "utf-8" : charset).decode(bytes);
      } catch {
        return data;
      }
    });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Split an address-list header on commas that are not inside quotes or angle brackets. */
function splitAddressList(header: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuote = false;
  let inAngle = false;
  let depth = 0;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i];
    if (ch === "\\" && inQuote) {
      cur += ch + (header[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === "<") inAngle = true;
    else if (!inQuote && ch === ">") inAngle = false;
    else if (!inQuote && ch === "(") depth++;
    else if (!inQuote && ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && !inQuote && !inAngle && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Parse a single mailbox: `"Anna K" <anna@x.com>`, `anna@x.com (Anna)`, `anna@x.com`. */
export function parseAddress(raw: string): Address | null {
  const s = decodeEncodedWords(raw.trim());
  if (!s) return null;
  const angle = s.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (angle) {
    const name = cleanName(angle[1]);
    return { email: normalizeEmail(angle[2]), name: name || null };
  }
  const comment = s.match(/^([^\s()]+@[^\s()]+)\s*\((.*)\)\s*$/);
  if (comment) return { email: normalizeEmail(comment[1]), name: cleanName(comment[2]) || null };
  const bare = s.match(/[^\s<>"]+@[^\s<>"]+/);
  if (bare) return { email: normalizeEmail(bare[0]), name: null };
  return null;
}

function cleanName(name: string): string {
  let n = name.trim();
  if (n.startsWith('"') && n.endsWith('"') && n.length >= 2) n = n.slice(1, -1);
  n = n.replace(/\\(.)/g, "$1").trim();
  // A display name that is just the address again carries no information.
  if (/^[^\s@]+@[^\s@]+$/.test(n)) return "";
  return n;
}

/** Parse an address-list header (To, Cc, Bcc, Reply-To). Group syntax `undisclosed-recipients:;` → []. */
export function parseAddressList(header: string | null | undefined): Address[] {
  if (!header) return [];
  const cleaned = header.replace(/[^,;:]*:\s*;/g, "");
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const part of splitAddressList(cleaned)) {
    // Strip group label "Team: a@x, b@x;"
    const p = part.includes(":") && !part.includes("<") && !/@.*:/.test(part) ? part.split(":").pop()! : part;
    const a = parseAddress(p);
    if (a && !seen.has(a.email)) {
      seen.add(a.email);
      out.push(a);
    }
  }
  return out;
}

function quoteName(name: string): string {
  return /[",.;:<>()[\]@\\]/.test(name) ? `"${name.replace(/(["\\])/g, "\\$1")}"` : name;
}

/** Format for display or headers (non-encoded). */
export function formatAddress(a: Address): string {
  return a.name ? `${quoteName(a.name)} <${a.email}>` : a.email;
}

/** Human name fallback: "anna.kowalska@x.com" → "Anna Kowalska". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local
    .replace(/\+.*$/, "")
    .split(/[._-]+/)
    .filter(Boolean);
  if (!words.length) return email;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function displayName(a: Pick<Address, "email" | "name"> | null | undefined): string {
  if (!a) return "Unknown";
  return a.name?.trim() || nameFromEmail(a.email);
}

export function firstName(a: Pick<Address, "email" | "name">): string {
  const n = displayName(a);
  return n.split(/\s+/)[0] ?? n;
}

export function initials(nameOrEmail: string): string {
  const s = nameOrEmail.includes("@") ? nameFromEmail(nameOrEmail) : nameOrEmail;
  const words = s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Remove duplicates (by normalized e-mail), keeping the first occurrence. */
export function dedupeAddresses(list: Address[], exclude: Iterable<string> = []): Address[] {
  const seen = new Set<string>([...exclude].map(normalizeEmail));
  const out: Address[] = [];
  for (const a of list) {
    const e = normalizeEmail(a.email);
    if (seen.has(e)) continue;
    seen.add(e);
    out.push({ ...a, email: e });
  }
  return out;
}

/** Deterministic, runtime-independent hash (two FNV-1a 32-bit lanes → 16 hex chars). */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
