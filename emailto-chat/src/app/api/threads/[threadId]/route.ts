import { getPreferences } from "@/server/domain/account-info";
import { getThreadDetail } from "@/server/domain/thread-detail";
import { gmailFor } from "@/server/http";
import { gmailIdSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

/** ThreadDetail — fetched live from Gmail, bodies never stored. */
export const GET = apiHandler<undefined, undefined, { threadId: string }>({}, async ({ account, user, params }) => {
  const prefs = await getPreferences(user.id);
  return getThreadDetail(account, gmailFor(account), gmailIdSchema.parse(params.threadId), {
    allowRemoteImages: prefs.alwaysLoadRemoteImages,
  });
});
