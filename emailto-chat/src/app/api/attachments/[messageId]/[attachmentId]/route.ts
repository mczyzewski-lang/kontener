import { z } from "zod";
import { buildAttachmentHeaders, fetchAttachment } from "@/server/domain/attachments";
import { gmailFor } from "@/server/http";
import { gmailIdSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

const refSchema = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_.-]+$/, "invalid attachment id");

/** Attachment bytes with safe headers (sandbox CSP, nosniff, forced download for unsafe types). */
export const GET = apiHandler<undefined, undefined, { messageId: string; attachmentId: string }>(
  {},
  async ({ account, params, req }) => {
    const a = await fetchAttachment(account, gmailFor(account), gmailIdSchema.parse(params.messageId), refSchema.parse(params.attachmentId));
    const headers = buildAttachmentHeaders({
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.bytes.byteLength,
      download: req.nextUrl.searchParams.has("download"),
    });
    return new Response(Buffer.from(a.bytes), { headers });
  },
);
