"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Records a spoken answer and returns its transcript.
 *  - "elevenlabs": MediaRecorder → /api/stt (ElevenLabs Scribe). Works on iPhone Safari (audio/mp4).
 *  - "browser": Web Speech API (es-ES) when server STT is not configured — labelled as such.
 *  - "none": no speech input available; the UI offers typing instead.
 */
export type SttSource = "elevenlabs" | "browser" | "none";

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export function sttSourceFor(serverStt: boolean): SttSource {
  if (serverStt && typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia)
    return "elevenlabs";
  if (getRecognition()) return "browser";
  return "none";
}

export function useRecorder(serverStt: boolean) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<InstanceType<RecognitionCtor> | null>(null);
  const resolveRef = useRef<((t: string | null) => void) | null>(null);
  const source = sttSourceFor(serverStt);

  const start = useCallback(async () => {
    setError(null);
    if (source === "elevenlabs") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        streamRef.current = stream;
        const mime = pickMime();
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        chunks.current = [];
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.start();
        recRef.current = rec;
        setState("recording");
      } catch {
        setError("Brak dostępu do mikrofonu. Zezwól na mikrofon w ustawieniach przeglądarki (na iPhonie: Ustawienia → Safari → Mikrofon).");
      }
      return;
    }
    if (source === "browser") {
      const Ctor = getRecognition()!;
      const r = new Ctor();
      r.lang = "es-ES";
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.continuous = true;
      let text = "";
      r.onresult = (e) => {
        text = Array.from(e.results)
          .map((res) => res[0]?.transcript ?? "")
          .join(" ")
          .trim();
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed") setError("Brak zgody na mikrofon.");
      };
      r.onend = () => {
        setState("idle");
        resolveRef.current?.(text || null);
        resolveRef.current = null;
      };
      recognitionRef.current = r;
      r.start();
      setState("recording");
    }
  }, [source]);

  /** Stops recording and resolves with the transcript (or null). */
  const stop = useCallback(async (): Promise<string | null> => {
    if (source === "browser") {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        recognitionRef.current?.stop();
      });
    }
    const rec = recRef.current;
    if (!rec) return null;
    const blob: Blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    if (blob.size < 1200) {
      setState("idle");
      setError("Nagranie jest za krótkie — przytrzymaj chwilę dłużej.");
      return null;
    }
    setState("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "answer");
      const res = await fetch("/api/stt", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Nie udało się rozpoznać mowy.");
        return null;
      }
      if (!data.text) setError("Nic nie usłyszałem. Spróbuj ponownie, mówiąc bliżej mikrofonu.");
      return data.text || null;
    } catch {
      setError("Brak połączenia — odpowiedz tekstem albo spróbuj ponownie.");
      return null;
    } finally {
      setState("idle");
    }
  }, [source]);

  const cancel = useCallback(() => {
    recRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  return { state, error, start, stop, cancel, source, setError };
}
