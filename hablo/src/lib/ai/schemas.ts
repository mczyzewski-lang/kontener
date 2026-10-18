import { z } from "zod";
import { storyBodySchema } from "@/lib/content/schemas";

/**
 * Output schemas for every AI task. The model is constrained with structured
 * outputs and the result is validated again here before anything is stored.
 * Keep these JSON-schema friendly (no regex/refinements) — stricter checks
 * live in lib/ai/validate.ts.
 */

export const answerEvaluationSchema = z.object({
  verdict: z.enum(["correct", "minor", "incorrect"]),
  meaning_ok: z.boolean(),
  construction_ok: z.boolean().nullable(),
  used_target: z.boolean(),
  corrected: z.string(),
  explanation_pl: z.string(),
});
export type AnswerEvaluation = z.infer<typeof answerEvaluationSchema>;

export const generatedStorySchema = storyBodySchema.extend({
  used_target_lemmas: z.array(z.string()),
});
export type GeneratedStory = z.infer<typeof generatedStorySchema>;

export const mistakeSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  explanation_pl: z.string(),
  category: z.enum(["grammar", "vocabulary", "word_order", "agreement", "register", "pronunciation_suspect", "other"]),
  severity: z.enum(["minor", "major"]),
  grammar_topic_id: z.string().nullable(),
});
export type Mistake = z.infer<typeof mistakeSchema>;

export const retellEvaluationSchema = z.object({
  summary_pl: z.string(),
  score: z.number(),
  covered_events: z.number(),
  total_events: z.number(),
  used_target_lemmas: z.array(z.string()),
  missing_target_lemmas: z.array(z.string()),
  mistakes: z.array(mistakeSchema),
  strengths_pl: z.array(z.string()),
});
export type RetellEvaluation = z.infer<typeof retellEvaluationSchema>;

export const conversationAnalysisSchema = z.object({
  summary_pl: z.string(),
  mistakes: z.array(mistakeSchema),
  missing_words: z.array(
    z.object({
      pl: z.string(),
      es: z.string(),
      lemma: z.string(),
      context_pl: z.string(),
    }),
  ),
  strengths_pl: z.array(z.string()),
  spontaneous_lemmas: z.array(z.string()),
  grammar_used: z.array(
    z.object({
      topic_id: z.string(),
      correct: z.boolean(),
      example: z.string(),
    }),
  ),
  comprehension_issues: z.array(z.object({ agent_text: z.string(), note_pl: z.string() })),
  next_exercise: z.object({
    type: z.enum(["review", "grammar", "story", "conversation"]),
    reason_pl: z.string(),
    grammar_topic_id: z.string().nullable(),
    scenario_id: z.string().nullable(),
  }),
  scores: z.object({
    comprehension: z.number(),
    fluency: z.number(),
    grammar: z.number(),
    vocabulary: z.number(),
    task_completion: z.number(),
  }),
  learner_notes: z.array(
    z.object({
      kind: z.enum(["error_pattern", "weak_construction", "strength", "interest", "goal", "fact", "comprehension_issue"]),
      key: z.string(),
      content: z.string(),
    }),
  ),
  task_completed: z.boolean(),
});
export type ConversationAnalysis = z.infer<typeof conversationAnalysisSchema>;

export const mnemonicSchema = z.object({
  scene_pl: z.string(),
  sound_link_pl: z.string(),
});
export type Mnemonic = z.infer<typeof mnemonicSchema>;

export const sprintPlanSchema = z.object({
  summary_pl: z.string(),
  days: z.number(),
  scenario_ids: z.array(z.string()),
  phrase_ids: z.array(z.string()),
  focus_lemmas: z.array(z.string()),
});
export type SprintPlan = z.infer<typeof sprintPlanSchema>;

export const tutorReplySchema = z.object({
  reply_es: z.string(),
  translation_pl: z.string(),
  end_conversation: z.boolean(),
});
export type TutorReply = z.infer<typeof tutorReplySchema>;

export const translationSchema = z.object({ pl: z.string() });
export type Translation = z.infer<typeof translationSchema>;
