import { deleteDraft } from "@/server/domain/drafts";
import { gmailFor } from "@/server/http";
import { gmailIdSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

export const DELETE = apiHandler<undefined, undefined, { draftId: string }>({}, async ({ account, params }) => {
  await deleteDraft(account, gmailFor(account), gmailIdSchema.parse(params.draftId));
  return { ok: true };
});
