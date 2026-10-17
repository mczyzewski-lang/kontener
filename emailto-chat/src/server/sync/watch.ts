/**
 * Gmail push notifications (users.watch → Cloud Pub/Sub → /api/webhooks/gmail).
 * Watches ALL mail (no labelIds filter) so messages sent from Gmail web/mobile also trigger a sync.
 * A watch expires after 7 days; we renew when it expires within 24 h (cron + connect).
 */
import type { MailAccount } from "@prisma/client";
import { db } from "../db";
import { getEnv } from "../env";
import { getGmailForAccount } from "../gmail/factory";
import type { GmailApi } from "../gmail/types";
import { errorCode, log } from "../log";

const RENEW_BEFORE_MS = 24 * 3600 * 1000;

export async function ensureWatch(account: MailAccount, gmail?: GmailApi, topic = getEnv().GMAIL_PUBSUB_TOPIC): Promise<boolean> {
  if (!topic || account.status !== "active") return false;
  if (account.pushExpiration && account.pushExpiration.getTime() > Date.now() + RENEW_BEFORE_MS) return true;
  try {
    const res = await (gmail ?? getGmailForAccount(account)).watch({ topicName: topic });
    const exp = Number(res.expiration);
    await db.mailAccount.update({
      where: { id: account.id },
      data: { pushExpiration: Number.isFinite(exp) && exp > 0 ? new Date(exp) : new Date(Date.now() + 6 * 24 * 3600 * 1000) },
    });
    log.info("watch_renewed", { accountId: account.id });
    return true;
  } catch (e) {
    log.warn("watch_failed", { accountId: account.id, code: errorCode(e) });
    return false;
  }
}
