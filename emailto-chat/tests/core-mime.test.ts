import { describe, expect, it } from "vitest";
import { decodeEncodedWords } from "@/core/addresses";
import { buildMimeMessage, replyHeaders, replyRecipients } from "@/core/mime";

const header = (raw: string, name: string) => {
  const head = raw.split("\r\n\r\n")[0].replace(/\r\n\s+/g, " ");
  return head.split("\r\n").find((l) => l.toLowerCase().startsWith(name.toLowerCase() + ":"))?.slice(name.length + 1).trim() ?? null;
};
const decodeB64Header = (v: string) => decodeEncodedWords(v);

describe("buildMimeMessage", () => {
  it("builds headers with RFC 2047 encoding and no header injection", () => {
    const raw = buildMimeMessage({
      from: { email: "me@example.com", name: "Michał Czyżewski" },
      to: [{ email: "anna@example.com", name: "Anna, K." }],
      cc: [{ email: "bob@example.com" }],
      bcc: [{ email: "hidden@example.com" }],
      subject: "Zażółć gęślą jaźń\r\nBcc: injected@example.com",
      text: "Hello",
      messageId: "<k1@emailto.chat>",
      inReplyTo: "<orig@x>",
      references: "<a@x> <orig@x>",
      date: new Date("2026-01-01T10:00:00Z"),
    });
    expect(/^[\x00-\x7f]*$/.test(raw)).toBe(true);
    expect(decodeB64Header(header(raw, "From")!)).toBe("Michał Czyżewski <me@example.com>");
    expect(header(raw, "To")).toBe('"Anna, K." <anna@example.com>');
    expect(header(raw, "Cc")).toBe("bob@example.com");
    expect(header(raw, "Bcc")).toBe("hidden@example.com");
    expect(decodeB64Header(header(raw, "Subject")!)).toBe("Zażółć gęślą jaźń Bcc: injected@example.com");
    expect(raw.match(/^Bcc:/gm)).toHaveLength(1);
    expect(header(raw, "Message-ID")).toBe("<k1@emailto.chat>");
    expect(header(raw, "In-Reply-To")).toBe("<orig@x>");
    expect(header(raw, "References")).toBe("<a@x> <orig@x>");
    expect(header(raw, "Date")).toBe("Thu, 01 Jan 2026 10:00:00 +0000");
    expect(header(raw, "MIME-Version")).toBe("1.0");
  });

  it("multipart/alternative for text+html, base64 bodies with CRLF", () => {
    const raw = buildMimeMessage({ from: { email: "me@x.com" }, to: [{ email: "a@x.com" }], subject: "S", text: "Line 1\nŁine 2", html: "<b>hi</b>" });
    const boundary = raw.match(/boundary="([^"]+)"/)![1];
    expect(header(raw, "Content-Type")).toBe(`multipart/alternative; boundary="${boundary}"`);
    const parts = raw.split(`--${boundary}`);
    expect(parts).toHaveLength(4);
    const plain = parts[1].split("\r\n\r\n")[1].trim();
    expect(Buffer.from(plain.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Line 1\r\nŁine 2");
    expect(parts[2]).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it("multipart/mixed with attachments, unicode filenames, 76-col base64", () => {
    const data = new Uint8Array(200).map((_, i) => i);
    const raw = buildMimeMessage({
      from: { email: "me@x.com" },
      to: [{ email: "a@x.com" }],
      subject: "files",
      text: "see",
      attachments: [
        { filename: "raport.pdf", mimeType: "application/pdf", data },
        { filename: "zdjęcie.jpg", mimeType: "image/jpeg", data: new Uint8Array([1, 2, 3]) },
        { filename: "x.bin", mimeType: "bad type\r\nX: y", data: new Uint8Array([0]) },
      ],
    });
    expect(header(raw, "Content-Type")).toMatch(/^multipart\/mixed; boundary=/);
    expect(raw).toContain('Content-Disposition: attachment; filename="raport.pdf"');
    expect(raw).toContain("filename*=UTF-8''zdj%C4%99cie.jpg");
    expect(raw).toContain("Content-Type: application/octet-stream; name=\"x.bin\"");
    const pdfBody = raw.split('filename="raport.pdf"')[1].split("\r\n\r\n")[1].split("\r\n--")[0];
    expect(pdfBody.split("\r\n").every((l) => l.length <= 76)).toBe(true);
    expect(new Uint8Array(Buffer.from(pdfBody.replace(/\r\n/g, ""), "base64"))).toEqual(data);
  });
});

describe("reply helpers", () => {
  it("replyHeaders appends the Message-ID and prefixes Re: once", () => {
    expect(replyHeaders({ messageId: "<b@x>", references: "<a@x>", subject: "Re: Plan" })).toEqual({
      inReplyTo: "<b@x>",
      references: "<a@x> <b@x>",
      subject: "Re: Plan",
    });
    expect(replyHeaders({ messageId: "<a@x>", references: null, subject: "Plan" }).subject).toBe("Re: Plan");
  });

  it("replyRecipients excludes my addresses", () => {
    const r = replyRecipients(
      {
        from: { email: "anna@x.com" },
        to: [{ email: "me@x.com" }, { email: "bob@x.com" }],
        cc: [{ email: "alias@x.com" }, { email: "cat@x.com" }],
        replyTo: [],
        fromMe: false,
      },
      new Set(["me@x.com", "alias@x.com"]),
      true,
    );
    expect(r.to.map((a) => a.email)).toEqual(["anna@x.com"]);
    expect(r.cc.map((a) => a.email)).toEqual(["bob@x.com", "cat@x.com"]);
  });
});
