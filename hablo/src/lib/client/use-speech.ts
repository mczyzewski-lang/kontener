"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays Spanish audio: ElevenLabs TTS through /api/tts (cached on the server),
 * or — when TTS is not configured — the browser's es-ES voice, reported as
 * source "browser" so the UI can label it honestly.
 */
const urlCache = new Map<string, string>();

function browserSpeak(text: string, slow: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = slow ? 0.7 : 0.9;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang === "es-ES") ?? voices.find((x) => x.lang.startsWith("es"));
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
    async (text: string, opts: { slow?: boolean; voice?: "female" | "male" } = {}) => {
      if (!text) return;
      const key = `${opts.voice ?? "f"}|${opts.slow ? 1 : 0}|${text}`;
      setPlaying(text);
      try {
        if (enabled) {
          let url = urlCache.get(key);
          if (!url) {
            const qs = new URLSearchParams({ text, ...(opts.slow ? { slow: "1" } : {}), ...(opts.voice ? { voice: opts.voice } : {}) });
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
        await browserSpeak(text, !!opts.slow);
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
