import { z } from "zod";
import type { AttachmentScope } from "@/core/client";
import { listAttachments } from "@/server/domain/attachments";
import { dbIdSchema, gmailIdSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

const query = z.object({ scope: z.enum(["thread", "person", "group"]), id: z.string().min(1).max(1024) });

export const GET = apiHandler({ query }, async ({ account, query }) => {
  const scope: AttachmentScope =
    query.scope === "thread"
      ? { kind: "thread", threadId: gmailIdSchema.parse(query.id) }
      : { kind: query.scope, id: dbIdSchema.parse(query.id) };
  return listAttachments(account.id, scope);
});
