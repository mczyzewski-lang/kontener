import type { Db } from "@/lib/db/db";
import { eq, gte } from "@/lib/db/db";
import type { LearningEventRow, LearningPreferencesRow, ProfileRow } from "@/lib/db/types";
import { localDate } from "./time";

export async function getProfile(db: Db, userId: string): Promise<ProfileRow | null> {
  return (await db.select("profiles", { where: [eq("id", userId)], limit: 1 }))[0] ?? null;
}

export async function getPrefs(db: Db, userId: string): Promise<LearningPreferencesRow> {
  const row = (await db.select("learning_preferences", { where: [eq("user_id", userId)], limit: 1 }))[0];
  if (row) return row;
  const [created] = await db.upsert("learning_preferences", { user_id: userId });
  return created;
}

export async function today(db: Db, userId: string, now = new Date()): Promise<string> {
  const prefs = await getPrefs(db, userId);
  return localDate(prefs.timezone, now);
}

/** Activity log used for streaks, minutes and the monthly chart. */
export async function logEvent(
  db: Db,
  userId: string,
  type: string,
  opts: { minutes?: number; payload?: unknown; now?: Date } = {},
) {
  const prefs = await getPrefs(db, userId);
  await db.insert("learning_events", {
    user_id: userId,
    type,
    minutes: opts.minutes ?? 0,
    payload: opts.payload ?? {},
    local_date: localDate(prefs.timezone, opts.now ?? new Date()),
  });
}

export async function recentEvents(db: Db, userId: string, sinceDate: string): Promise<LearningEventRow[]> {
  return db.select("learning_events", { where: [eq("user_id", userId), gte("local_date", sinceDate)] });
}

/** Current streak of consecutive active days ending today or yesterday. */
export function streak(activeDates: Set<string>, todayDate: string): number {
  let n = 0;
  const d = new Date(`${todayDate}T12:00:00Z`);
  if (!activeDates.has(todayDate)) d.setUTCDate(d.getUTCDate() - 1);
  while (activeDates.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
