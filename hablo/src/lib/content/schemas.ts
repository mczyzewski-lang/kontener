import { z } from "zod";

/**
 * Schemas for educational content. Content lives in /content as data (JSON),
 * separate from application code, and is validated both at build time
 * (scripts/validate-content.ts) and when seeded into the database.
 */

export const GRAMMAR_TOPIC_IDS = [
  "g01-basics",
  "g02-present",
  "g03-ser-estar",
  "g04-tener-haber-gustar",
  "g05-ir-a",
  "g06-perfecto",
  "g07-indefinido",
  "g08-imperfecto",
  "g09-pasados",
  "g10-imperativo-pronombres",
  "g11-subjuntivo",
] as const;
export type GrammarTopicId = (typeof GRAMMAR_TOPIC_IDS)[number];

export const exampleSchema = z.object({
  es: z.string().min(1),
  pl: z.string().min(1),
});
export type Example = z.infer<typeof exampleSchema>;

export const vocabularyEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["word", "phrase"]),
  lemma: z.string().min(1),
  pos: z.string().min(1),
  translations: z.array(z.string().min(1)).min(1),
  examples: z.array(exampleSchema).min(1),
  collocations: z.array(z.string()),
  forms: z.array(z.string()),
  topics: z.array(z.string()),
  grammar: z.array(z.enum(GRAMMAR_TOPIC_IDS)),
  note: z.string().nullable(),
  frequency_rank: z.number().int().positive().nullable(),
  corpus_count: z.number().int().nonnegative().nullable(),
  level: z.number().int().min(1).max(5),
  difficulty: z.number().int().min(1).max(5),
  source: z.string(),
  components: z.array(z.string()).optional(),
});
export type VocabularyEntryContent = z.infer<typeof vocabularyEntrySchema>;

export const grammarExerciseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    prompt_pl: z.string(),
    sentence: z.string(),
    options: z.array(z.string()).min(2),
    answer: z.string(),
    explanation_pl: z.string(),
    difficulty: z.number().int().min(1).max(3),
  }),
  z.object({
    type: z.literal("fill"),
    prompt_pl: z.string(),
    sentence: z.string().includes("___"),
    answer: z.string(),
    accepted: z.array(z.string()).default([]),
    explanation_pl: z.string(),
    difficulty: z.number().int().min(1).max(3),
  }),
  z.object({
    type: z.literal("translate"),
    prompt_pl: z.string(),
    source_pl: z.string(),
    answer: z.string(),
    accepted: z.array(z.string()).default([]),
    explanation_pl: z.string(),
    difficulty: z.number().int().min(1).max(3),
  }),
  z.object({
    type: z.literal("speak"),
    prompt_pl: z.string(),
    question_es: z.string(),
    model_answer: z.string(),
    pattern: z.string(),
    explanation_pl: z.string(),
    difficulty: z.number().int().min(1).max(3),
  }),
]);
export type GrammarExercise = z.infer<typeof grammarExerciseSchema>;

export const grammarTopicSchema = z.object({
  id: z.enum(GRAMMAR_TOPIC_IDS),
  stage: z.number().int().min(1).max(11),
  title: z.string(),
  subtitle: z.string(),
  level: z.number().int().min(1).max(5),
  prerequisites: z.array(z.enum(GRAMMAR_TOPIC_IDS)),
  explanation: z.array(z.string()).min(1).max(8),
  examples: z.array(exampleSchema.extend({ note: z.string().optional() })).min(3),
  exercises: z.array(grammarExerciseSchema).min(5),
  mini_conversation: z.object({
    intro_pl: z.string(),
    questions: z
      .array(
        z.object({
          es: z.string(),
          pl: z.string(),
          expects_pl: z.string(),
          pattern: z.string(),
        }),
      )
      .min(3),
  }),
  agent_focus: z.string(),
});
export type GrammarTopicContent = z.infer<typeof grammarTopicSchema>;

export const scenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  description: z.string(),
  situation_es: z.string(),
  character_name: z.string(),
  character_role: z.string(),
  persona: z.string(),
  first_message: z.string(),
  default_mode: z.enum(["guided", "natural", "real_life"]),
  level: z.number().int().min(1).max(5),
  voice_hint: z.enum(["female", "male"]),
  goals_pl: z.array(z.string()).min(1),
  key_phrases: z.array(z.string()),
  topics: z.array(z.string()),
  grammar: z.array(z.enum(GRAMMAR_TOPIC_IDS)),
  keywords_pl: z.array(z.string()),
});
export type ScenarioContent = z.infer<typeof scenarioSchema>;

export const storySentenceSchema = z.object({ es: z.string().min(1), pl: z.string().min(1) });
export const storyQuestionSchema = z.object({
  q_es: z.string(),
  q_pl: z.string(),
  answer_es: z.string(),
  keywords: z.array(z.string()).min(1),
});
export const glossaryItemSchema = z.object({
  form: z.string(),
  lemma: z.string(),
  pl: z.string(),
  is_new: z.boolean(),
});

export const storyBodySchema = z.object({
  title: z.string().min(1).max(80),
  sentences: z.array(storySentenceSchema).min(3).max(16),
  glossary: z.array(glossaryItemSchema).max(40),
  questions: z.array(storyQuestionSchema).min(2).max(6),
});
export type StoryBody = z.infer<typeof storyBodySchema>;

export const seedStorySchema = storyBodySchema.extend({
  id: z.string().regex(/^[a-z0-9-]+$/),
  level: z.number().int().min(1).max(5),
  tense: z.enum(["present", "past", "future", "mixed"]),
  target_lemmas: z.array(z.string()).min(3),
  topics: z.array(z.string()),
  variants: z
    .array(
      storyBodySchema.extend({
        variant: z.enum(["past", "extended", "perspective", "future"]),
        tense: z.enum(["present", "past", "future", "mixed"]),
      }),
    )
    .default([]),
});
export type SeedStory = z.infer<typeof seedStorySchema>;
