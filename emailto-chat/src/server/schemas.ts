/** zod input schemas shared by API routes (mirror src/core/types.ts). */
import { z } from "zod";

export const mailboxSchema = z.enum(["inbox", "sent", "archive", "all"]);
export const readFilterSchema = z.enum(["all", "unread"]);

/** Gmail ids (thread, message, draft, attachment) are URL-safe tokens. */
export const gmailIdSchema = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/, "invalid id");
export const dbIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "invalid id");

export const addressSchema = z.object({
  email: z.string().trim().min(3).max(320),
  name: z.string().max(200).nullish(),
});

const addressList = z.array(addressSchema).max(100).default([]);

export const sendPayloadSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, "idempotencyKey must be 8-100 chars [A-Za-z0-9_-]"),
  mode: z.enum(["new", "reply", "replyAll", "forward", "newTopic"]),
  threadId: gmailIdSchema.nullish(),
  inReplyToMessageId: gmailIdSchema.nullish(),
  to: addressList,
  cc: addressList,
  bcc: addressList,
  subject: z.string().max(998).default(""),
  text: z.string().max(2_000_000).default(""),
  draftId: gmailIdSchema.nullish(),
  from: z.string().max(320).nullish(),
});

export const draftSchema = z.object({
  draftId: gmailIdSchema.nullish(),
  threadId: gmailIdSchema.nullish(),
  inReplyToMessageId: gmailIdSchema.nullish(),
  to: addressList,
  cc: addressList,
  bcc: addressList,
  subject: z.string().max(998).default(""),
  text: z.string().max(2_000_000).default(""),
});

export const preferencesPatchSchema = z
  .object({
    enterToSend: z.boolean(),
    theme: z.enum(["system", "light", "dark"]),
    alwaysLoadRemoteImages: z.boolean(),
    pollIntervalSec: z.number().int().min(15).max(3600),
  })
  .partial()
  .strict();

export const threadActionSchema = z.object({
  action: z.enum(["archive", "unarchive", "read", "unread", "star", "unstar", "trash"]),
});

export const messageActionSchema = z.object({ action: z.enum(["read", "unread", "star", "unstar"]) });
