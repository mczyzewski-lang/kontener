import type { MimeAttachment } from "@/core/mime";
import { sendMessage, type SendRequest } from "@/server/domain/send";
import { getEnv } from "@/server/env";
import { ApiError } from "@/server/errors";
import { gmailFor } from "@/server/http";
import { sendPayloadSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

export const maxDuration = 60;

/**
 * Send. multipart/form-data: `payload` = JSON SendInput (without attachments) + `attachments` files.
 * (application/json with the payload alone is accepted too.) Idempotent by payload.idempotencyKey.
 */
export const POST = apiHandler({ rateLimit: "send" }, async ({ req, account, user }) => {
  const maxBytes = getEnv().MAX_UPLOAD_MB * 1024 * 1024;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes + 256 * 1024) throw new ApiError("too_large", `Attachments exceed ${getEnv().MAX_UPLOAD_MB} MB`);

  const contentType = req.headers.get("content-type") ?? "";
  let payloadRaw: unknown;
  const attachments: MimeAttachment[] = [];
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError("invalid", "Invalid multipart body");
    }
    const payload = form.get("payload");
    if (typeof payload !== "string") throw new ApiError("invalid", "Missing payload field");
    try {
      payloadRaw = JSON.parse(payload);
    } catch {
      throw new ApiError("invalid", "payload must be JSON");
    }
    let total = 0;
    const files = form.getAll("attachments");
    if (files.length > 50) throw new ApiError("invalid", "Too many attachments");
    for (const f of files) {
      if (typeof f === "string") continue;
      total += f.size;
      if (total > maxBytes) throw new ApiError("too_large", `Attachments exceed ${getEnv().MAX_UPLOAD_MB} MB`);
      attachments.push({
        filename: (f.name || "attachment").slice(0, 255),
        mimeType: f.type || "application/octet-stream",
        data: new Uint8Array(await f.arrayBuffer()),
      });
    }
  } else {
    try {
      payloadRaw = await req.json();
    } catch {
      throw new ApiError("invalid", "Body must be multipart/form-data or JSON");
    }
  }
  const input = sendPayloadSchema.parse(payloadRaw) as SendRequest;
  return sendMessage({ account, user, gmail: gmailFor(account) }, input, attachments);
});
