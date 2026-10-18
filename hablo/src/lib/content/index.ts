import { z } from "zod";
import vocabularyJson from "../../../content/vocabulary/vocabulary.json";
import grammarJson from "../../../content/grammar/topics.json";
import scenariosJson from "../../../content/scenarios/scenarios.json";
import storiesJson from "../../../content/stories/seed-stories.json";
import {
  grammarTopicSchema,
  scenarioSchema,
  seedStorySchema,
  vocabularyEntrySchema,
  type GrammarTopicContent,
  type ScenarioContent,
  type SeedStory,
  type VocabularyEntryContent,
} from "./schemas";

/**
 * Static educational content bundled with the app. It is validated once on
 * first access; invalid content fails loudly instead of teaching bad Spanish.
 * The same data is seeded into the database (see lib/db/seed.ts) so progress
 * rows have real foreign keys and the library can be extended with user words.
 */
let cache: {
  vocabulary: VocabularyEntryContent[];
  grammar: GrammarTopicContent[];
  scenarios: ScenarioContent[];
  stories: SeedStory[];
} | null = null;

export function loadContent() {
  if (!cache) {
    cache = {
      vocabulary: z.array(vocabularyEntrySchema).parse(vocabularyJson),
      grammar: z.array(grammarTopicSchema).parse(grammarJson),
      scenarios: z.array(scenarioSchema).parse(scenariosJson),
      stories: z.array(seedStorySchema).parse(storiesJson),
    };
  }
  return cache;
}

export function getScenario(id: string): ScenarioContent | undefined {
  return loadContent().scenarios.find((s) => s.id === id);
}

export function getGrammarTopic(id: string): GrammarTopicContent | undefined {
  return loadContent().grammar.find((g) => g.id === id);
}
