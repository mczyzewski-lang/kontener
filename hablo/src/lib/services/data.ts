import "server-only";
import type { Session } from "@/lib/session";
import { eq, lt } from "@/lib/db/db";
import { USER_TABLES, type TableName } from "@/lib/db/types";
import { deleteObjects } from "@/lib/storage";
import { getPrefs } from "@/lib/learning/profile";

/** Export, retention and deletion of the learner's own data. */

const userCol = (t: TableName) => (t === "profiles" ? "id" : "user_id");

export async function exportJson(s: Session) {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), app: "Hablo", user: { id: s.userId, email: s.email } };
  for (const t of ["profiles", ...USER_TABLES] as TableName[]) out[t] = await s.db.select(t, { where: [eq(userCol(t), s.userId)] });
  out.own_vocabulary = await s.db.select("vocabulary_entries", { where: [eq("owner_id", s.userId)] });
  return out;
}

function csvCell(v: unknown): string {
  const str = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function exportCsv(s: Session): Promise<string> {
  const progress = await s.db.select("vocabulary_progress", { where: [eq("user_id", s.userId)] });
  const entries = new Map((await s.db.select("vocabulary_entries", {})).map((e) => [e.id, e]));
  const header = ["lemma", "kind", "translation", "frequency_rank", "skill", "state", "due", "stability_days", "reps", "lapses", "correct", "incorrect", "assisted", "spontaneous_uses", "known_claimed", "first_seen_at"];
  const rows = progress
    .sort((a, b) => a.entry_id.localeCompare(b.entry_id) || a.skill.localeCompare(b.skill))
    .map((p) => {
      const e = entries.get(p.entry_id);
      return [e?.lemma, e?.kind, e?.translations[0], e?.frequency_rank, p.skill, ["new", "learning", "review", "relearning"][p.state], p.due, p.stability.toFixed(1), p.reps, p.lapses, p.correct_count, p.incorrect_count, p.assisted_count, p.spontaneous_uses, p.known_claimed, p.first_seen_at]
        .map(csvCell)
        .join(",");
    });
  return [header.join(","), ...rows].join("\n");
}

export async function deleteData(s: Session, scope: "transcripts" | "recordings" | "all") {
  const sessions = await s.db.select("conversation_sessions", { where: [eq("user_id", s.userId)] });
  await deleteObjects("recordings", sessions.map((x) => x.audio_path).filter((x): x is string => !!x));
  if (scope === "recordings") {
    await s.db.update("conversation_sessions", [eq("user_id", s.userId)], { audio_path: null, audio_expires_at: null });
    return { deleted: "recordings" };
  }
  if (scope === "transcripts") {
    await s.db.remove("conversation_turns", [eq("user_id", s.userId)]);
    await s.db.update("conversation_sessions", [eq("user_id", s.userId)], { audio_path: null, audio_expires_at: null, context: {} });
    return { deleted: "transcripts" };
  }
  // Children before parents (the local store only emulates a few cascades).
  const order: TableName[] = [
    "conversation_turns", "conversation_feedback", "weekly_assessments", "conversation_sessions",
    "daily_plan_items", "daily_plans", "learning_tasks", "story_attempts", "story_vocabulary", "stories",
    "vocabulary_review_logs", "vocabulary_progress", "word_associations", "grammar_progress", "sprints",
    "learner_memory", "learning_events", "api_usage_logs", "learning_preferences",
    "thoughts", "thought_categories",
  ];
  for (const t of order) await s.db.remove(t, [eq("user_id", s.userId)]);
  await s.db.remove("vocabulary_entries", [eq("owner_id", s.userId)]);
  await s.db.update("profiles", [eq("id", s.userId)], { onboarded_at: null, start_level: "unknown" });
  return { deleted: "all" };
}

/** Applies retention settings: expired recordings and (optionally) old transcripts. */
export async function applyRetention(s: Session, now = new Date()) {
  const prefs = await getPrefs(s.db, s.userId);
  const expired = await s.db.select("conversation_sessions", { where: [eq("user_id", s.userId), lt("audio_expires_at", now.toISOString())] });
  if (expired.length) {
    await deleteObjects("recordings", expired.map((x) => x.audio_path).filter((x): x is string => !!x));
    for (const x of expired) await s.db.update("conversation_sessions", [eq("id", x.id)], { audio_path: null, audio_expires_at: null });
  }
  if (prefs.transcript_retention_days) {
    const cutoff = new Date(now.getTime() - prefs.transcript_retention_days * 86_400_000).toISOString();
    const old = await s.db.select("conversation_sessions", { where: [eq("user_id", s.userId), lt("started_at", cutoff)] });
    for (const x of old) await s.db.remove("conversation_turns", [eq("session_id", x.id)]);
  }
}
