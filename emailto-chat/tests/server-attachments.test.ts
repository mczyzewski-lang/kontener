import "./helpers/env";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listRoute } from "@/app/api/attachments/route";
import { GET as downloadRoute } from "@/app/api/attachments/[messageId]/[attachmentId]/route";
import { db } from "@/server/db";
import { buildAttachmentHeaders, contentDisposition, listAttachments } from "@/server/domain/attachments";
import { getThreadDetail } from "@/server/domain/thread-detail";
import { setGmailFactory } from "@/server/gmail/factory";
import { resetRateLimits } from "@/server/security/rate-limit";
import { runSync } from "@/server/sync/engine";
import { resetDb, setupTestDb } from "./helpers/db";
import { apiRequest, createTestAccount, ME, routeCtx } from "./helpers/fixtures";

const dbState = await setupTestDb();

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

describe("attachment headers (pure)", () => {
  it("PDF preview is inline with the real type; download forces attachment", () => {
    const h = buildAttachmentHeaders({ filename: "Umowa łączna.pdf", mimeType: "application/pdf", size: 10, download: false });
    expect(h.get("content-type")).toBe("application/pdf");
    expect(h.get("content-disposition")).toBe(`inline; filename="Umowa __czna.pdf"; filename*=UTF-8''Umowa%20%C5%82%C4%85czna.pdf`);
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(h.get("cache-control")).toBe("private, max-age=300");
    expect(h.get("content-length")).toBe("10");
    const d = buildAttachmentHeaders({ filename: "a.pdf", mimeType: "application/pdf", download: true });
    expect(d.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("dangerous types (HTML, SVG, XML, JS) are always octet-stream + attachment", () => {
    for (const mimeType of ["text/html", "image/svg+xml", "application/xml", "application/javascript", "text/plain"]) {
      const h = buildAttachmentHeaders({ filename: "x", mimeType, download: false });
      expect(h.get("content-type")).toBe("application/octet-stream");
      expect(h.get("content-disposition")).toMatch(/^attachment;/);
    }
  });

  it("Content-Disposition strips header-injection characters", () => {
    const v = contentDisposition("attachment", 'evil"\r\nSet-Cookie: x=1;.txt');
    expect(v).not.toMatch(/[\r\n]/);
    expect(v).toMatch(/^attachment; filename="evil_Set-Cookie: x=1_\.txt"; filename\*=UTF-8''/);
  });
});

describe.skipIf(!dbState.ok)("attachments (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    resetRateLimits();
  });
  afterAll(() => setGmailFactory(null));

  it("9. multiple attachments → metadata indexed, listed per thread/person, downloadable with safe headers", async () => {
    const { account, gmail, token } = await createTestAccount();
    const m1 = gmail.addMessage({
      from: "Anna <anna@example.com>",
      to: [ME],
      subject: "Docs",
      html: '<p>See <img src="cid:logo123"></p>',
      text: "See attached",
      attachments: [
        { filename: "contract.pdf", mimeType: "application/pdf", data: bytes(1000) },
        { filename: "photo.jpg", mimeType: "image/jpeg", data: bytes(2000) },
        { filename: "page.html", mimeType: "text/html", data: new TextEncoder().encode("<script>alert(1)</script>") },
        { filename: "logo.png", mimeType: "image/png", data: bytes(50), contentId: "logo123", inline: true },
      ],
    });
    const m2 = gmail.addMessage({
      from: "Anna <anna@example.com>",
      to: [ME],
      subject: "More",
      attachments: [{ filename: "sheet.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: bytes(300) }],
    });
    await runSync(account.id, { gmail });

    expect(await db.attachmentMetadata.count()).toBe(5);
    const thread = await db.emailThread.findFirstOrThrow({ where: { gmailThreadId: m1.threadId } });
    expect(thread.hasAttachments).toBe(true);

    const inThread = await listAttachments(account.id, { kind: "thread", threadId: m1.threadId });
    expect(inThread.map((a) => a.filename).sort()).toEqual(["contract.pdf", "page.html", "photo.jpg"]); // inline logo excluded
    const pdf = inThread.find((a) => a.filename === "contract.pdf")!;
    expect(pdf).toMatchObject({ kind: "document", size: 1000, messageId: m1.id, threadId: m1.threadId, fromMe: false, senderName: "Anna" });
    expect(pdf.downloadUrl).toBe(`/api/attachments/${m1.id}/att_${m1.id}_1?download=1`);
    expect(pdf.previewUrl).toBe(`/api/attachments/${m1.id}/att_${m1.id}_1`);
    expect(inThread.find((a) => a.filename === "page.html")!.previewUrl).toBeNull();

    const contact = await db.contact.findFirstOrThrow({ where: { email: "anna@example.com" } });
    const res = await listRoute(apiRequest(`/api/attachments?scope=person&id=${contact.id}`, { token }));
    const forPerson = await res.json();
    expect(forPerson).toHaveLength(4);
    expect(forPerson[0].messageId).toBe(m2.id); // newest first

    // Download: bytes + headers.
    const dl = await downloadRoute(
      apiRequest(pdf.downloadUrl, { token }),
      routeCtx({ messageId: m1.id, attachmentId: `att_${m1.id}_1` }),
    );
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment; filename="contract.pdf"/);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(bytes(1000));

    const html = await downloadRoute(
      apiRequest(`/api/attachments/${m1.id}/att_${m1.id}_3`, { token }),
      routeCtx({ messageId: m1.id, attachmentId: `att_${m1.id}_3` }),
    );
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(html.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(html.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");

    // Stale Gmail attachment id → falls back to the part id and still works.
    const meta = await db.attachmentMetadata.findFirstOrThrow({ where: { filename: "photo.jpg" } });
    gmail.messages.get(m1.id)!.attachments[1] = { ...gmail.messages.get(m1.id)!.attachments[1] };
    await db.attachmentMetadata.update({ where: { id: meta.id }, data: { gmailAttachmentId: "stale_id" } });
    const stale = await downloadRoute(
      apiRequest(`/api/attachments/${m1.id}/stale_id`, { token }),
      routeCtx({ messageId: m1.id, attachmentId: "stale_id" }),
    );
    expect(stale.status).toBe(200);
    expect((await stale.arrayBuffer()).byteLength).toBe(2000);

    // Thread view: cid image rewritten to our URL, attachments listed per message.
    const detail = await getThreadDetail(account, gmail, m1.threadId);
    const msg = detail.messages[0];
    expect(msg.attachments.map((a) => a.filename).sort()).toEqual(["contract.pdf", "page.html", "photo.jpg"]);
    expect(msg.body.html).toContain(`src="/api/attachments/${m1.id}/att_${m1.id}_4"`);
  });

  it("another account's message is not downloadable", async () => {
    const a = await createTestAccount({ email: "alice@example.com" });
    const m = a.gmail.addMessage({
      from: "x@example.com",
      to: ["alice@example.com"],
      subject: "S",
      attachments: [{ filename: "a.pdf", mimeType: "application/pdf", data: bytes(5) }],
    });
    await runSync(a.account.id, { gmail: a.gmail });
    const b = await createTestAccount({ email: "bob@example.com" }); // factory now points to bob's empty FakeGmail
    const res = await downloadRoute(
      apiRequest(`/api/attachments/${m.id}/att_${m.id}_1`, { token: b.token }),
      routeCtx({ messageId: m.id, attachmentId: `att_${m.id}_1` }),
    );
    expect(res.status).toBe(404);
  });
});
