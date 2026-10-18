import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Db, Filter, Insert, Query, Row } from "./db";
import { TABLE_META, type TableName } from "./types";

/**
 * Local single-user store emulating the Postgres schema (primary keys, unique
 * constraints, defaults). Used ONLY in clearly labelled demo mode (no Supabase
 * configured) and in automated tests. Persisted to a JSON file when a path is
 * given, otherwise in memory.
 */
type Data = Partial<Record<TableName, Record<string, unknown>[]>>;

const now = () => new Date().toISOString();

const DEFAULTS: Partial<Record<TableName, () => Record<string, unknown>>> = {
  profiles: () => ({ display_name: null, start_level: "unknown", onboarded_at: null, created_at: now() }),
  learning_preferences: () => ({
    daily_minutes: 30,
    plan_variant: "standard",
    new_words_pace: "normal",
    accent: "castellano",
    timezone: "Europe/Warsaw",
    motivation: null,
    focus_situations: [],
    interests: [],
    tutor_speed: 0.9,
    tutor_voice_id: null,
    hints_default: true,
    show_subtitles: true,
    show_translation: false,
    store_audio: false,
    audio_retention_days: 30,
    transcript_retention_days: null,
    daily_cost_limit_usd: 3,
    monthly_cost_limit_usd: 40,
    daily_conversation_minutes_limit: 40,
    updated_at: now(),
  }),
  vocabulary_entries: () => ({
    owner_id: null,
    collocations: [],
    forms: [],
    topics: [],
    grammar: [],
    note: null,
    frequency_rank: null,
    corpus_count: null,
    level: 1,
    difficulty: 1,
    audio_path: null,
    source: "curated",
    created_at: now(),
  }),
  vocabulary_examples: () => ({ position: 0, audio_path: null }),
  vocabulary_progress: () => ({
    due: now(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
    correct_count: 0,
    incorrect_count: 0,
    assisted_count: 0,
    spontaneous_uses: 0,
    last_spontaneous_use_at: null,
    known_claimed: false,
    priority_boost: 0,
    first_seen_at: now(),
    updated_at: now(),
  }),
  vocabulary_review_logs: () => ({
    rating: null,
    assisted: false,
    scheduled: true,
    response: null,
    latency_ms: null,
    state_before: null,
    due_before: null,
    reviewed_at: now(),
  }),
  word_associations: () => ({ created_at: now() }),
  grammar_topics: () => ({ prerequisites: [] }),
  grammar_progress: () => ({
    status: "locked",
    mastery: 0,
    attempts: 0,
    correct: 0,
    conversation_uses: 0,
    conversation_errors: 0,
    lesson_completed_at: null,
    last_practiced_at: null,
    next_review_at: null,
    updated_at: now(),
  }),
  stories: () => ({
    seed_id: null,
    parent_story_id: null,
    variant: "original",
    level: 1,
    tense: "present",
    target_entry_ids: [],
    status: "new",
    stage_reached: 0,
    retell_count: 0,
    next_retell_at: null,
    created_at: now(),
    completed_at: null,
  }),
  story_vocabulary: () => ({ is_target: true }),
  story_attempts: () => ({ input_text: null, result: {}, score: null, created_at: now() }),
  conversation_sessions: () => ({
    scenario_id: null,
    grammar_topic_id: null,
    elevenlabs_conversation_id: null,
    status: "active",
    plan_item_id: null,
    context: {},
    hints_used: 0,
    repeats_used: 0,
    translations_used: 0,
    not_understood_count: 0,
    started_at: now(),
    ended_at: null,
    duration_secs: null,
    user_speaking_secs: null,
    audio_path: null,
    audio_expires_at: null,
    error: null,
  }),
  conversation_turns: () => ({ time_in_call_secs: null, assisted: false, action: null }),
  conversation_feedback: () => ({
    mistakes: [],
    missing_words: [],
    strengths: [],
    words_used: [],
    grammar_used: [],
    comprehension_issues: [],
    next_exercise: null,
    scores: null,
    created_at: now(),
  }),
  learning_tasks: () => ({
    est_minutes: 3,
    entry_ids: [],
    grammar_topic_ids: [],
    scenario_id: null,
    priority: 50,
    status: "pending",
    payload: {},
    due_date: null,
    created_at: now(),
    completed_at: null,
  }),
  daily_plans: () => ({ rationale: [], inputs: {}, status: "active", created_at: now(), completed_at: null }),
  daily_plan_items: () => ({
    entry_ids: [],
    grammar_topic_ids: [],
    priority: 50,
    status: "pending",
    payload: {},
    task_id: null,
    result: null,
    started_at: null,
    completed_at: null,
  }),
  sprints: () => ({ scenario_ids: [], entry_ids: [], status: "active", created_at: now() }),
  weekly_assessments: () => ({ session_id: null, created_at: now() }),
  learner_memory: () => ({ evidence_count: 1, weight: 1, first_seen_at: now(), last_seen_at: now() }),
  learning_events: () => ({ minutes: 0, payload: {}, created_at: now() }),
  api_usage_logs: () => ({ est_cost_usd: 0, meta: {}, created_at: now() }),
  thought_categories: () => ({ description: null, position: 0, created_at: now() }),
  thoughts: () => ({
    origin_id: null,
    category_key: null,
    meta: {},
    contexts: [],
    featured: false,
    favorite: false,
    hidden: false,
    edited: false,
    origin_hash: null,
    last_shown_at: null,
    created_at: now(),
    updated_at: now(),
  }),
};

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
}

function matches(row: Record<string, unknown>, filters: Filter[] = []): boolean {
  return filters.every(({ col, op, value }) => {
    const v = row[col];
    switch (op) {
      case "eq":
        return v === value;
      case "neq":
        return v !== value;
      case "in":
        return (value as unknown[]).includes(v);
      case "lt":
        return v !== null && v !== undefined && cmp(v, value) < 0;
      case "lte":
        return v !== null && v !== undefined && cmp(v, value) <= 0;
      case "gt":
        return v !== null && v !== undefined && cmp(v, value) > 0;
      case "gte":
        return v !== null && v !== undefined && cmp(v, value) >= 0;
      case "is":
        return v === value || (value === null && v === undefined);
      case "contains":
        return Array.isArray(v) && (Array.isArray(value) ? value : [value]).every((x) => v.includes(x));
    }
  });
}

const keyOf = (row: Record<string, unknown>, cols: string[]) => JSON.stringify(cols.map((c) => row[c] ?? null));
const clone = <T>(x: T): T => structuredClone(x);

export class LocalDb implements Db {
  readonly kind = "local" as const;
  private data: Data = {};
  private mtimeMs = -1;

  constructor(private file: string | null = null) {
    this.sync();
  }

  /**
   * Several module instances may share one file (Next.js bundles route
   * handlers and pages separately), so reload whenever the file changed.
   */
  private sync() {
    if (!this.file || !fs.existsSync(this.file)) return;
    const m = fs.statSync(this.file).mtimeMs;
    if (m !== this.mtimeMs) {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8")) as Data;
      this.mtimeMs = m;
    }
  }

  private table(t: TableName): Record<string, unknown>[] {
    this.sync();
    if (!this.data[t]) this.data[t] = [];
    return this.data[t]!;
  }

  private persist() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
    this.mtimeMs = fs.statSync(this.file).mtimeMs;
  }

  private complete(t: TableName, row: Record<string, unknown>): Record<string, unknown> {
    const meta = TABLE_META[t];
    const base = { ...(DEFAULTS[t]?.() ?? {}), ...row };
    if (meta.generatedId && !base.id) base.id = randomUUID();
    return base;
  }

  private violates(t: TableName, row: Record<string, unknown>, ignore?: Record<string, unknown>): string | null {
    const meta = TABLE_META[t];
    for (const cols of [meta.pk, ...(meta.unique ?? [])]) {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue;
      const k = keyOf(row, cols);
      if (this.table(t).some((r) => r !== ignore && keyOf(r, cols) === k)) return cols.join(",");
    }
    return null;
  }

  async select<T extends TableName>(t: T, q: Query = {}): Promise<Row<T>[]> {
    let rows = this.table(t).filter((r) => matches(r, q.where));
    if (q.order?.length) {
      rows = [...rows].sort((a, b) => {
        for (const o of q.order!) {
          const c = cmp(a[o.col], b[o.col]);
          if (c !== 0) return o.asc === false ? -c : c;
        }
        return 0;
      });
    }
    if (q.limit !== undefined) rows = rows.slice(0, q.limit);
    return clone(rows) as unknown as Row<T>[];
  }

  async insert<T extends TableName>(t: T, input: Insert<T> | Insert<T>[]): Promise<Row<T>[]> {
    const rows = (Array.isArray(input) ? input : [input]).map((r) => this.complete(t, r as Record<string, unknown>));
    for (const r of rows) {
      const v = this.violates(t, r);
      if (v) throw new Error(`duplicate key value violates unique constraint on ${t}(${v})`);
      this.table(t).push(r);
    }
    this.persist();
    return clone(rows) as unknown as Row<T>[];
  }

  async upsert<T extends TableName>(
    t: T,
    input: Insert<T> | Insert<T>[],
    opts: { onConflict?: string[]; ignoreDuplicates?: boolean } = {},
  ): Promise<Row<T>[]> {
    const cols = opts.onConflict ?? TABLE_META[t].pk;
    const out: Record<string, unknown>[] = [];
    for (const raw of Array.isArray(input) ? input : [input]) {
      const r = raw as Record<string, unknown>;
      const k = keyOf(r, cols);
      const existing = this.table(t).find((x) => keyOf(x, cols) === k);
      if (existing) {
        if (opts.ignoreDuplicates) continue;
        Object.assign(existing, r);
        out.push(existing);
      } else {
        const full = this.complete(t, r);
        const v = this.violates(t, full);
        if (v) throw new Error(`duplicate key value violates unique constraint on ${t}(${v})`);
        this.table(t).push(full);
        out.push(full);
      }
    }
    this.persist();
    return clone(out) as unknown as Row<T>[];
  }

  async update<T extends TableName>(t: T, where: Filter[], patch: Insert<T>): Promise<Row<T>[]> {
    const rows = this.table(t).filter((r) => matches(r, where));
    for (const r of rows) {
      const next = { ...r, ...(patch as Record<string, unknown>) };
      const v = this.violates(t, next, r);
      if (v) throw new Error(`duplicate key value violates unique constraint on ${t}(${v})`);
      Object.assign(r, patch);
    }
    this.persist();
    return clone(rows) as unknown as Row<T>[];
  }

  async remove<T extends TableName>(t: T, where: Filter[]): Promise<number> {
    const before = this.table(t).length;
    this.data[t] = this.table(t).filter((r) => !matches(r, where));
    const n = before - this.data[t]!.length;
    // Emulate ON DELETE CASCADE for the few parent/child relations we delete through.
    if (n && t === "conversation_sessions") this.cascade(["conversation_turns", "conversation_feedback"], "session_id");
    if (n && t === "daily_plans") this.cascade(["daily_plan_items"], "plan_id", "daily_plans");
    if (n && t === "stories") this.cascade(["story_vocabulary", "story_attempts"], "story_id", "stories");
    this.persist();
    return n;
  }

  private cascade(children: TableName[], fk: string, parent: TableName = "conversation_sessions") {
    const ids = new Set(this.table(parent).map((r) => r.id));
    for (const c of children) this.data[c] = this.table(c).filter((r) => ids.has(r[fk]));
  }

  async count<T extends TableName>(t: T, where: Filter[] = []): Promise<number> {
    return this.table(t).filter((r) => matches(r, where)).length;
  }
}
