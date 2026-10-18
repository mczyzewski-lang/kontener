import type { Db } from "@/lib/db/db";
import { eq } from "@/lib/db/db";
import type { ThoughtContext, ThoughtRow } from "@/lib/db/types";
import { localDate } from "@/lib/learning/time";
import { parseLibrary } from "./import";

/**
 * "Moje myśli" — a private library of the learner's own thoughts. There are no
 * streaks, scores or duties here: the library only remembers what was shown
 * recently so the home screen does not repeat itself.
 */

export interface ImportReport {
  categories: number;
  thoughts: { created: number; updated: number; keptEdited: number; unchanged: number };
  questions: { created: number; updated: number; keptEdited: number; unchanged: number };
  featured: number;
  warnings: string[];
}

/**
 * Imports (or re-imports) the library. Never deletes anything. Entries the
 * learner has edited keep the learner's version; favourites and hidden flags
 * are always the learner's own and are never touched by an import.
 */
export async function importLibrary(db: Db, userId: string, raw: unknown): Promise<ImportReport> {
  const lib = parseLibrary(raw);
  const existingCats = new Set((await db.select("thought_categories", { where: [eq("user_id", userId)] })).map((c) => c.key));
  for (const c of lib.categories) {
    if (existingCats.has(c.key)) continue; // a renamed category stays renamed
    await db.insert("thought_categories", { user_id: userId, key: c.key, name: c.name, description: c.description, position: c.position });
  }
  const existing = new Map(
    (await db.select("thoughts", { where: [eq("user_id", userId)] })).filter((t) => t.origin_id).map((t) => [t.origin_id!, t]),
  );
  const empty = () => ({ created: 0, updated: 0, keptEdited: 0, unchanged: 0 });
  const report: ImportReport = { categories: lib.categories.length, thoughts: empty(), questions: empty(), featured: 0, warnings: lib.warnings };
  const now = new Date().toISOString();
  for (const e of lib.entries) {
    const bucket = e.kind === "question" ? report.questions : report.thoughts;
    if (e.featured) report.featured++;
    const cur = existing.get(e.originId);
    const content = {
      kind: e.kind,
      text: e.text,
      category_key: e.categoryKey,
      contexts: e.contexts,
      featured: e.featured,
      meta: e.meta,
      origin_hash: e.hash,
    };
    if (!cur) {
      await db.insert("thoughts", { user_id: userId, origin_id: e.originId, ...content });
      bucket.created++;
    } else if (cur.edited) {
      bucket.keptEdited++;
    } else if (cur.origin_hash === e.hash) {
      bucket.unchanged++;
    } else {
      await db.update("thoughts", [eq("id", cur.id)], { ...content, updated_at: now });
      bucket.updated++;
    }
  }
  return report;
}

export async function listLibrary(db: Db, userId: string) {
  const [categories, entries] = await Promise.all([
    db.select("thought_categories", { where: [eq("user_id", userId)], order: [{ col: "position" }] }),
    db.select("thoughts", { where: [eq("user_id", userId)], order: [{ col: "created_at" }] }),
  ]);
  return { categories, entries };
}

export interface ThoughtPatch {
  text?: string;
  category_key?: string | null;
  contexts?: ThoughtContext[];
  favorite?: boolean;
  hidden?: boolean;
  featured?: boolean;
}

/** Content edits mark the entry as the learner's own version; flags do not. */
export async function updateThought(db: Db, userId: string, id: string, patch: ThoughtPatch): Promise<ThoughtRow | null> {
  const contentChanged = patch.text !== undefined || patch.category_key !== undefined || patch.contexts !== undefined || patch.featured !== undefined;
  const [row] = await db.update("thoughts", [eq("id", id), eq("user_id", userId)], {
    ...patch,
    ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
    ...(contentChanged ? { edited: true } : {}),
    updated_at: new Date().toISOString(),
  });
  return row ?? null;
}

export async function addThought(
  db: Db,
  userId: string,
  input: { kind: "thought" | "question"; text: string; category_key: string | null; contexts: ThoughtContext[] },
) {
  const [row] = await db.insert("thoughts", { user_id: userId, ...input, text: input.text.trim(), edited: true });
  return row;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * At most one thought for the home screen, matching the context. Stable during
 * the day (the same thought comes back on refresh), prefers favourites and
 * featured thoughts, and avoids what was shown in the last two weeks.
 * Returns null when nothing fits — showing nothing is better than a random line.
 */
export async function pickThought(db: Db, userId: string, ctx: ThoughtContext, tz: string, now = new Date()): Promise<ThoughtRow | null> {
  const all = await db.select("thoughts", { where: [eq("user_id", userId), eq("kind", "thought"), eq("hidden", false)] });
  const fits = all.filter((t) => t.contexts.includes(ctx));
  if (!fits.length) return null;
  const today = localDate(tz, now);
  const shownToday = fits.find((t) => t.last_shown_at && localDate(tz, new Date(t.last_shown_at)) === today);
  if (shownToday) return shownToday;
  const twoWeeks = now.getTime() - 14 * 86_400_000;
  const fresh = fits.filter((t) => !t.last_shown_at || Date.parse(t.last_shown_at) < twoWeeks);
  const pool = fresh.length ? fresh : [...fits].sort((a, b) => Date.parse(a.last_shown_at ?? "0") - Date.parse(b.last_shown_at ?? "0")).slice(0, Math.max(1, Math.ceil(fits.length / 3)));
  // Weighted, deterministic choice: favourites ×3, featured ×2.
  const weighted = pool.flatMap((t) => Array(t.favorite ? 3 : t.featured ? 2 : 1).fill(t) as ThoughtRow[]);
  weighted.sort((a, b) => a.id.localeCompare(b.id));
  const choice = weighted[hash(`${today}:${ctx}`) % weighted.length];
  await db.update("thoughts", [eq("id", choice.id)], { last_shown_at: now.toISOString() });
  return choice;
}
