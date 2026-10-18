import { loadContent } from "@/lib/content";
import type { Db } from "./db";
import { eq, isNull } from "./db";
import type { ConversationScenarioRow, GrammarTopicRow, VocabularyEntryRow, VocabularyExampleRow } from "./types";

/**
 * Seeds (or refreshes) the shared content tables from /content. Idempotent:
 * uses upserts keyed by stable content ids, so re-running after editing the
 * content files updates rows without touching user progress.
 */
export async function seedContent(db: Db): Promise<{ entries: number; topics: number; scenarios: number }> {
  const c = loadContent();
  const entries: Partial<VocabularyEntryRow>[] = c.vocabulary.map((v) => ({
    id: v.id,
    owner_id: null,
    kind: v.kind,
    lemma: v.lemma,
    pos: v.pos,
    translations: v.translations,
    collocations: v.collocations,
    forms: v.forms,
    topics: v.topics,
    grammar: v.grammar,
    note: v.note,
    frequency_rank: v.frequency_rank,
    corpus_count: v.corpus_count,
    level: v.level,
    difficulty: v.difficulty,
    source: v.source,
  }));
  for (let i = 0; i < entries.length; i += 500) {
    await db.upsert("vocabulary_entries", entries.slice(i, i + 500));
  }
  const examples: Partial<VocabularyExampleRow>[] = c.vocabulary.flatMap((v) =>
    v.examples.map((e, position) => ({ entry_id: v.id, position, es: e.es, pl: e.pl })),
  );
  for (let i = 0; i < examples.length; i += 500) {
    await db.upsert("vocabulary_examples", examples.slice(i, i + 500), { onConflict: ["entry_id", "position"] });
  }
  const topics: Partial<GrammarTopicRow>[] = c.grammar.map((g) => ({
    id: g.id,
    stage: g.stage,
    title: g.title,
    subtitle: g.subtitle,
    level: g.level,
    prerequisites: g.prerequisites,
    content: g,
  }));
  await db.upsert("grammar_topics", topics);
  const scenarios: Partial<ConversationScenarioRow>[] = c.scenarios.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    default_mode: s.default_mode,
    level: s.level,
    content: s,
  }));
  await db.upsert("conversation_scenarios", scenarios);
  return { entries: entries.length, topics: topics.length, scenarios: scenarios.length };
}

let seededOnce = false;

/** Ensures content exists; cheap after the first call in a process. */
export async function ensureContentSeeded(db: Db): Promise<boolean> {
  if (seededOnce) return true;
  const c = loadContent();
  const have = await db.count("vocabulary_entries", [isNull("owner_id")]);
  const haveTopics = await db.count("grammar_topics", []);
  const haveScenario = await db.count("conversation_scenarios", [eq("id", c.scenarios.at(-1)!.id)]);
  if (have >= c.vocabulary.length && haveTopics >= c.grammar.length && haveScenario) {
    seededOnce = true;
    return true;
  }
  return false;
}

export function resetSeedCacheForTests() {
  seededOnce = false;
}
