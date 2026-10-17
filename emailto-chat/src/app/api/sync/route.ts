import { getMailAccount } from "@/server/auth/account";
import { apiHandler } from "@/server/security/api";
import { getSyncStatus, runSync, toSyncStatus } from "@/server/sync/engine";
import { ensureWatch } from "@/server/sync/watch";

export const maxDuration = 30;

/** Current SyncStatus (no Gmail call). */
export const GET = apiHandler({ auth: "user" }, async ({ user }) => {
  const account = await getMailAccount(user.id);
  return account ? getSyncStatus(account.id) : toSyncStatus(null, null);
});

/** Run a bounded sync step: incremental, or continue initial sync/backfill. */
export const POST = apiHandler({ auth: "user", rateLimit: "sync" }, async ({ user }) => {
  const account = await getMailAccount(user.id);
  if (!account) return toSyncStatus(null, null);
  const status = await runSync(account.id, { budgetMs: 8000 });
  if (status.state === "idle") await ensureWatch(account).catch(() => false);
  return status;
});
