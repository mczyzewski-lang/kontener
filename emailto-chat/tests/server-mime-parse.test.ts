import { describe, expect, it } from "vitest";
import { parseGmailMessage, visibleAttachments } from "@/server/gmail/mime-parse";
import type { GmailMessagePart } from "@/server/gmail/types";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const h = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }));
const text = (partId: string, s: string, type = "text/plain", charset = "UTF-8", data?: Buffer): GmailMessagePart => ({
  partId,
  mimeType: type,
  filename: "",
  headers: h({ "Content-Type": `${type}; charset="${charset}"` }),
  body: { data: data ? data.toString("base64url") : b64(s), size: s.length },
});

describe("Gmail payload parser", () => {
  it("parses headers, addresses and a simple text/plain body", () => {
    const p = parseGmailMessage({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "It&#39;s &amp; done",
      internalDate: "1767225600000",
      payload: {
        ...text("", "Hello\nWorld"),
        headers: h({
          From: '"Kowalska, Anna" <Anna@Example.com>',
          To: "me@example.com, Bob <bob@example.com>",
          Cc: "=?UTF-8?B?WmXFvGFr?= <zezak@example.com>",
          Subject: "=?UTF-8?Q?Za=C5=BC=C3=B3=C5=82=C4=87?=",
          "Message-ID": "<abc@mail>",
          References: "<r1@x>\r\n <r2@x>",
          "Content-Type": "text/plain; charset=UTF-8",
        }),
      },
    });
    expect(p.from).toEqual({ email: "anna@example.com", name: "Kowalska, Anna" });
    expect(p.to.map((a) => a.email)).toEqual(["me@example.com", "bob@example.com"]);
    expect(p.cc).toEqual([{ email: "zezak@example.com", name: "Zeżak" }]);
    expect(p.subject).toBe("Zażółć");
    expect(p.rfcMessageId).toBe("<abc@mail>");
    expect(p.references).toBe("<r1@x> <r2@x>");
    expect(p.snippet).toBe("It's & done");
    expect(p.text).toBe("Hello\nWorld");
    expect(p.html).toBeNull();
    expect(p.internalDate).toBe(1767225600000);
  });

  it("handles nested multipart/mixed > related > alternative, charsets, attachments and cid images", () => {
    const latin2 = Buffer.from([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6]); // "Zażółć" in ISO-8859-2
    const p = parseGmailMessage({
      id: "m2",
      threadId: "t2",
      payload: {
        partId: "",
        mimeType: "multipart/mixed",
        headers: h({ From: "a@example.com", Subject: "x" }),
        parts: [
          {
            partId: "0",
            mimeType: "multipart/related",
            parts: [
              {
                partId: "0.0",
                mimeType: "multipart/alternative",
                parts: [text("0.0.0", "", "text/plain", "iso-8859-2", latin2), text("0.0.1", "<p>Za<b>ż</b>ółć <img src='cid:img1'></p>", "text/html")],
              },
              {
                partId: "0.1",
                mimeType: "image/png",
                filename: "logo.png",
                headers: h({ "Content-ID": "<img1>", "Content-Disposition": "inline" }),
                body: { attachmentId: "ATT1", size: 120 },
              },
            ],
          },
          {
            partId: "1",
            mimeType: "application/pdf",
            filename: "=?UTF-8?B?ZmFrdHVyYS5wZGY=?=",
            headers: h({ "Content-Disposition": 'attachment; filename="faktura.pdf"' }),
            body: { attachmentId: "ATT2", size: 5000 },
          },
          {
            partId: "2",
            mimeType: "text/plain",
            filename: "notes.txt",
            headers: h({ "Content-Disposition": "attachment" }),
            body: { data: b64("not a body"), size: 10 },
          },
        ],
      },
    });
    expect(p.text).toBe("Zażółć");
    expect(p.html).toContain("Za<b>ż</b>ółć");
    expect(p.attachments.map((a) => [a.partId, a.filename, a.isInline, a.contentId, a.attachmentId])).toEqual([
      ["0.1", "logo.png", true, "img1", "ATT1"],
      ["1", "faktura.pdf", false, null, "ATT2"],
      ["2", "notes.txt", false, null, null],
    ]);
    expect(p.attachments[2].data).toBe(b64("not a body"));
    expect(visibleAttachments(p.attachments).map((a) => a.filename)).toEqual(["faktura.pdf", "notes.txt"]);
  });

  it("renders a forwarded message/rfc822 part inline with a header block", () => {
    const p = parseGmailMessage({
      id: "m3",
      threadId: "t3",
      payload: {
        partId: "",
        mimeType: "multipart/mixed",
        headers: h({ From: "a@example.com" }),
        parts: [
          text("0", "FYI below"),
          {
            partId: "1",
            mimeType: "message/rfc822",
            filename: "",
            parts: [
              {
                partId: "1.0",
                mimeType: "multipart/alternative",
                headers: h({ From: "Bob <bob@example.com>", Subject: "Original", Date: "Mon, 1 Jan 2026 10:00:00 +0000" }),
                parts: [text("1.0.0", "Original text"), text("1.0.1", "<p>Original text</p>", "text/html")],
              },
            ],
          },
        ],
      },
    });
    expect(p.text).toContain("FYI below");
    expect(p.text).toContain("---------- Forwarded message ---------\nFrom: Bob <bob@example.com>");
    expect(p.text).toContain("Original text");
    expect(p.html).toContain("Forwarded message");
    expect(p.attachments).toHaveLength(0);
  });

  it("html-only message, unknown charset falls back to UTF-8, missing payload is safe", () => {
    const p = parseGmailMessage({ id: "m4", threadId: "t4", payload: text("", "<p>Hi ✓</p>", "text/html", "x-unknown-charset") });
    expect(p.text).toBeNull();
    expect(p.html).toBe("<p>Hi ✓</p>");
    const empty = parseGmailMessage({ id: "m5", threadId: "t5" });
    expect(empty.text).toBeNull();
    expect(empty.attachments).toEqual([]);
  });
});
