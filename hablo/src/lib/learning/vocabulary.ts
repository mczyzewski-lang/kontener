import type { Db } from "@/lib/db/db";
import { eq, inList, isNull } from "@/lib/db/db";
import type { VocabularyEntryRow, VocabularyExampleRow, VocabularyProgressRow } from "@/lib/db/types";
import { buildLexicon, type Lexicon } from "./text";
import { topicsFor } from "./situations";

/**
 * Vocabulary Engine — the entry library (shared + user-added), example
 * sentences and selection of what to learn next.
 */

export async function getEntries(db: Db, userId: string): Promise<VocabularyEntryRow[]> {
  const shared = await db.select("vocabulary_entries", { where: [isNull("owner_id")] });
  const own = await db.select("vocabulary_entries", { where: [eq("owner_id", userId)] });
  return [...shared, ...own];
}

export async function getExamples(db: Db, entryIds: string[]): Promise<Map<string, VocabularyExampleRow[]>> {
  const map = new Map<string, VocabularyExampleRow[]>();
  if (!entryIds.length) return map;
  for (let i = 0; i < entryIds.length; i += 200) {
    const rows = await db.select("vocabulary_examples", {
      where: [inList("entry_id", entryIds.slice(i, i + 200))],
      order: [{ col: "position" }],
    });
    for (const r of rows) {
      if (!map.has(r.entry_id)) map.set(r.entry_id, []);
      map.get(r.entry_id)!.push(r);
    }
  }
  return map;
}

let lexCache: { key: string; lex: Lexicon } | null = null;
export function lexiconFor(entries: VocabularyEntryRow[]): Lexicon {
  const key = `${entries.length}:${entries.at(-1)?.id ?? ""}`;
  if (!lexCache || lexCache.key !== key) lexCache = { key, lex: buildLexicon(entries) };
  return lexCache.lex;
}

export async function getProgress(db: Db, userId: string): Promise<VocabularyProgressRow[]> {
  return db.select("vocabulary_progress", { where: [eq("user_id", userId)] });
}

/**
 * Picks new entries deterministically: sprint words first, then the most
 * frequent unseen words (topic matches from the learner's goals get a small
 * boost within the current frequency band), with one set phrase per ~4 words.
 */
export function selectNewEntries(
  entries: VocabularyEntryRow[],
  progress: VocabularyProgressRow[],
  count: number,
  opts: { focusSituations?: string[]; priorityIds?: string[] } = {},
): string[] {
  if (count <= 0) return [];
  const seen = new Set(progress.map((p) => p.entry_id));
  const unseen = entries.filter((e) => !seen.has(e.id));
  const chosen: string[] = [];
  for (const id of opts.priorityIds ?? []) {
    if (chosen.length >= count) break;
    if (!seen.has(id) && unseen.some((e) => e.id === id) && !chosen.includes(id)) chosen.push(id);
  }
  const focus = topicsFor(opts.focusSituations ?? []);
  // Function words (de, que, el…) are learned through sentences and phrases, so as
  // standalone flashcards they come a bit later than equally frequent content words.
  const FUNCTION_POS = new Set(["art", "prep", "conj", "pron", "det"]);
  const effRank = (e: VocabularyEntryRow) => (e.frequency_rank ?? 1e6) + (FUNCTION_POS.has(e.pos) ? 150 : 0);
  const words = unseen
    .filter((e) => e.kind === "word" && !chosen.includes(e.id))
    .sort((a, b) => effRank(a) - effRank(b) || a.id.localeCompare(b.id));
  // Within the next band of ~40 frequent words, prefer those matching the learner's situations.
  const band = words.slice(0, 40);
  const score = (e: VocabularyEntryRow, i: number) => i - (e.topics.some((t) => focus.has(t)) ? 15 : 0);
  const orderedBand = band.map((e, i) => ({ e, s: score(e, i) })).sort((a, b) => a.s - b.s).map((x) => x.e);
  const queue = [...orderedBand, ...words.slice(40)];
  const phrases = unseen
    .filter((e) => e.kind === "phrase" && !chosen.includes(e.id))
    .sort((a, b) => {
      const fa = a.topics.some((t) => focus.has(t)) ? 0 : 1;
      const fb = b.topics.some((t) => focus.has(t)) ? 0 : 1;
      return fa - fb || (a.frequency_rank ?? 0) - (b.frequency_rank ?? 0) || a.id.localeCompare(b.id);
    });
  let wi = 0;
  let pi = 0;
  while (chosen.length < count && (wi < queue.length || pi < phrases.length)) {
    const phraseTurn = (chosen.length + 1) % 4 === 0;
    if (phraseTurn && pi < phrases.length) chosen.push(phrases[pi++].id);
    else if (wi < queue.length) chosen.push(queue[wi++].id);
    else chosen.push(phrases[pi++].id);
  }
  return chosen;
}

/** Display label with article for nouns: "el coche", "la casa". */
export function displayLemma(e: Pick<VocabularyEntryRow, "lemma" | "pos" | "kind">): string {
  if (e.kind !== "word") return e.lemma;
  if (/^[A-ZÁÉÍÓÚÑ]/.test(e.lemma)) return e.lemma; // proper nouns: España, Polonia
  if (e.pos === "n.m") return `el ${e.lemma}`;
  // Feminine nouns starting with stressed a- take "el" in the singular: el agua.
  if (e.pos === "n.f") return /^(agua|hambre|alma|aula)$/i.test(e.lemma) ? `el ${e.lemma}` : `la ${e.lemma}`;
  return e.lemma;
}

export const POS_LABEL: Record<string, string> = {
  v: "czasownik",
  "n.m": "rzeczownik (r. męski)",
  "n.f": "rzeczownik (r. żeński)",
  "n.mf": "rzeczownik",
  adj: "przymiotnik",
  adv: "przysłówek",
  pron: "zaimek",
  prep: "przyimek",
  conj: "spójnik",
  det: "określnik",
  art: "rodzajnik",
  interj: "wykrzyknik",
  num: "liczebnik",
  phrase: "zwrot",
};
