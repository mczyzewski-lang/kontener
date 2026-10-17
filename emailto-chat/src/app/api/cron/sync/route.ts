import { db } from "@/server/db";
import { getEnv } from "@/server/env";
import { log } from "@/server/log";
import { safeEqual } from "@/server/security/crypto";
import { runSync } from "@/server/sync/engine";
import { ensureWatch } from "@/server/sync/watch";

export const maxDuration = 60;

/**
 * Vercel Cron (Authorization: Bearer CRON_SECRET): incremental sync with a small budget for every
 * active account, watch renewal, and housekeeping (expired sessions, old idempotency rows).
 * On the Hobby plan crons run daily — in-app polling (/api/sync) is the primary fallback.
 */
export async function GET(req: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response(null, { status: 401 });

  const started = Date.now();
  const budgetTotal = 50_000;
  const accounts = await db.mailAccount.findMany({
    where: { status: "active" },
    include: { syncState: { select: { lastSyncAt: true } } },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  accounts.sort((a, b) => (a.syncState?.lastSyncAt?.getTime() ?? 0) - (b.syncState?.lastSyncAt?.getTime() ?? 0));

  let synced = 0;
  let watched = 0;
  for (const a of accounts) {
    if (Date.now() - started > budgetTotal) break;
    const s = await runSync(a.id, { budgetMs: 3000, incrementalOnly: true });
    if (s.state !== "error") synced++;
    if (await ensureWatch(a)) watched++;
  }
  const now = new Date();
  const expiredSessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.outboundMessage.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } } });
  log.info("cron_sync", { accounts: accounts.length, synced, watched, expiredSessions: expiredSessions.count, ms: Date.now() - started });
  return Response.json({ accounts: accounts.length, synced, watched });
}
