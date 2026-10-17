/**
 * Sync engine: Gmail → metadata index.
 *
 *  Initial sync (progressive)
 *    1. Record getProfile().historyId FIRST (changes after this point are caught by incremental
 *       sync, so nothing that happens during the backfill is lost) and refresh send-as aliases.
 *    2. threads.list (newest first, spam/trash excluded, 25 per page) — the first page is indexed
 *       immediately so the UI shows recent conversations fast.
 *    3. Each later sync call continues the backfill from `backfillPageToken` within a time budget,
 *       up to MAX_BACKFILL_THREADS threads.
 *
 *  Incremental sync: history.list from the stored historyId (messageAdded/Deleted, labelAdded/
 *  Removed) → affected threadIds → threads.get + re-index (404 → delete locally) → advance cursor.
 *  The cursor only advances after every affected thread was processed (re-indexing is idempotent,
 *  so an interrupted run is simply repeated).
 *
 *  Expired cursor (history.list 404) → REPAIR: the safe option. We take a fresh historyId, restart
 *  the full listing and mark `fullSyncStartedAt`. Every thread seen by the listing — or fetched
 *  successfully from Gmail by any path — gets `listedAt = now`.
 *  Local threads are pruned (listedAt < fullSyncStartedAt) ONLY when the listing reached its end
 *  without hitting MAX_BACKFILL_THREADS — a partial listing never deletes anything. Existing rows
 *  keep serving the UI while the repair runs.
 *
 *  Concurrency: a DB lease (`SyncState.lockedUntil`, atomic conditional UPDATE) ensures only one
 *  sync per account runs at a time across client polls, cron and Pub/Sub pushes; upserts keyed by
 *  Gmail ids guard against duplicates anyway.
 */
import type { MailAccount, SyncState } from "@prisma/client";
import { normalizeEmail } from "@/core/addresses";
import type { SyncStatus } from "@/core/types";
import { db } from "../db";
import { getEnv } from "../env";
import { GmailError, isGmailError } from "../gmail/errors";
import { getGmailForAccount, markNeedsReauth } from "../gmail/factory";
import type { GmailApi } from "../gmail/types";
import { deleteLocalThread, indexThread } from "../domain/indexer";
import { errorCode, log } from "../log";

export const PAGE_SIZE = 25;
export const CONCURRENCY = 5;
const LIST_QUERY = "-in:spam -in:trash";
const HISTORY_TYPES = ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"];

export interface SyncOptions {
  /** Time budget for this call (ms). Default 8000. */
  budgetMs?: number;
  gmail?: GmailApi;
  /** Defaults to env MAX_BACKFILL_THREADS. */
  maxBackfillThreads?: number;
  /** Skip backfill continuation (e.g. Pub/Sub pushes only need the incremental part). */
  incrementalOnly?: boolean;
}

class Deadline {
  private readonly end: number;
  constructor(ms: number) {
    this.end = Date.now() + ms;
  }
  get expired() {
    return Date.now() >= this.end;
  }
}

/** Run `fn` over items with bounded concurrency; stops picking new items once the deadline passes. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, deadline?: Deadline): Promise<number> {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      if (deadline?.expired) return;
      const item = items[next++];
      await fn(item);
      done++;
    }
  });
  await Promise.all(workers);
  return done;
}

export function toSyncStatus(account: Pick<MailAccount, "status"> | null, state: SyncState | null): SyncStatus {
  if (!account) {
    return { state: "disconnected", lastSyncAt: null, initialSyncComplete: false, backfillComplete: false, threadCount: 0 };
  }
  const base = {
    lastSyncAt: state?.lastSyncAt?.toISOString() ?? null,
    initialSyncComplete: state?.initialSyncComplete ?? false,
    backfillComplete: state?.backfillComplete ?? false,
    threadCount: state?.threadCount ?? 0,
  };
  if (account.status === "needs_reauth") return { state: "needs_reauth", ...base, error: "needs_reauth" };
  const locked = !!state?.lockedUntil && state.lockedUntil.getTime() > Date.now();
  if (locked) return { state: "syncing", ...base };
  if (state?.status === "error") return { state: "error", ...base, error: state.lastError ?? "sync_failed" };
  return { state: "idle", ...base };
}

export async function getSyncStatus(accountId: string): Promise<SyncStatus> {
  const account = await db.mailAccount.findUnique({ where: { id: accountId }, include: { syncState: true } });
  return toSyncStatus(account, account?.syncState ?? null);
}

async function acquireLock(accountId: string, ms: number): Promise<boolean> {
  await db.syncState.upsert({ where: { accountId }, create: { accountId }, update: {} });
  const now = new Date();
  const res = await db.syncState.updateMany({
    where: { accountId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + ms), status: "syncing" },
  });
  return res.count === 1;
}

async function refreshAliases(account: MailAccount, gmail: GmailApi): Promise<MailAccount> {
  try {
    const list = await gmail.listSendAs();
    const primary = normalizeEmail(account.emailAddress);
    const aliases = [
      ...new Set(
        list
          .filter((s) => s.verificationStatus === undefined || s.verificationStatus === null || s.verificationStatus === "accepted" || s.isPrimary)
          .map((s) => normalizeEmail(s.sendAsEmail))
          .filter((e) => e !== primary),
      ),
    ].sort();
    if (aliases.join() !== [...account.aliases].sort().join()) {
      return db.mailAccount.update({ where: { id: account.id }, data: { aliases } });
    }
  } catch (e) {
    if (isGmailError(e, "needs_reauth")) throw e;
    log.warn("aliases_refresh_failed", { accountId: account.id, code: errorCode(e) });
  }
  return account;
}

/** Start (or restart, for repair) a full listing. */
async function startFullListing(account: MailAccount, gmail: GmailApi, repair: boolean): Promise<MailAccount> {
  const profile = await gmail.getProfile(); // historyId FIRST
  const acc = await refreshAliases(account, gmail);
  await db.syncState.update({
    where: { accountId: account.id },
    data: {
      historyId: profile.historyId,
      backfillPageToken: null,
      backfillComplete: false,
      backfillCount: 0,
      fullSyncStartedAt: new Date(),
      ...(repair ? {} : { initialSyncComplete: false }),
    },
  });
  if (repair) log.warn("sync_repair_started", { accountId: account.id });
  return acc;
}

async function indexById(account: MailAccount, gmail: GmailApi, threadId: string, listedAt?: Date): Promise<void> {
  try {
    const thread = await gmail.getThread(threadId);
    await indexThread(account, thread, { listedAt });
  } catch (e) {
    if (isGmailError(e, "not_found")) {
      await deleteLocalThread(account.id, threadId);
      return;
    }
    throw e;
  }
}

/** One page of the full listing. Returns false when the listing is finished. */
async function listingStep(account: MailAccount, gmail: GmailApi, maxThreads: number, deadline: Deadline): Promise<boolean> {
  const state = (await db.syncState.findUnique({ where: { accountId: account.id } }))!;
  if (state.backfillComplete) return false;
  const page = await gmail.listThreads({ q: LIST_QUERY, pageToken: state.backfillPageToken, maxResults: PAGE_SIZE });
  const listedAt = new Date();

  // Skip threads whose stored historyId matches (unchanged since we indexed them).
  const local = await db.emailThread.findMany({
    where: { accountId: account.id, gmailThreadId: { in: page.threads.map((t) => t.id) } },
    select: { gmailThreadId: true, historyId: true },
  });
  const known = new Map(local.map((l) => [l.gmailThreadId, l.historyId]));
  const unchanged = page.threads.filter((t) => t.historyId && known.get(t.id) === t.historyId).map((t) => t.id);
  if (unchanged.length) {
    await db.emailThread.updateMany({ where: { accountId: account.id, gmailThreadId: { in: unchanged } }, data: { listedAt } });
  }
  const todo = page.threads.filter((t) => !unchanged.includes(t.id));
  const done = await mapLimit(todo, CONCURRENCY, (t) => indexById(account, gmail, t.id, listedAt), deadline);
  if (done < todo.length) return true; // out of time mid-page: redo this page next call (idempotent)

  const count = state.backfillCount + page.threads.length;
  const reachedEnd = !page.nextPageToken;
  const capped = !reachedEnd && count >= maxThreads;
  const finished = reachedEnd || capped;

  if (finished && reachedEnd && state.fullSyncStartedAt) {
    // Complete listing → anything not seen since the listing started no longer exists in Gmail
    // (or moved to spam/trash).
    const pruned = await db.emailThread.deleteMany({
      where: { accountId: account.id, OR: [{ listedAt: null }, { listedAt: { lt: state.fullSyncStartedAt } }] },
    });
    if (pruned.count) log.info("sync_pruned_threads", { accountId: account.id, count: pruned.count });
  }

  await db.syncState.update({
    where: { accountId: account.id },
    data: {
      backfillPageToken: finished ? null : page.nextPageToken,
      backfillCount: count,
      initialSyncComplete: true,
      ...(finished ? { backfillComplete: true, fullSyncStartedAt: null, lastFullSyncAt: new Date() } : {}),
    },
  });
  return !finished;
}

/** history.list → affected threads → re-index. Throws GmailError(not_found) for an expired cursor. */
async function incrementalSync(account: MailAccount, gmail: GmailApi, deadline: Deadline): Promise<{ complete: boolean; changed: number }> {
  const state = (await db.syncState.findUnique({ where: { accountId: account.id } }))!;
  if (!state.historyId) throw new GmailError("not_found", "no_history_cursor");
  const threadIds = new Set<string>();
  let pageToken: string | null = null;
  let latest: string | null = null;
  do {
    const page = await gmail.listHistory({ startHistoryId: state.historyId, pageToken, historyTypes: HISTORY_TYPES });
    for (const h of page.history) {
      for (const list of [h.messagesAdded, h.messagesDeleted, h.labelsAdded, h.labelsRemoved]) {
        for (const item of list ?? []) if (item.message?.threadId) threadIds.add(item.message.threadId);
      }
      for (const m of h.messages ?? []) if (m.threadId) threadIds.add(m.threadId);
    }
    latest = page.historyId ?? latest;
    pageToken = page.nextPageToken;
  } while (pageToken);

  const ids = [...threadIds];
  const done = await mapLimit(ids, CONCURRENCY, (id) => indexById(account, gmail, id), deadline);
  if (done < ids.length) return { complete: false, changed: done }; // keep the old cursor; redo next time
  if (latest && latest !== state.historyId) {
    await db.syncState.update({ where: { accountId: account.id }, data: { historyId: latest } });
  }
  return { complete: true, changed: ids.length };
}

/**
 * Run one bounded sync step for an account and return its status.
 * Safe to call concurrently (DB lease) and repeatedly (idempotent).
 */
export async function runSync(accountId: string, opts: SyncOptions = {}): Promise<SyncStatus> {
  const budgetMs = opts.budgetMs ?? 8000;
  let account = await db.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) return toSyncStatus(null, null);
  if (account.status !== "active") return getSyncStatus(accountId);
  if (!(await acquireLock(accountId, budgetMs + 60_000))) return getSyncStatus(accountId);

  const deadline = new Deadline(budgetMs);
  const started = Date.now();
  try {
    const gmail = opts.gmail ?? getGmailForAccount(account);
    const maxThreads = opts.maxBackfillThreads ?? getEnv().MAX_BACKFILL_THREADS;
    let state = (await db.syncState.findUnique({ where: { accountId } }))!;

    if (!state.historyId) {
      account = await startFullListing(account, gmail, false);
      // The first page is always indexed in full (whatever the budget) so the UI has recent mail.
      await listingStep(account, gmail, maxThreads, new Deadline(Math.max(budgetMs, 60_000)));
    } else {
      try {
        await incrementalSync(account, gmail, deadline);
      } catch (e) {
        if (!isGmailError(e, "not_found")) throw e;
        account = await startFullListing(account, gmail, true);
      }
    }

    state = (await db.syncState.findUnique({ where: { accountId } }))!;
    if (!opts.incrementalOnly || state.fullSyncStartedAt) {
      while (!deadline.expired && (await listingStep(account, gmail, maxThreads, deadline))) {
        /* continue backfill */
      }
    }

    const threadCount = await db.emailThread.count({ where: { accountId, hidden: false } });
    const updated = await db.syncState.update({
      where: { accountId },
      data: { status: "idle", lockedUntil: null, lastSyncAt: new Date(), consecutiveErrors: 0, lastError: null, threadCount },
    });
    log.info("sync_ok", { accountId, ms: Date.now() - started, threads: threadCount });
    return toSyncStatus(account, updated);
  } catch (e) {
    const code = errorCode(e);
    if (isGmailError(e, "needs_reauth") || (e as { code?: string }).code === "needs_reauth") await markNeedsReauth(accountId);
    log.warn("sync_failed", { accountId, code, ms: Date.now() - started });
    const updated = await db.syncState
      .update({
        where: { accountId },
        data: { status: "error", lockedUntil: null, lastError: code, consecutiveErrors: { increment: 1 } },
      })
      .catch(() => null);
    const fresh = await db.mailAccount.findUnique({ where: { id: accountId } });
    return toSyncStatus(fresh, updated);
  }
}
