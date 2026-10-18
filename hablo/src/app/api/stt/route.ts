import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { env } from "@/lib/env";
import { ElevenLabsError, speechToText } from "@/lib/elevenlabs/server";
import { assertBudget, elevenPrices, logUsage } from "@/lib/usage";
import { getPrefs } from "@/lib/learning/profile";
import { HttpError } from "@/lib/http-error";

/** Transcribes a spoken answer with ElevenLabs Scribe. Audio is not stored. */
export const POST = withSession(async (req, s) => {
  if (!env.elevenKey()) return NextResponse.json({ error: "STT nie jest skonfigurowany", fallback: "browser" }, { status: 503 });
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "Brak nagrania.");
  if (file.size > 8 * 1024 * 1024) throw new HttpError(413, "Nagranie jest za długie.");
  const prefs = await getPrefs(s.db, s.userId);
  await assertBudget(s.db, s.userId, prefs, "stt");
  try {
    const type = file.type || "audio/webm";
    const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
    const out = await speechToText(file, `answer.${ext}`);
    const secs = out.durationSecs ?? 5;
    await logUsage(s.db, s.userId, {
      provider: "elevenlabs",
      operation: "stt",
      units: secs,
      unit_type: "seconds",
      est_cost_usd: (secs / 3600) * elevenPrices.sttPerHour(),
    });
    return { text: out.text, provider: "elevenlabs" };
  } catch (e) {
    if (e instanceof ElevenLabsError) return NextResponse.json({ error: e.message, fallback: "browser" }, { status: e.status >= 500 ? 503 : e.status });
    throw e;
  }
});
