"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays Spanish audio: ElevenLabs TTS through /api/tts (cached on the server),
 * or — when TTS is not configured — the browser's es-ES voice, reported as
 * source "browser" so the UI can label it honestly.
 */
const urlCache = new Map<string, string>();

function browserSpeak(text: string, slow: boolean, lang: "es" | "pl" = "es"): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "pl" ? "pl-PL" : "es-ES";
    u.rate = slow ? 0.7 : lang === "pl" ? 0.85 : 0.9;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang === u.lang) ?? voices.find((x) => x.lang.startsWith(lang));
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export function useSpeech(enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [source, setSource] = useState<"elevenlabs" | "browser" | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const play = useCallback(
    async (text: string, opts: { slow?: boolean; voice?: "female" | "male"; purpose?: "thought" } = {}) => {
      if (!text) return;
      const key = `${opts.purpose ?? ""}|${opts.voice ?? "f"}|${opts.slow ? 1 : 0}|${text}`;
      setPlaying(text);
      try {
        if (enabled) {
          let url = urlCache.get(key);
          if (!url) {
            const qs = new URLSearchParams({
              text,
              ...(opts.slow ? { slow: "1" } : {}),
              ...(opts.voice ? { voice: opts.voice } : {}),
              ...(opts.purpose ? { purpose: opts.purpose } : {}),
            });
            const res = await fetch(`/api/tts?${qs}`);
            if (res.ok) {
              url = URL.createObjectURL(await res.blob());
              urlCache.set(key, url);
            }
          }
          if (url) {
            setSource("elevenlabs");
            audioRef.current?.pause();
            const a = new Audio(url);
            audioRef.current = a;
            await new Promise<void>((resolve) => {
              a.onended = () => resolve();
              a.onerror = () => resolve();
              a.play().catch(() => resolve());
            });
            return;
          }
        }
        setSource("browser");
        await browserSpeak(text, !!opts.slow, opts.purpose === "thought" ? "pl" : "es");
      } finally {
        setPlaying(null);
      }
    },
    [enabled],
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(null);
  }, []);

  return { play, stop, playing, source };
}
