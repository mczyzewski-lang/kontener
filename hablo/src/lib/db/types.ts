/** Row types mirroring supabase/migrations/*.sql. Keep in sync with the SQL. */

export type Skill = "listening" | "recall" | "speaking";
export const SKILLS: Skill[] = ["listening", "recall", "speaking"];

export type PlanVariant = "quick" | "standard" | "deep";
export type StartLevel = "unknown" | "beginner" | "elementary" | "intermediate" | "advanced";
export type ConversationMode = "guided" | "natural" | "real_life" | "assessment" | "grammar";
export type PlanItemType =
  | "review"
  | "new_words"
  | "story"
  | "grammar"
  | "conversation"
  | "assessment"
  | "feedback"
  | "sprint";
export type ReviewSource =
  | "flashcard"
  | "new_words"
  | "story"
  | "conversation"
  | "grammar"
  | "onboarding"
  | "assessment"
  | "manual";

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  start_level: StartLevel;
  onboarded_at: string | null;
  created_at: string;
}

export interface LearningPreferencesRow {
  user_id: string;
  daily_minutes: number;
  plan_variant: PlanVariant;
  new_words_pace: "slow" | "normal" | "fast";
  accent: string;
  timezone: string;
  motivation: string | null;
  focus_situations: string[];
  interests: string[];
  tutor_speed: number;
  tutor_voice_id: string | null;
  hints_default: boolean;
  show_subtitles: boolean;
  show_translation: boolean;
  store_audio: boolean;
  audio_retention_days: number;
  transcript_retention_days: number | null;
  daily_cost_limit_usd: number;
  monthly_cost_limit_usd: number;
  daily_conversation_minutes_limit: number;
  updated_at: string;
}

export interface VocabularyEntryRow {
  id: string;
  owner_id: string | null;
  kind: "word" | "phrase";
  lemma: string;
  pos: string;
  translations: string[];
  collocations: string[];
  forms: string[];
  topics: string[];
  grammar: string[];
  note: string | null;
  frequency_rank: number | null;
  corpus_count: number | null;
  level: number;
  difficulty: number;
  audio_path: string | null;
  source: string;
  created_at: string;
}

export interface VocabularyExampleRow {
  id: string;
  entry_id: string;
  position: number;
  es: string;
  pl: string;
  audio_path: string | null;
}

export interface VocabularyProgressRow {
  user_id: string;
  entry_id: string;
  skill: Skill;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  correct_count: number;
  incorrect_count: number;
  assisted_count: number;
  spontaneous_uses: number;
  last_spontaneous_use_at: string | null;
  known_claimed: boolean;
  priority_boost: number;
  first_seen_at: string;
  updated_at: string;
}

export interface VocabularyReviewLogRow {
  id: string;
  user_id: string;
  entry_id: string;
  skill: Skill;
  exercise_type: string;
  source: ReviewSource;
  rating: number | null;
  correct: boolean;
  assisted: boolean;
  scheduled: boolean;
  response: string | null;
  latency_ms: number | null;
  state_before: number | null;
  due_before: string | null;
  reviewed_at: string;
}

export interface WordAssociationRow {
  id: string;
  user_id: string;
  entry_id: string;
  scene: string;
  source: "ai" | "user";
  created_at: string;
}

export interface GrammarTopicRow {
  id: string;
  stage: number;
  title: string;
  subtitle: string;
  level: number;
  prerequisites: string[];
  content: unknown;
}

export type GrammarStatus = "locked" | "available" | "learning" | "practiced" | "mastered";
export interface GrammarProgressRow {
  user_id: string;
  topic_id: string;
  status: GrammarStatus;
  mastery: number;
  attempts: number;
  correct: number;
  conversation_uses: number;
  conversation_errors: number;
  lesson_completed_at: string | null;
  last_practiced_at: string | null;
  next_review_at: string | null;
  updated_at: string;
}

export interface StoryRow {
  id: string;
  user_id: string;
  seed_id: string | null;
  parent_story_id: string | null;
  variant: "original" | "past" | "extended" | "perspective" | "future" | "own";
  source: "seed" | "ai" | "user";
  title: string;
  level: number;
  tense: string;
  body: unknown;
  target_entry_ids: string[];
  status: "new" | "in_progress" | "completed";
  stage_reached: number;
  retell_count: number;
  next_retell_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface StoryVocabularyRow {
  story_id: string;
  entry_id: string;
  user_id: string;
  is_target: boolean;
}

export interface StoryAttemptRow {
  id: string;
  user_id: string;
  story_id: string;
  kind: "questions" | "retell" | "own_story" | "lookup";
  input_text: string | null;
  result: unknown;
  score: number | null;
  created_at: string;
}

export interface ConversationScenarioRow {
  id: string;
  title: string;
  description: string;
  default_mode: string;
  level: number;
  content: unknown;
}

export interface ConversationSessionRow {
  id: string;
  user_id: string;
  scenario_id: string | null;
  grammar_topic_id: string | null;
  mode: ConversationMode;
  channel: "voice" | "text";
  elevenlabs_conversation_id: string | null;
  status: "active" | "ended" | "analyzed" | "failed";
  plan_item_id: string | null;
  context: unknown;
  hints_used: number;
  repeats_used: number;
  translations_used: number;
  not_understood_count: number;
  started_at: string;
  ended_at: string | null;
  duration_secs: number | null;
  user_speaking_secs: number | null;
  audio_path: string | null;
  audio_expires_at: string | null;
  error: string | null;
}

export interface ConversationTurnRow {
  id: string;
  session_id: string;
  user_id: string;
  idx: number;
  role: "user" | "agent" | "action";
  text: string;
  time_in_call_secs: number | null;
  assisted: boolean;
  action: string | null;
}

export interface ConversationFeedbackRow {
  session_id: string;
  user_id: string;
  summary: string;
  mistakes: unknown;
  missing_words: unknown;
  strengths: unknown;
  words_used: unknown;
  grammar_used: unknown;
  comprehension_issues: unknown;
  next_exercise: unknown;
  scores: unknown;
  analysis_source: "ai" | "basic" | "test";
  created_at: string;
}

export interface LearningTaskRow {
  id: string;
  user_id: string;
  type: string;
  goal: string;
  est_minutes: number;
  entry_ids: string[];
  grammar_topic_ids: string[];
  scenario_id: string | null;
  priority: number;
  status: "pending" | "scheduled" | "done" | "dismissed";
  source: string;
  payload: unknown;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DailyPlanRow {
  id: string;
  user_id: string;
  plan_date: string;
  variant: PlanVariant;
  target_minutes: number;
  rationale: unknown;
  inputs: unknown;
  status: "active" | "completed";
  created_at: string;
  completed_at: string | null;
}

export interface DailyPlanItemRow {
  id: string;
  plan_id: string;
  user_id: string;
  position: number;
  type: PlanItemType;
  title: string;
  goal: string;
  est_minutes: number;
  entry_ids: string[];
  grammar_topic_ids: string[];
  priority: number;
  status: "pending" | "in_progress" | "done" | "skipped";
  payload: unknown;
  task_id: string | null;
  result: unknown;
  started_at: string | null;
  completed_at: string | null;
}

export interface SprintRow {
  id: string;
  user_id: string;
  goal_text: string;
  summary: string;
  scenario_ids: string[];
  entry_ids: string[];
  starts_on: string;
  ends_on: string;
  status: "active" | "finished" | "cancelled";
  created_at: string;
}

export interface WeeklyAssessmentRow {
  id: string;
  user_id: string;
  week_start: string;
  session_id: string | null;
  scores: unknown;
  report: unknown;
  created_at: string;
}

export type MemoryKind =
  | "error_pattern"
  | "weak_construction"
  | "strength"
  | "interest"
  | "goal"
  | "fact"
  | "mastered_scenario"
  | "comprehension_issue";
export interface LearnerMemoryRow {
  id: string;
  user_id: string;
  kind: MemoryKind;
  key: string;
  content: string;
  evidence_count: number;
  weight: number;
  first_seen_at: string;
  last_seen_at: string;
}

export interface LearningEventRow {
  id: string;
  user_id: string;
  type: string;
  minutes: number;
  payload: unknown;
  local_date: string;
  created_at: string;
}

export interface ApiUsageLogRow {
  id: string;
  user_id: string | null;
  provider: "elevenlabs" | "anthropic";
  operation: string;
  units: number;
  unit_type: string;
  est_cost_usd: number;
  meta: unknown;
  created_at: string;
}

export type ThoughtContext = "morning" | "end_of_work" | "new_idea" | "tension" | "family" | "rest" | "travel";

/** A personal category of thoughts ("Moje myśli"). */
export interface ThoughtCategoryRow {
  user_id: string;
  key: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
}

/**
 * A personal thought or reflective question. Imported entries keep a stable
 * `origin_id`; once the learner edits an entry (`edited = true`) re-imports
 * never overwrite it.
 */
export interface ThoughtRow {
  id: string;
  user_id: string;
  kind: "thought" | "question";
  origin_id: string | null;
  category_key: string | null;
  text: string;
  meta: Record<string, unknown>;
  contexts: ThoughtContext[];
  featured: boolean;
  favorite: boolean;
  hidden: boolean;
  edited: boolean;
  origin_hash: string | null;
  last_shown_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tables {
  profiles: ProfileRow;
  learning_preferences: LearningPreferencesRow;
  vocabulary_entries: VocabularyEntryRow;
  vocabulary_examples: VocabularyExampleRow;
  vocabulary_progress: VocabularyProgressRow;
  vocabulary_review_logs: VocabularyReviewLogRow;
  word_associations: WordAssociationRow;
  grammar_topics: GrammarTopicRow;
  grammar_progress: GrammarProgressRow;
  stories: StoryRow;
  story_vocabulary: StoryVocabularyRow;
  story_attempts: StoryAttemptRow;
  conversation_scenarios: ConversationScenarioRow;
  conversation_sessions: ConversationSessionRow;
  conversation_turns: ConversationTurnRow;
  conversation_feedback: ConversationFeedbackRow;
  learning_tasks: LearningTaskRow;
  daily_plans: DailyPlanRow;
  daily_plan_items: DailyPlanItemRow;
  sprints: SprintRow;
  weekly_assessments: WeeklyAssessmentRow;
  learner_memory: LearnerMemoryRow;
  learning_events: LearningEventRow;
  api_usage_logs: ApiUsageLogRow;
  thought_categories: ThoughtCategoryRow;
  thoughts: ThoughtRow;
}
export type TableName = keyof Tables;

/**
 * Table metadata used by the local (demo/test) store to emulate primary keys,
 * unique constraints and column defaults of the Postgres schema.
 */
export const TABLE_META: Record<TableName, { pk: string[]; unique?: string[][]; generatedId?: boolean }> = {
  profiles: { pk: ["id"] },
  learning_preferences: { pk: ["user_id"] },
  vocabulary_entries: { pk: ["id"] },
  vocabulary_examples: { pk: ["id"], unique: [["entry_id", "position"]], generatedId: true },
  vocabulary_progress: { pk: ["user_id", "entry_id", "skill"] },
  vocabulary_review_logs: { pk: ["id"], generatedId: true },
  word_associations: { pk: ["id"], unique: [["user_id", "entry_id", "source"]], generatedId: true },
  grammar_topics: { pk: ["id"] },
  grammar_progress: { pk: ["user_id", "topic_id"] },
  stories: { pk: ["id"], unique: [["user_id", "seed_id", "variant"]], generatedId: true },
  story_vocabulary: { pk: ["story_id", "entry_id"] },
  story_attempts: { pk: ["id"], generatedId: true },
  conversation_scenarios: { pk: ["id"] },
  conversation_sessions: { pk: ["id"], unique: [["elevenlabs_conversation_id"]], generatedId: true },
  conversation_turns: { pk: ["id"], unique: [["session_id", "idx"]], generatedId: true },
  conversation_feedback: { pk: ["session_id"] },
  learning_tasks: { pk: ["id"], generatedId: true },
  daily_plans: { pk: ["id"], unique: [["user_id", "plan_date"]], generatedId: true },
  daily_plan_items: { pk: ["id"], unique: [["plan_id", "position"]], generatedId: true },
  sprints: { pk: ["id"], generatedId: true },
  weekly_assessments: { pk: ["id"], unique: [["user_id", "week_start"]], generatedId: true },
  learner_memory: { pk: ["id"], unique: [["user_id", "kind", "key"]], generatedId: true },
  learning_events: { pk: ["id"], generatedId: true },
  api_usage_logs: { pk: ["id"], generatedId: true },
  thought_categories: { pk: ["user_id", "key"] },
  thoughts: { pk: ["id"], unique: [["user_id", "origin_id"]], generatedId: true },
};

/** Tables that are user-owned and therefore exported / deleted with the account data. */
export const USER_TABLES: TableName[] = [
  "learning_preferences",
  "vocabulary_progress",
  "vocabulary_review_logs",
  "word_associations",
  "grammar_progress",
  "stories",
  "story_vocabulary",
  "story_attempts",
  "conversation_sessions",
  "conversation_turns",
  "conversation_feedback",
  "learning_tasks",
  "daily_plans",
  "daily_plan_items",
  "sprints",
  "weekly_assessments",
  "learner_memory",
  "learning_events",
  "api_usage_logs",
  "thought_categories",
  "thoughts",
];
