import { saveDraft } from "@/server/domain/drafts";
import { gmailFor } from "@/server/http";
import { draftSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

/** Create (or update when draftId is given) a Gmail draft → { draftId }. */
export const POST = apiHandler({ body: draftSchema }, async ({ account, user, body }) =>
  saveDraft({ account, user, gmail: gmailFor(account) }, body),
);
