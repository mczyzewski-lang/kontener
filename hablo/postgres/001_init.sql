-- Hablo — schema for a plain PostgreSQL database (e.g. Railway Postgres).
-- Applied automatically on first start (see src/lib/db/postgres-migrate.ts).
-- Same tables as supabase/migrations/20261018000000_init.sql, without the
-- Supabase-specific parts: there is no auth.users (the app signs in the one
-- allowed e-mail itself), no RLS (the app is the only database client and
-- filters every query by user_id) and no Storage (binary files live in
-- public.blobs).

-- ---------------------------------------------------------------------------
-- Profile & preferences
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key,
  email text not null,
  display_name text,
  start_level text not null default 'unknown'
    check (start_level in ('unknown', 'beginner', 'elementary', 'intermediate', 'advanced')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_preferences (
  user_id uuid primary key,
  daily_minutes int not null default 30 check (daily_minutes between 5 and 180),
  plan_variant text not null default 'standard' check (plan_variant in ('quick', 'standard', 'deep')),
  new_words_pace text not null default 'normal' check (new_words_pace in ('slow', 'normal', 'fast')),
  accent text not null default 'castellano',
  timezone text not null default 'Europe/Warsaw',
  motivation text,
  focus_situations text[] not null default '{}',
  interests text[] not null default '{}',
  tutor_speed numeric(3, 2) not null default 0.9 check (tutor_speed between 0.7 and 1.2),
  tutor_voice_id text,
  hints_default boolean not null default true,
  show_subtitles boolean not null default true,
  show_translation boolean not null default false,
  store_audio boolean not null default false,
  audio_retention_days int not null default 30 check (audio_retention_days between 1 and 365),
  transcript_retention_days int check (transcript_retention_days is null or transcript_retention_days between 7 and 3650),
  daily_cost_limit_usd numeric(8, 2) not null default 3.00,
  monthly_cost_limit_usd numeric(8, 2) not null default 40.00,
  daily_conversation_minutes_limit int not null default 40,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vocabulary (words and phrases share one table: kind = word | phrase)
-- owner_id null = shared library seeded from /content; otherwise a user word.
-- ---------------------------------------------------------------------------
create table if not exists public.vocabulary_entries (
  id text primary key,
  owner_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('word', 'phrase')),
  lemma text not null,
  pos text not null,
  translations text[] not null check (array_length(translations, 1) >= 1),
  collocations text[] not null default '{}',
  forms text[] not null default '{}',
  topics text[] not null default '{}',
  grammar text[] not null default '{}',
  note text,
  frequency_rank int,
  corpus_count int,
  level smallint not null default 1 check (level between 1 and 5),
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  audio_path text,
  source text not null default 'curated',
  created_at timestamptz not null default now()
);
create unique index if not exists vocabulary_entries_unique_lemma
  on public.vocabulary_entries (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(lemma), pos);
create index if not exists vocabulary_entries_rank on public.vocabulary_entries (frequency_rank);

create table if not exists public.vocabulary_examples (
  id uuid primary key default gen_random_uuid(),
  entry_id text not null references public.vocabulary_entries (id) on delete cascade,
  position smallint not null default 0,
  es text not null,
  pl text not null,
  audio_path text,
  unique (entry_id, position)
);

create or replace view public.phrases as
  select * from public.vocabulary_entries where kind = 'phrase';

-- One FSRS card per (user, entry, skill): recognition, recall and speaking are
-- scheduled independently.
create table if not exists public.vocabulary_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_id text not null references public.vocabulary_entries (id) on delete cascade,
  skill text not null check (skill in ('listening', 'recall', 'speaking')),
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days int not null default 0,
  scheduled_days int not null default 0,
  learning_steps int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz,
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  assisted_count int not null default 0,
  spontaneous_uses int not null default 0,
  last_spontaneous_use_at timestamptz,
  known_claimed boolean not null default false,
  priority_boost smallint not null default 0,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id, skill)
);
create index if not exists vocabulary_progress_due on public.vocabulary_progress (user_id, due);

create table if not exists public.vocabulary_review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_id text not null references public.vocabulary_entries (id) on delete cascade,
  skill text not null check (skill in ('listening', 'recall', 'speaking')),
  exercise_type text not null,
  source text not null check (source in ('flashcard', 'new_words', 'story', 'conversation', 'grammar', 'onboarding', 'assessment', 'manual')),
  rating smallint check (rating between 1 and 4),
  correct boolean not null,
  assisted boolean not null default false,
  scheduled boolean not null default true,
  response text,
  latency_ms int,
  state_before smallint,
  due_before timestamptz,
  reviewed_at timestamptz not null default now()
);
create index if not exists vocabulary_review_logs_user_time on public.vocabulary_review_logs (user_id, reviewed_at desc);

create table if not exists public.word_associations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_id text not null references public.vocabulary_entries (id) on delete cascade,
  scene text not null,
  source text not null check (source in ('ai', 'user')),
  created_at timestamptz not null default now(),
  unique (user_id, entry_id, source)
);

-- ---------------------------------------------------------------------------
-- Grammar
-- ---------------------------------------------------------------------------
create table if not exists public.grammar_topics (
  id text primary key,
  stage smallint not null unique,
  title text not null,
  subtitle text not null,
  level smallint not null,
  prerequisites text[] not null default '{}',
  content jsonb not null
);

create table if not exists public.grammar_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id text not null references public.grammar_topics (id) on delete cascade,
  status text not null default 'locked' check (status in ('locked', 'available', 'learning', 'practiced', 'mastered')),
  mastery double precision not null default 0 check (mastery between 0 and 1),
  attempts int not null default 0,
  correct int not null default 0,
  conversation_uses int not null default 0,
  conversation_errors int not null default 0,
  lesson_completed_at timestamptz,
  last_practiced_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Stories
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  seed_id text,
  parent_story_id uuid references public.stories (id) on delete set null,
  variant text not null default 'original' check (variant in ('original', 'past', 'extended', 'perspective', 'future', 'own')),
  source text not null check (source in ('seed', 'ai', 'user')),
  title text not null,
  level smallint not null default 1,
  tense text not null default 'present',
  body jsonb not null,
  target_entry_ids text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'in_progress', 'completed')),
  stage_reached smallint not null default 0,
  retell_count int not null default 0,
  next_retell_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, seed_id, variant)
);

create table if not exists public.story_vocabulary (
  story_id uuid not null references public.stories (id) on delete cascade,
  entry_id text not null references public.vocabulary_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_target boolean not null default true,
  primary key (story_id, entry_id)
);

create table if not exists public.story_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  kind text not null check (kind in ('questions', 'retell', 'own_story', 'lookup')),
  input_text text,
  result jsonb not null default '{}',
  score double precision,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_scenarios (
  id text primary key,
  title text not null,
  description text not null,
  default_mode text not null,
  level smallint not null,
  content jsonb not null
);

create table if not exists public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scenario_id text references public.conversation_scenarios (id) on delete set null,
  grammar_topic_id text references public.grammar_topics (id) on delete set null,
  mode text not null check (mode in ('guided', 'natural', 'real_life', 'assessment', 'grammar')),
  channel text not null check (channel in ('voice', 'text')),
  elevenlabs_conversation_id text unique,
  status text not null default 'active' check (status in ('active', 'ended', 'analyzed', 'failed')),
  plan_item_id uuid,
  context jsonb not null default '{}',
  hints_used int not null default 0,
  repeats_used int not null default 0,
  translations_used int not null default 0,
  not_understood_count int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_secs int,
  user_speaking_secs int,
  audio_path text,
  audio_expires_at timestamptz,
  error text
);
create index if not exists conversation_sessions_user_time on public.conversation_sessions (user_id, started_at desc);

create table if not exists public.conversation_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.conversation_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  idx int not null,
  role text not null check (role in ('user', 'agent', 'action')),
  text text not null,
  time_in_call_secs double precision,
  assisted boolean not null default false,
  action text,
  unique (session_id, idx)
);

create table if not exists public.conversation_feedback (
  session_id uuid primary key references public.conversation_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary text not null,
  mistakes jsonb not null default '[]',
  missing_words jsonb not null default '[]',
  strengths jsonb not null default '[]',
  words_used jsonb not null default '[]',
  grammar_used jsonb not null default '[]',
  comprehension_issues jsonb not null default '[]',
  next_exercise jsonb,
  scores jsonb,
  analysis_source text not null check (analysis_source in ('ai', 'basic', 'test')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Planning: backlog tasks -> daily plan -> plan items
-- ---------------------------------------------------------------------------
create table if not exists public.learning_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  goal text not null,
  est_minutes smallint not null default 3,
  entry_ids text[] not null default '{}',
  grammar_topic_ids text[] not null default '{}',
  scenario_id text,
  priority smallint not null default 50 check (priority between 0 and 100),
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'done', 'dismissed')),
  source text not null,
  payload jsonb not null default '{}',
  due_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists learning_tasks_pending on public.learning_tasks (user_id, status, priority desc);

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_date date not null,
  variant text not null check (variant in ('quick', 'standard', 'deep')),
  target_minutes smallint not null,
  rationale jsonb not null default '[]',
  inputs jsonb not null default '{}',
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, plan_date)
);

create table if not exists public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null,
  type text not null check (type in ('review', 'new_words', 'story', 'grammar', 'conversation', 'assessment', 'feedback', 'sprint')),
  title text not null,
  goal text not null,
  est_minutes smallint not null,
  entry_ids text[] not null default '{}',
  grammar_topic_ids text[] not null default '{}',
  priority smallint not null default 50,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  payload jsonb not null default '{}',
  task_id uuid references public.learning_tasks (id) on delete set null,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  unique (plan_id, position)
);

create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_text text not null,
  summary text not null,
  scenario_ids text[] not null default '{}',
  entry_ids text[] not null default '{}',
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Assessment, memory, events, cost
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  session_id uuid references public.conversation_sessions (id) on delete set null,
  scores jsonb not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.learner_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('error_pattern', 'weak_construction', 'strength', 'interest', 'goal', 'fact', 'mastered_scenario', 'comprehension_issue')),
  key text not null,
  content text not null,
  evidence_count int not null default 1,
  weight double precision not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, kind, key)
);

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  minutes double precision not null default 0,
  payload jsonb not null default '{}',
  local_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists learning_events_user_date on public.learning_events (user_id, local_date);

create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('elevenlabs', 'anthropic')),
  operation text not null,
  units double precision not null,
  unit_type text not null,
  est_cost_usd double precision not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists api_usage_logs_user_time on public.api_usage_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Binary files: cached TTS audio and optional conversation recordings
-- ---------------------------------------------------------------------------
create table if not exists public.blobs (
  bucket text not null check (bucket in ('tts-cache', 'recordings')),
  key text not null,
  content_type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now(),
  primary key (bucket, key)
);
