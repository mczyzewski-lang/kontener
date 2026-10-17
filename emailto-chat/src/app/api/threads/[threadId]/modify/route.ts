import type { ThreadAction } from "@/core/types";
import { modifyThread } from "@/server/domain/actions";
import { gmailFor } from "@/server/http";
import { gmailIdSchema, threadActionSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

export const POST = apiHandler<undefined, { action: ThreadAction }, { threadId: string }>(
  { body: threadActionSchema },
  async ({ account, params, body }) => {
    await modifyThread(account, gmailFor(account), gmailIdSchema.parse(params.threadId), body.action);
    return { ok: true };
  },
);
