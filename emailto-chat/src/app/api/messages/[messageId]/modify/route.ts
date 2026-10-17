import type { MessageAction } from "@/core/types";
import { modifyMessage } from "@/server/domain/actions";
import { gmailFor } from "@/server/http";
import { gmailIdSchema, messageActionSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

export const POST = apiHandler<undefined, { action: MessageAction }, { messageId: string }>(
  { body: messageActionSchema },
  async ({ account, params, body }) => {
    await modifyMessage(account, gmailFor(account), gmailIdSchema.parse(params.messageId), body.action);
    return { ok: true };
  },
);
