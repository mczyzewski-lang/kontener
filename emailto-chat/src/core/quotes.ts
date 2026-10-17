/**
 * Split a plain-text e-mail into: new content · signature · quoted history.
 * Nothing is deleted — the UI collapses `signature` and `quotedText` by default.
 */

export interface SplitText {
  text: string;
  signature: string | null;
  quotedText: string | null;
}

/** Lines that introduce a quoted previous message, in the languages we see most. */
const ATTRIBUTION_PATTERNS: RegExp[] = [
  /^On .{4,200}(wrote|writes):\s*$/i, // Gmail / Apple Mail (EN)
  /^W dniu .{4,200}napisał(a|\(a\))?:\s*$/i, // PL
  /^(Dnia|Użytkownik) .{4,200}napisał(a|\(a\))?:\s*$/i,
  /^Am .{4,200}schrieb .{0,200}:\s*$/i, // DE
  /^Le .{4,200}a écrit\s*:\s*$/i, // FR
  /^El .{4,200}escribió:\s*$/i, // ES
  /^Il .{4,200}ha scritto:\s*$/i, // IT
  /^-{2,}\s*(Original Message|Oryginalna wiadomość|Ursprüngliche Nachricht|Forwarded message|Wiadomość przekazana dalej)\s*-{2,}\s*$/i,
  /^_{10,}\s*$/, // Outlook separator
  /^From:\s.+$/i, // Outlook header block (validated below)
  /^(Od|De|Von):\s.+$/i,
];

const SIGNATURE_PATTERNS: RegExp[] = [
  /^-- ?$/, // RFC 3676 signature delimiter
  /^(Sent from|Wysłane z|Wysłano z|Gesendet von|Envoyé de) (my )?(iPhone|iPad|Android|Outlook|Samsung|mobile|Gmail|telefonu|urządzenia).*/i,
  /^Get Outlook for (iOS|Android).*/i,
];

/** Common sign-offs; a short block after them is treated as a signature. */
const SIGNOFF = /^(best( regards)?|kind regards|regards|cheers|thanks|thank you|many thanks|pozdrawiam( serdecznie)?|z poważaniem|serdecznie pozdrawiam|pozdrowienia|dzięki|dziękuję|mit freundlichen grüßen|viele grüße|cordialement|saludos)[,.!]?\s*$/i;

function isOutlookHeaderBlock(lines: string[], i: number): boolean {
  // "From: X" followed within 4 lines by "Sent:"/"Date:"/"To:"/"Subject:" (any language variants we know)
  const window = lines.slice(i + 1, i + 5).join("\n");
  return /^(Sent|Date|To|Subject|Wysłano|Data|Do|Temat|Gesendet|An|Betreff|Envoyé|À|Objet):/im.test(window);
}

export function splitQuotedText(input: string): SplitText {
  const normalized = input.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  // 1. Find where the quoted history starts.
  let quoteStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const matched = ATTRIBUTION_PATTERNS.some((re) => re.test(line));
    if (matched) {
      if (/^(From|Od|De|Von):/i.test(line) && !isOutlookHeaderBlock(lines, i)) continue;
      quoteStart = i;
      break;
    }
    // Gmail sometimes wraps the attribution line over two lines: "On Mon, ... <a@b.com>" + "wrote:"
    if (/^(On|W dniu) .{4,200}$/i.test(line) && /^.{0,80}(wrote|napisał(a|\(a\))?):\s*$/i.test((lines[i + 1] ?? "").trim())) {
      quoteStart = i;
      break;
    }
    // A run of ">" lines that continues to the end (allowing blank lines) is a trailing quote.
    if (line.startsWith(">")) {
      const rest = lines.slice(i);
      if (rest.every((l) => !l.trim() || l.trim().startsWith(">"))) {
        quoteStart = i;
        break;
      }
    }
  }

  const bodyLines = quoteStart >= 0 ? lines.slice(0, quoteStart) : lines;
  const quoted = quoteStart >= 0 ? lines.slice(quoteStart).join("\n").trim() : "";

  // 2. Find the signature inside the body.
  let sigStart = -1;
  for (let i = 0; i < bodyLines.length; i++) {
    const raw = bodyLines[i];
    if (SIGNATURE_PATTERNS.some((re) => re.test(raw.trimEnd()))) {
      sigStart = i;
      break;
    }
  }
  if (sigStart < 0) {
    // Sign-off line followed by ≤ 6 short lines (name, title, phone…) at the end.
    for (let i = Math.max(0, bodyLines.length - 9); i < bodyLines.length; i++) {
      if (SIGNOFF.test(bodyLines[i].trim())) {
        const after = bodyLines.slice(i + 1).filter((l) => l.trim());
        if (after.length >= 2 && after.length <= 6 && after.every((l) => l.trim().length <= 60)) {
          sigStart = i + 2; // keep the sign-off and the name visible, collapse the rest
          // If only the name follows, nothing to collapse.
          if (sigStart >= bodyLines.length) sigStart = -1;
        }
        break;
      }
    }
  }

  const main = (sigStart >= 0 ? bodyLines.slice(0, sigStart) : bodyLines).join("\n");
  const signature = sigStart >= 0 ? bodyLines.slice(sigStart).join("\n").trim() : "";

  const text = main.replace(/\n{3,}/g, "\n\n").trim();
  // Never return an empty main body: if everything looked like a quote, show it.
  if (!text && (quoted || signature)) {
    return { text: normalized.trim(), signature: null, quotedText: null };
  }
  return { text, signature: signature || null, quotedText: quoted || null };
}

/** Convert simple HTML to readable plain text (used when a message has no text/plain part). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|h[1-6]|tr|li|blockquote|table|ul|ol)>/gi, "\n")
      .replace(/<(p|div|h[1-6]|tr|blockquote|table|ul|ol)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", euro: "€", zwnj: "", zwj: "" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try {
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      } catch {
        return m;
      }
    }
    return named[code.toLowerCase()] ?? m;
  });
}
