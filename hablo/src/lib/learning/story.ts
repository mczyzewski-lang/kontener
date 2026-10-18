import type { Db } from "@/lib/db/db";
import { eq, lte } from "@/lib/db/db";
import type { StoryRow, VocabularyEntryRow, VocabularyProgressRow } from "@/lib/db/types";
import { loadContent } from "@/lib/content";
import { storyBodySchema, type StoryBody } from "@/lib/content/schemas";
import { findEntries, normalize, type Lexicon } from "./text";

/**
 * Story Engine. Stories are stored as data per user (seed stories are copied
 * into the user's library), never regenerated on open. Recurring stories come
 * back after 3, 7, 14 and 30 days in a modified form: past tense, extended,
 * another character's perspective.
 */

export const RETELL_INTERVALS_DAYS = [3, 7, 14, 30];
export const VARIANT_CYCLE = ["past", "extended", "perspective", "future"] as const;
export type StoryVariant = (typeof VARIANT_CYCLE)[number];

export function storyBody(row: Pick<StoryRow, "body">): StoryBody {
  return storyBodySchema.parse(row.body);
}

export function storyText(body: StoryBody): string {
  return body.sentences.map((s) => s.es).join(" ");
}

function lemmaToEntryIds(entries: VocabularyEntryRow[]) {
  const map = new Map<string, string>();
  for (const e of entries) if (e.kind === "word" && !map.has(e.lemma.toLowerCase())) map.set(e.lemma.toLowerCase(), e.id);
  return map;
}

/** Copies the seed library into the user's account (idempotent via unique(user_id, seed_id, variant)). */
export async function ensureStarterStories(db: Db, userId: string, entries: VocabularyEntryRow[]) {
  const existing = await db.select("stories", { where: [eq("user_id", userId), eq("variant", "original")] });
  const haveSeeds = new Set(existing.map((s) => s.seed_id));
  const map = lemmaToEntryIds(entries);
  for (const seed of loadContent().stories) {
    if (haveSeeds.has(seed.id)) continue;
    const targetIds = seed.target_lemmas.map((l) => map.get(l)).filter((x): x is string => !!x);
    const [row] = await db.insert("stories", {
      user_id: userId,
      seed_id: seed.id,
      variant: "original",
      source: "seed",
      title: seed.title,
      level: seed.level,
      tense: seed.tense,
      body: { title: seed.title, sentences: seed.sentences, glossary: seed.glossary, questions: seed.questions },
      target_entry_ids: targetIds,
    });
    if (targetIds.length)
      await db.upsert(
        "story_vocabulary",
        targetIds.map((entry_id) => ({ story_id: row.id, entry_id, user_id: userId, is_target: true })),
      );
  }
}

/** Words to weave into a new story: recently introduced or due for recall, 5–8 of them. */
export function pickStoryTargets(
  entries: VocabularyEntryRow[],
  progress: VocabularyProgressRow[],
  now = new Date(),
  count = 7,
): VocabularyEntryRow[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const recall = progress.filter((p) => p.skill === "recall" && byId.get(p.entry_id)?.kind === "word");
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const score = (p: VocabularyProgressRow) =>
    (new Date(p.due).getTime() <= now.getTime() ? 3 : 0) +
    (new Date(p.first_seen_at).getTime() >= weekAgo ? 2 : 0) +
    (p.state === 1 || p.state === 3 ? 1 : 0) +
    p.priority_boost;
  const picked = recall
    .filter((p) => !p.known_claimed)
    .sort((a, b) => score(b) - score(a) || a.entry_id.localeCompare(b.entry_id))
    .slice(0, count)
    .map((p) => byId.get(p.entry_id)!)
    .filter(Boolean);
  if (picked.length >= 5) return picked;
  // Not enough learned words yet: complete with the most frequent concrete words.
  const extra = entries
    .filter((e) => e.kind === "word" && ["v", "n.m", "n.f", "adj"].includes(e.pos) && !picked.includes(e))
    .sort((a, b) => (a.frequency_rank ?? 1e6) - (b.frequency_rank ?? 1e6))
    .slice(10, 10 + (count - picked.length));
  return [...picked, ...extra];
}

export interface StoryValidation {
  ok: boolean;
  missingTargets: string[];
  problems: string[];
}

/** Structural and pedagogical validation of a generated story before it is stored. */
export function validateGeneratedStory(body: StoryBody, targets: VocabularyEntryRow[], lex: Lexicon): StoryValidation {
  const problems: string[] = [];
  const parsed = storyBodySchema.safeParse(body);
  if (!parsed.success) problems.push("Niepoprawna struktura historii.");
  const text = storyText(body);
  const found = findEntries(text, lex);
  const missingTargets = targets.filter((t) => !found.has(t.id)).map((t) => t.lemma);
  if (missingTargets.length > Math.floor(targets.length / 3)) problems.push(`Brakuje słów: ${missingTargets.join(", ")}`);
  const norm = ` ${normalize(text)} `;
  for (const g of body.glossary) {
    if (!norm.includes(` ${normalize(g.form)} `)) problems.push(`Glosariusz zawiera formę spoza tekstu: ${g.form}`);
  }
  for (const s of body.sentences) if (s.es.split(/\s+/).length > 24) problems.push("Zbyt długie zdanie.");
  return { ok: problems.length === 0, missingTargets, problems };
}

export async function storiesDueForRetell(db: Db, userId: string, now = new Date()) {
  return db.select("stories", {
    where: [eq("user_id", userId), lte("next_retell_at", now.toISOString())],
    order: [{ col: "next_retell_at" }],
  });
}

/** Which modified version should come back next for this story family. */
export function nextVariant(retellCount: number): StoryVariant {
  return VARIANT_CYCLE[retellCount % VARIANT_CYCLE.length];
}

/** Seed stories ship hand-written variants; returns one if available. */
export function seedVariant(seedId: string | null, variant: StoryVariant): (StoryBody & { tense: string }) | null {
  if (!seedId) return null;
  const seed = loadContent().stories.find((s) => s.id === seedId);
  const v = seed?.variants.find((x) => x.variant === variant);
  if (!v) return null;
  return { title: v.title, sentences: v.sentences, glossary: v.glossary, questions: v.questions, tense: v.tense };
}

/** Marks a story finished and schedules its next return. */
export async function completeStory(db: Db, story: StoryRow, now = new Date()) {
  const root = story.parent_story_id ?? story.id;
  const rootRow = root === story.id ? story : (await db.select("stories", { where: [eq("id", root)], limit: 1 }))[0];
  const count = rootRow?.retell_count ?? 0;
  const days = RETELL_INTERVALS_DAYS[Math.min(count, RETELL_INTERVALS_DAYS.length - 1)];
  await db.update("stories", [eq("id", story.id)], {
    status: "completed",
    stage_reached: 6,
    completed_at: now.toISOString(),
    ...(story.id === root ? { next_retell_at: new Date(now.getTime() + days * 86_400_000).toISOString() } : {}),
  });
  if (story.id !== root && rootRow) {
    await db.update("stories", [eq("id", root)], {
      retell_count: count + 1,
      next_retell_at: new Date(now.getTime() + RETELL_INTERVALS_DAYS[Math.min(count + 1, 3)] * 86_400_000).toISOString(),
    });
  }
}

/** Keyword check for comprehension questions (accent-insensitive). */
export function answerHasKeywords(answer: string, keywords: string[]): boolean {
  const a = ` ${normalize(answer)} `;
  return keywords.some((k) => a.includes(normalize(k)));
}

/** Deterministic retell scoring used when no AI provider is configured. */
export function basicRetellScore(text: string, targets: VocabularyEntryRow[], lex: Lexicon) {
  const found = findEntries(text, lex);
  const used = targets.filter((t) => found.has(t.id)).map((t) => t.lemma);
  const missing = targets.filter((t) => !found.has(t.id)).map((t) => t.lemma);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const coverage = targets.length ? used.length / targets.length : 0;
  return {
    score: Math.round((coverage * 0.7 + Math.min(1, words / 40) * 0.3) * 100) / 100,
    used,
    missing,
    words,
  };
}
