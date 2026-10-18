import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { env } from "@/lib/env";
import { ElevenLabsError, textToSpeech, voiceFor } from "@/lib/elevenlabs/server";
import { getObject, putObject } from "@/lib/storage";
import { assertBudget, elevenPrices, logUsage } from "@/lib/usage";
import { getPrefs } from "@/lib/learning/profile";
import { HttpError } from "@/lib/http-error";

/**
 * Spanish pronunciation — and calm Polish narration of personal thoughts
 * (purpose=thought) — via ElevenLabs TTS, cached by content hash so each
 * word/sentence is synthesized (and paid for) once. Returns 503 when TTS is
 * not configured — the client then uses the browser voice and labels it so.
 */
export const GET = withSession(async (req, s) => {
  const url = new URL(req.url);
  const text = (url.searchParams.get("text") ?? "").trim();
  const narration = url.searchParams.get("purpose") === "thought";
  const maxLen = narration ? 1500 : 400;
  if (!text || text.length > maxLen) throw new HttpError(400, `Tekst musi mieć 1–${maxLen} znaków.`);
  if (!env.elevenKey() || !(env.elevenVoiceDefault() || env.elevenVoiceFemale())) {
    return NextResponse.json({ error: "TTS nie jest skonfigurowany", fallback: "browser" }, { status: 503 });
  }
  const slow = url.searchParams.get("slow") === "1";
  const voiceId = narration
    ? env.elevenVoiceNarrator()!
    : (voiceFor(url.searchParams.get("voice") === "male" ? "male" : "female") ?? env.elevenVoiceDefault()!);
  // Narration of personal thoughts: slower, steadier delivery in Polish.
  const speed = narration ? 0.86 : slow ? 0.75 : 0.95;
  const key =
    (narration ? "thoughts/" : "") +
    createHash("sha256").update(`${env.elevenTtsModel()}|${voiceId}|${speed}|${narration ? "pl" : "es"}|${text}`).digest("hex") +
    ".mp3";
  let audio = await getObject("tts-cache", key);
  if (!audio) {
    const prefs = await getPrefs(s.db, s.userId);
    await assertBudget(s.db, s.userId, prefs, "tts");
    try {
      audio = await textToSpeech(text, narration ? { voiceId, speed, language: "pl", stability: 0.8 } : { voiceId, speed });
    } catch (e) {
      if (e instanceof ElevenLabsError) return NextResponse.json({ error: e.message, fallback: "browser" }, { status: e.status >= 500 ? 503 : e.status });
      throw e;
    }
    await putObject("tts-cache", key, audio);
    await logUsage(s.db, s.userId, {
      provider: "elevenlabs",
      operation: "tts",
      units: text.length,
      unit_type: "characters",
      est_cost_usd: (text.length / 1000) * elevenPrices.ttsPer1kChars(),
    });
  }
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
});
