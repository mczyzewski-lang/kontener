"use client";

import { Volume2, Snail } from "lucide-react";
import { useSpeech } from "@/lib/client/use-speech";
import { useCapabilities } from "@/components/capabilities";
import { cn } from "@/lib/utils";

/** Pronunciation button (+ slow variant). Shows when the browser voice is used instead of ElevenLabs. */
export function PlayButton({
  text,
  slow = true,
  size = "md",
  className,
  label,
  autoLabel = true,
}: {
  text: string;
  slow?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
  autoLabel?: boolean;
}) {
  const caps = useCapabilities();
  const { play, playing, source } = useSpeech(caps.tts);
  const dims = { sm: "size-9", md: "size-11", lg: "size-16" }[size];
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <button
        type="button"
        aria-label={label ?? `Odtwórz: ${text}`}
        onClick={() => play(text)}
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-accent-soft text-accent transition active:scale-95",
          dims,
          playing === text && "animate-pulse-ring",
        )}
      >
        <Volume2 className={size === "lg" ? "size-7" : "size-5"} />
      </button>
      {slow && (
        <button
          type="button"
          aria-label="Odtwórz wolniej"
          onClick={() => play(text, { slow: true })}
          className="inline-flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-sunken active:scale-95"
        >
          <Snail className="size-4" />
        </button>
      )}
      {autoLabel && source === "browser" && (
        <span className="text-[11px] text-faint" title="ElevenLabs TTS nie jest skonfigurowany">
          głos przeglądarki
        </span>
      )}
    </div>
  );
}
