import "server-only";
import type { Session } from "@/lib/session";
import type { Db } from "@/lib/db/db";
import { eq } from "@/lib/db/db";
import type { ConversationMode, ConversationSessionRow } from "@/lib/db/types";
import { getGrammarTopic, getScenario } from "@/lib/content";
import { env } from "@/lib/env";
import { buildTutorContext } from "@/lib/learning/tutor-context";
import {
  applyAnalysis,
  basicAnalysis,
  estimateUserSpeakingSecs,
  saveTranscript,
  type TurnInput,
} from "@/lib/learning/conversation";
import { actionsForMode, CONTROL_ACTIONS, parseControlMessage, type ControlAction } from "@/lib/learning/actions";
import { getPrefs, getProfile } from "@/lib/learning/profile";
import { getEntries } from "@/lib/learning/vocabulary";
import { analyzeConversation, tutorReply } from "@/lib/ai/tasks";
import { aiProvider } from "@/lib/ai/client";
import { assertBudget, elevenPrices, logUsage } from "@/lib/usage";
import {
  ElevenLabsError,
  getConversation,
  getConversationAudio,
  getConversationToken,
  getSignedUrl,
  voiceFor,
} from "@/lib/elevenlabs/server";
import { putObject } from "@/lib/storage";
import { HttpError } from "@/lib/http-error";
import { updatePlanItem } from "@/lib/learning/plan-service";

export interface StartInput {
  scenarioId: string | null;
  mode: ConversationMode;
  grammarTopicId: string | null;
  planItemId: string | null;
  channel: "voice" | "text";
}

export function voiceAvailable() {
  return !!(env.elevenKey() && env.elevenAgentId());
}

export async function startConversation(s: Session, input: StartInput) {
  const scenario = input.scenarioId ? getScenario(input.scenarioId) : null;
  if (input.scenarioId && !scenario) throw new HttpError(404, "Nie ma takiego scenariusza.");
  if (input.grammarTopicId && !getGrammarTopic(input.grammarTopicId)) throw new HttpError(404, "Nie ma takiego tematu.");
  const prefs = await getPrefs(s.db, s.userId);
  if (input.channel === "voice") {
    if (!voiceAvailable())
      throw new HttpError(503, "Rozmowa głosowa wymaga ELEVENLABS_API_KEY i ELEVENLABS_AGENT_ID (zobacz Ustawienia → Integracje).");
    await assertBudget(s.db, s.userId, prefs, "conversation");
  } else if (!aiProvider()) {
    throw new HttpError(503, "Tryb tekstowy wymaga klucza Claude API (ANTHROPIC_API_KEY).");
  }
  const tutor = await buildTutorContext(s.db, s.userId, prefs, input);
  const [row] = await s.db.insert("conversation_sessions", {
    user_id: s.userId,
    scenario_id: scenario?.id ?? null,
    grammar_topic_id: input.grammarTopicId,
    mode: input.mode,
    channel: input.channel,
    plan_item_id: input.planItemId,
    context: { dynamicVariables: tutor.dynamicVariables, history: [] },
  });
  if (input.planItemId) await updatePlanItem(s.db, s.userId, input.planItemId, { status: "in_progress" }).catch(() => null);

  const character = scenario
    ? { name: scenario.character_name, role: scenario.character_role, title: scenario.title, goals: scenario.goals_pl, keyPhrases: scenario.key_phrases }
    : {
        name: "Lucía",
        role: input.mode === "assessment" ? "egzaminatorka" : "twoja nauczycielka",
        title: input.mode === "assessment" ? "Test tygodniowy" : tutor.topic ? tutor.topic.title : "Swobodna rozmowa",
        goals: input.mode === "assessment" ? ["Mów jak najwięcej samodzielnie"] : tutor.topic ? [tutor.topic.subtitle] : ["Opowiedz o sobie i swoim dniu"],
        keyPhrases: [] as string[],
      };
  const base = {
    sessionId: row.id,
    channel: input.channel,
    mode: input.mode,
    character,
    firstMessage: tutor.firstMessage,
    actions: actionsForMode(input.mode),
    showTranslationDefault: input.mode === "guided" && prefs.show_translation,
    showSubtitlesDefault: prefs.show_subtitles,
  };
  if (input.channel === "text") {
    await s.db.update("conversation_sessions", [eq("id", row.id)], {
      context: { dynamicVariables: tutor.dynamicVariables, history: [{ role: "agent", text: tutor.firstMessage }] },
    });
    return { ...base, voice: null };
  }

  // Private agent: the browser receives only a short-lived token, never the API key.
  let auth: { conversationToken: string; connectionType: "webrtc" } | { signedUrl: string; connectionType: "websocket" };
  try {
    auth = { conversationToken: await getConversationToken(s.userId.slice(0, 8)), connectionType: "webrtc" };
  } catch (e) {
    if (e instanceof ElevenLabsError && e.status >= 500) {
      auth = { signedUrl: await getSignedUrl(), connectionType: "websocket" };
    } else throw e;
  }
  const voiceId = voiceFor(scenario?.voice_hint ?? "female");
  return {
    ...base,
    voice: {
      ...auth,
      dynamicVariables: { ...tutor.dynamicVariables, hablo_session_id: row.id },
      overrides: {
        agent: { firstMessage: tutor.firstMessage, language: "es" as const },
        tts: { ...(voiceId ? { voiceId } : {}), speed: Number(prefs.tutor_speed) },
      },
      userId: s.userId,
    },
  };
}

async function loadSession(db: Db, userId: string, id: string): Promise<ConversationSessionRow> {
  const row = (await db.select("conversation_sessions", { where: [eq("id", id), eq("user_id", userId)], limit: 1 }))[0];
  if (!row) throw new HttpError(404, "Nie ma takiej rozmowy.");
  return row;
}

export async function linkElevenConversation(s: Session, id: string, elevenId: string) {
  await loadSession(s.db, s.userId, id);
  await s.db.update("conversation_sessions", [eq("id", id), eq("user_id", s.userId)], { elevenlabs_conversation_id: elevenId });
}

/** Normalizes transcript lines: control messages become "action" turns. */
export function normalizeTurns(turns: { role: "user" | "agent"; text: string; time?: number | null }[]): TurnInput[] {
  return turns
    .filter((t) => t.text && t.text.trim())
    .map((t) => {
      const action = t.role === "user" ? parseControlMessage(t.text) : null;
      return action
        ? { role: "action" as const, text: CONTROL_ACTIONS[action].label, action, time_in_call_secs: t.time ?? null }
        : { role: t.role, text: t.text.trim(), time_in_call_secs: t.time ?? null };
    });
}

async function fetchElevenTranscript(elevenId: string) {
  // Right after hang-up the conversation may still be processing: retry briefly.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const conv = await getConversation(elevenId);
      if (conv.transcript?.length && conv.status !== "in-progress" && conv.status !== "processing") return conv;
      if (attempt === 3 && conv.transcript?.length) return conv;
    } catch (e) {
      if (attempt === 3) throw e;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

export interface FinishInput {
  elevenConversationId: string | null;
  localTranscript: { role: "user" | "agent"; text: string; time?: number | null }[];
  durationSecs: number;
  counters: Partial<Record<ControlAction, number>>;
}

/** Ends a session: stores the authoritative transcript, logs cost, analyses and updates the learner model. */
export async function finishConversation(s: Session, id: string, input: FinishInput) {
  const session = await loadSession(s.db, s.userId, id);
  if (session.status === "analyzed") return getFeedback(s, id);
  let transcriptSource: "elevenlabs" | "local" = "local";
  let turns = normalizeTurns(input.localTranscript);
  let duration = Math.max(0, Math.round(input.durationSecs));
  const elevenId = input.elevenConversationId ?? session.elevenlabs_conversation_id;
  if (session.channel === "text") {
    // The server keeps the authoritative text-mode history.
    const history = ((session.context ?? {}) as { history?: { role: "user" | "agent" | "action"; text: string; action?: string }[] }).history ?? [];
    turns = history.map((h) => ({ role: h.role, text: h.text, action: h.action ?? null }));
  }
  if (session.channel === "voice" && elevenId) {
    try {
      const conv = await fetchElevenTranscript(elevenId);
      if (conv?.transcript?.length) {
        turns = normalizeTurns(
          conv.transcript.map((t) => ({ role: t.role, text: t.message ?? "", time: t.time_in_call_secs ?? null })),
        );
        transcriptSource = "elevenlabs";
        duration = conv.metadata?.call_duration_secs ?? duration;
      }
    } catch (e) {
      console.warn("ElevenLabs transcript unavailable, using local transcript", e);
    }
  }
  await saveTranscript(s.db, session, turns);
  const count = (a: ControlAction) => turns.filter((t) => t.role === "action" && t.action === a).length || input.counters[a] || 0;
  const [updated] = await s.db.update("conversation_sessions", [eq("id", id)], {
    status: "ended",
    ended_at: new Date().toISOString(),
    duration_secs: duration,
    elevenlabs_conversation_id: elevenId ?? null,
    user_speaking_secs: estimateUserSpeakingSecs(turns),
    hints_used: count("hint"),
    repeats_used: count("repeat_slower"),
    not_understood_count: count("not_understood"),
    translations_used: count("translate"),
  });
  if (session.channel === "voice") {
    await logUsage(s.db, s.userId, {
      provider: "elevenlabs",
      operation: "conversation",
      units: duration / 60,
      unit_type: "minutes",
      est_cost_usd: (duration / 60) * elevenPrices.agentPerMinute(),
      meta: { session_id: id, transcript_source: transcriptSource },
    });
  }
  await analyzeAndApply(s.db, updated);
  if (session.plan_item_id) {
    await updatePlanItem(s.db, s.userId, session.plan_item_id, { status: "done", result: { session_id: id } }).catch(() => null);
  }
  const prefs = await getPrefs(s.db, s.userId);
  if (prefs.store_audio && session.channel === "voice" && elevenId) {
    try {
      const audio = await getConversationAudio(elevenId);
      const key = `${s.userId}/${id}.mp3`;
      if (await putObject("recordings", key, audio)) {
        await s.db.update("conversation_sessions", [eq("id", id)], {
          audio_path: key,
          audio_expires_at: new Date(Date.now() + prefs.audio_retention_days * 86_400_000).toISOString(),
        });
      }
    } catch {
      // Recording is optional (agent may not record audio).
    }
  }
  return { ...(await getFeedback(s, id)), transcriptSource };
}

/** Runs AI analysis (or the basic fallback) and applies it. Used by finish and by the webhook. */
export async function analyzeAndApply(db: Db, session: ConversationSessionRow) {
  const turns = await db.select("conversation_turns", { where: [eq("session_id", session.id)], order: [{ col: "idx" }] });
  const userId = session.user_id;
  const prefs = await getPrefs(db, userId);
  const profile = await getProfile(db, userId);
  const scenario = session.scenario_id ? getScenario(session.scenario_id) : null;
  let outcome: Parameters<typeof applyAnalysis>[2];
  try {
    const ai = turns.some((t) => t.role === "user")
      ? await analyzeConversation(
          { db, userId, prefs },
          {
            mode: session.mode,
            scenario: scenario ? { title: scenario.title, goals_pl: scenario.goals_pl } : null,
            grammar_focus: session.grammar_topic_id ? (getGrammarTopic(session.grammar_topic_id)?.title ?? null) : null,
            learner_level: profile?.start_level ?? "unknown",
            target_lemmas: [],
            transcript: turns.map((t) => ({ idx: t.idx, role: t.role, text: t.text, assisted: t.assisted })),
            assessment: session.mode === "assessment",
          },
        )
      : null;
    outcome = ai
      ? { analysis: ai, source: aiProvider() === "mock" ? "test" : "ai" }
      : { analysis: basicAnalysis(turns, await getEntries(db, userId)), source: "basic" };
  } catch (e) {
    console.error("AI analysis failed, using basic analysis", e);
    outcome = { analysis: basicAnalysis(turns, await getEntries(db, userId)), source: "basic" };
    outcome.analysis.summary_pl = `Analiza AI nie powiodła się (${e instanceof Error ? e.message : "błąd"}). Pokazuję analizę podstawową; możesz ją ponowić później.`;
  }
  await applyAnalysis(db, session, outcome);
}

export async function getFeedback(s: Session, id: string) {
  const session = await loadSession(s.db, s.userId, id);
  const fb = (await s.db.select("conversation_feedback", { where: [eq("session_id", id)], limit: 1 }))[0] ?? null;
  const turns = await s.db.select("conversation_turns", { where: [eq("session_id", id)], order: [{ col: "idx" }] });
  const scenario = session.scenario_id ? getScenario(session.scenario_id) : null;
  return {
    session: {
      id: session.id,
      mode: session.mode,
      channel: session.channel,
      status: session.status,
      startedAt: session.started_at,
      durationSecs: session.duration_secs,
      hintsUsed: session.hints_used,
      scenarioId: session.scenario_id,
      title: scenario?.title ?? (session.mode === "assessment" ? "Test tygodniowy" : "Swobodna rozmowa"),
      hasAudio: !!session.audio_path,
    },
    feedback: fb,
    turns: turns.map((t) => ({ idx: t.idx, role: t.role, text: t.text, assisted: t.assisted })),
  };
}

/** Text-mode turn (fallback channel when voice is unavailable). */
export async function textTurn(s: Session, id: string, input: { message?: string; action?: ControlAction }) {
  const session = await loadSession(s.db, s.userId, id);
  if (session.channel !== "text" || session.status !== "active") throw new HttpError(409, "Rozmowa nie jest aktywna.");
  const ctx = (session.context ?? {}) as { dynamicVariables?: Record<string, string>; history?: { role: "user" | "agent" | "action"; text: string; action?: string }[] };
  const history = ctx.history ?? [];
  if (input.action) history.push({ role: "action", text: CONTROL_ACTIONS[input.action].label, action: input.action });
  else if (input.message?.trim()) history.push({ role: "user", text: input.message.trim().slice(0, 1000) });
  else throw new HttpError(400, "Pusta wiadomość.");
  const dv = ctx.dynamicVariables ?? {};
  const persona = `${dv.persona ?? ""}\n${dv.mode_rules ?? ""}\nObjetivos: ${dv.session_goals ?? ""}\nPalabras que conoce el alumno: ${dv.known_words ?? ""}\nPalabras para repasar: ${dv.review_words ?? ""}\nGramática: ${dv.grammar_focus ?? ""}\nMemoria del alumno: ${dv.learner_memory ?? ""}`;
  const reply = await tutorReply(
    { db: s.db, userId: s.userId, prefs: await getPrefs(s.db, s.userId) },
    {
      persona_prompt: persona,
      history: history.filter((h) => h.role !== "action").map((h) => ({ role: h.role as "user" | "agent", text: h.text })),
      instruction: input.action ? CONTROL_ACTIONS[input.action].message : null,
    },
  );
  if (!reply) throw new HttpError(503, "Brak dostawcy AI dla trybu tekstowego.");
  history.push({ role: "agent", text: reply.reply_es });
  await s.db.update("conversation_sessions", [eq("id", id)], { context: { ...ctx, history } });
  return reply;
}

/** Post-call webhook payload (type "post_call_transcription"). */
export interface PostCallWebhook {
  type: string;
  data?: {
    conversation_id?: string;
    transcript?: { role: "user" | "agent"; message: string | null; time_in_call_secs?: number }[];
    metadata?: { call_duration_secs?: number };
    conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> };
  };
}

export async function handlePostCallWebhook(db: Db, payload: PostCallWebhook) {
  if (payload.type !== "post_call_transcription" || !payload.data?.conversation_id) return { handled: false };
  const elevenId = payload.data.conversation_id;
  const sessionId = payload.data.conversation_initiation_client_data?.dynamic_variables?.hablo_session_id;
  let session = (await db.select("conversation_sessions", { where: [eq("elevenlabs_conversation_id", elevenId)], limit: 1 }))[0];
  if (!session && typeof sessionId === "string") {
    session = (await db.select("conversation_sessions", { where: [eq("id", sessionId)], limit: 1 }))[0];
  }
  if (!session) return { handled: false, reason: "unknown conversation" };
  if (session.status === "analyzed") return { handled: true, reason: "already analyzed" };
  const turns = normalizeTurns(
    (payload.data.transcript ?? []).map((t) => ({ role: t.role, text: t.message ?? "", time: t.time_in_call_secs ?? null })),
  );
  await saveTranscript(db, session, turns);
  const duration = payload.data.metadata?.call_duration_secs ?? session.duration_secs ?? 0;
  const [updated] = await db.update("conversation_sessions", [eq("id", session.id)], {
    status: "ended",
    ended_at: session.ended_at ?? new Date().toISOString(),
    elevenlabs_conversation_id: elevenId,
    duration_secs: duration,
    user_speaking_secs: estimateUserSpeakingSecs(turns),
  });
  if (session.status === "active") {
    await logUsage(db, session.user_id, {
      provider: "elevenlabs",
      operation: "conversation",
      units: duration / 60,
      unit_type: "minutes",
      est_cost_usd: (duration / 60) * elevenPrices.agentPerMinute(),
      meta: { session_id: session.id, source: "webhook" },
    });
  }
  await analyzeAndApply(db, updated);
  return { handled: true };
}
