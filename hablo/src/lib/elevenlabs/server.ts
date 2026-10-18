import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Server-side ElevenLabs client. The API key never leaves the server: the
 * browser only receives short-lived conversation tokens / signed URLs for the
 * private (authenticated) agent, and audio bytes from our own API routes.
 *
 * Endpoints verified against the official @elevenlabs/elevenlabs-js SDK
 * (v2.73) and @elevenlabs/client (v1.x).
 */
const BASE = "https://api.elevenlabs.io";

export class ElevenLabsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function key(): string {
  const k = env.elevenKey();
  if (!k) throw new ElevenLabsError(503, "ElevenLabs nie jest skonfigurowany (brak ELEVENLABS_API_KEY).");
  return k;
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "xi-api-key": key(), ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { detail?: { message?: string } | string };
        detail = typeof body.detail === "string" ? body.detail : (body.detail?.message ?? "");
      } catch {
        // non-JSON error body
      }
      throw new ElevenLabsError(res.status, `ElevenLabs ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return res;
  } catch (e) {
    if (e instanceof ElevenLabsError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new ElevenLabsError(504, "ElevenLabs nie odpowiedział w czasie.");
    throw new ElevenLabsError(502, `Błąd połączenia z ElevenLabs: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(t);
  }
}

/** WebRTC conversation token for the private agent (GET /v1/convai/conversation/token). */
export async function getConversationToken(participantName?: string): Promise<string> {
  const agentId = env.elevenAgentId();
  if (!agentId) throw new ElevenLabsError(503, "Brak ELEVENLABS_AGENT_ID — utwórz agenta: npm run elevenlabs:agent");
  const qs = new URLSearchParams({ agent_id: agentId });
  if (participantName) qs.set("participant_name", participantName);
  const res = await call(`/v1/convai/conversation/token?${qs}`);
  const data = (await res.json()) as { token?: string; conversation_token?: string };
  const token = data.token ?? data.conversation_token;
  if (!token) throw new ElevenLabsError(502, "ElevenLabs nie zwrócił tokenu rozmowy.");
  return token;
}

/** Signed WebSocket URL — fallback transport when WebRTC is blocked (GET /v1/convai/conversation/get-signed-url). */
export async function getSignedUrl(): Promise<string> {
  const agentId = env.elevenAgentId();
  if (!agentId) throw new ElevenLabsError(503, "Brak ELEVENLABS_AGENT_ID.");
  const res = await call(`/v1/convai/conversation/get-signed-url?${new URLSearchParams({ agent_id: agentId })}`);
  const data = (await res.json()) as { signed_url?: string };
  if (!data.signed_url) throw new ElevenLabsError(502, "ElevenLabs nie zwrócił signed URL.");
  return data.signed_url;
}

export interface ElevenTranscriptItem {
  role: "user" | "agent";
  message: string | null;
  time_in_call_secs?: number;
}
export interface ElevenConversation {
  agent_id: string;
  conversation_id: string;
  status: string;
  transcript: ElevenTranscriptItem[];
  metadata?: { call_duration_secs?: number; start_time_unix_secs?: number };
  has_audio?: boolean;
  conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> };
}

/** GET /v1/convai/conversations/{id} — transcript and metadata. */
export async function getConversation(conversationId: string): Promise<ElevenConversation> {
  const res = await call(`/v1/convai/conversations/${encodeURIComponent(conversationId)}`);
  return (await res.json()) as ElevenConversation;
}

/** GET /v1/convai/conversations/{id}/audio — full recording (only if the agent records audio). */
export async function getConversationAudio(conversationId: string): Promise<ArrayBuffer> {
  const res = await call(`/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`, {}, 60_000);
  return res.arrayBuffer();
}

/** POST /v1/text-to-speech/{voice_id} → MP3 bytes. */
export async function textToSpeech(
  text: string,
  opts: { voiceId?: string; speed?: number; language?: "es" | "pl"; stability?: number } = {},
): Promise<ArrayBuffer> {
  const voiceId = opts.voiceId ?? env.elevenVoiceDefault() ?? env.elevenVoiceFemale();
  if (!voiceId) throw new ElevenLabsError(503, "Brak ELEVENLABS_VOICE_ID dla odtwarzania wymowy.");
  const model = env.elevenTtsModel();
  const body: Record<string, unknown> = {
    text,
    model_id: model,
    voice_settings: { stability: opts.stability ?? 0.6, similarity_boost: 0.8, speed: opts.speed ?? 0.95 },
  };
  // language_code is not supported by multilingual_v2 models (ignored or rejected).
  if (!model.includes("multilingual_v2")) body.language_code = opts.language ?? "es";
  const res = await call(
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    30_000,
  );
  return res.arrayBuffer();
}

/** POST /v1/speech-to-text (Scribe) → transcript text. */
export async function speechToText(audio: Blob, filename = "answer.webm"): Promise<{ text: string; durationSecs: number | null }> {
  const form = new FormData();
  form.append("model_id", env.elevenSttModel());
  form.append("file", audio, filename);
  form.append("language_code", "spa");
  form.append("tag_audio_events", "false");
  const res = await call("/v1/speech-to-text", { method: "POST", body: form }, 45_000);
  const data = (await res.json()) as { text?: string; audio_duration_secs?: number };
  return { text: (data.text ?? "").trim(), durationSecs: data.audio_duration_secs ?? null };
}

/**
 * Verifies the `ElevenLabs-Signature` header of a post-call webhook:
 * "t=<unix>,v0=<hex hmac_sha256(secret, `${t}.${rawBody}`)>", 30 min tolerance.
 * Mirrors WebhooksClient.constructEvent from the official SDK.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",");
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sig = parts.find((p) => p.startsWith("v0="));
  if (!t || !sig) return false;
  if (Number(t) * 1000 < nowMs - 30 * 60 * 1000) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Voice for a scenario character (female/male), configured via env. */
export function voiceFor(hint: "female" | "male" | null): string | undefined {
  if (hint === "male") return env.elevenVoiceMale();
  return env.elevenVoiceFemale();
}
