import type { Db } from "@/lib/db/db";
import { eq } from "@/lib/db/db";
import type { LearnerMemoryRow, LearningTaskRow, MemoryKind } from "@/lib/db/types";

/**
 * Personal Language Memory and the follow-up task backlog. Every module writes
 * here; the planner and the voice tutor read from here.
 */

export async function upsertMemory(db: Db, userId: string, kind: MemoryKind, key: string, content: string, weightDelta = 1) {
  const k = key.toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").slice(0, 80) || "note";
  const existing = (
    await db.select("learner_memory", { where: [eq("user_id", userId), eq("kind", kind), eq("key", k)], limit: 1 })
  )[0];
  const now = new Date().toISOString();
  if (existing) {
    await db.update("learner_memory", [eq("id", existing.id)], {
      content: content.slice(0, 500),
      evidence_count: existing.evidence_count + 1,
      weight: existing.weight + weightDelta,
      last_seen_at: now,
    });
  } else {
    await db.insert("learner_memory", { user_id: userId, kind, key: k, content: content.slice(0, 500), weight: weightDelta });
  }
}

export async function getMemory(db: Db, userId: string): Promise<LearnerMemoryRow[]> {
  const rows = await db.select("learner_memory", { where: [eq("user_id", userId)] });
  return rows.sort((a, b) => b.weight * b.evidence_count - a.weight * a.evidence_count);
}

/** Adds a backlog task unless an equivalent pending one exists (dedup on type + targets). */
export async function addTask(
  db: Db,
  userId: string,
  task: Pick<LearningTaskRow, "type" | "goal" | "source"> & Partial<LearningTaskRow>,
) {
  const pending = await db.select("learning_tasks", { where: [eq("user_id", userId), eq("status", "pending"), eq("type", task.type)] });
  const sig = (t: Partial<LearningTaskRow>) =>
    JSON.stringify([t.grammar_topic_ids ?? [], t.scenario_id ?? null, t.type === "review_words" ? [] : (t.entry_ids ?? [])]);
  const dup = pending.find((p) => sig(p) === sig(task));
  if (dup) {
    const merged = [...new Set([...dup.entry_ids, ...(task.entry_ids ?? [])])];
    await db.update("learning_tasks", [eq("id", dup.id)], {
      entry_ids: merged,
      priority: Math.min(100, Math.max(dup.priority, task.priority ?? 50) + 5),
    });
    return dup.id;
  }
  const [row] = await db.insert("learning_tasks", { user_id: userId, ...task });
  return row.id;
}

/** Compact, human-readable memory for the voice tutor's context. */
export function memoryForTutor(rows: LearnerMemoryRow[]) {
  const pick = (kinds: MemoryKind[], n: number) =>
    rows
      .filter((r) => kinds.includes(r.kind))
      .slice(0, n)
      .map((r) => r.content);
  return {
    facts: pick(["fact", "interest", "goal"], 8),
    errors: pick(["error_pattern", "weak_construction"], 5),
    strengths: pick(["strength"], 3),
    comprehension: pick(["comprehension_issue"], 3),
  };
}
