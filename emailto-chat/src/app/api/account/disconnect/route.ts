import { disconnectAccount } from "@/server/auth/account";
import { apiHandler } from "@/server/security/api";

/** Disconnect Gmail: revoke at Google, stop push, delete tokens and ALL synced mail data. */
export const POST = apiHandler({ rateLimit: "auth" }, async ({ account }) => {
  await disconnectAccount(account.id);
  return { ok: true };
});
