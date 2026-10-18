"use client";

import { useState } from "react";
import { Keyboard, Mic, Square, Loader2, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import { useRecorder } from "@/lib/client/use-recorder";
import { useCapabilities } from "@/components/capabilities";
import { cn } from "@/lib/utils";

/**
 * Voice-first answer input. Tap the microphone, speak, tap again; the
 * transcript is shown before checking so recognition errors can be retried.
 * Typing is always available as an alternative.
 */
export function AnswerInput({
  onSubmit,
  disabled,
  multiline = false,
  placeholder = "Napisz po hiszpańsku…",
  preferText = false,
  submitLabel = "Sprawdź",
}: {
  onSubmit: (text: string, mode: "voice" | "text") => void | Promise<void>;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
  preferText?: boolean;
  submitLabel?: string;
}) {
  const caps = useCapabilities();
  const rec = useRecorder(caps.stt);
  const voiceOk = rec.source !== "none";
  const [mode, setMode] = useState<"voice" | "text">(voiceOk && !preferText ? "voice" : "text");
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string, m: "voice" | "text") {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onSubmit(value.trim(), m);
      setText("");
      setHeard(null);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (rec.state === "recording") {
      const t = await rec.stop();
      if (t) setHeard(t);
    } else {
      setHeard(null);
      await rec.start();
    }
  }

  if (mode === "text" || !voiceOk) {
    const Field = multiline ? Textarea : Input;
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text, "text");
        }}
      >
        <Field
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setText(e.target.value)}
          placeholder={placeholder}
          autoCapitalize="sentences"
          autoCorrect="off"
          spellCheck={false}
          lang="es"
          disabled={disabled || busy}
          aria-label="Twoja odpowiedź"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" className="flex-1" disabled={disabled || busy || !text.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} {submitLabel}
          </Button>
          {voiceOk && (
            <Button type="button" variant="secondary" size="icon" aria-label="Odpowiedz głosem" onClick={() => setMode("voice")}>
              <Mic />
            </Button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      {heard ? (
        <div className="animate-rise rounded-xl bg-sunken px-4 py-3">
          <div className="text-xs text-muted">
            Usłyszałem{rec.source === "browser" ? " (rozpoznawanie mowy przeglądarki)" : ""}:
          </div>
          <div className="mt-0.5 font-serif text-lg" lang="es">
            {heard}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">
          {rec.state === "recording" ? "Mów… dotknij, aby zakończyć" : rec.state === "transcribing" ? "Rozpoznaję…" : "Dotknij mikrofonu i odpowiedz na głos"}
        </p>
      )}
      {rec.error && <p className="text-center text-sm text-danger">{rec.error}</p>}
      <div className="flex items-center justify-center gap-4">
        <Button type="button" variant="ghost" size="icon" aria-label="Napisz odpowiedź" onClick={() => setMode("text")}>
          <Keyboard />
        </Button>
        {heard ? (
          <>
            <Button type="button" variant="secondary" size="icon" aria-label="Nagraj ponownie" onClick={() => setHeard(null)} disabled={busy}>
              <RotateCcw />
            </Button>
            <Button type="button" size="lg" onClick={() => submit(heard, "voice")} disabled={disabled || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />} {submitLabel}
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggleRecording}
            disabled={disabled || rec.state === "transcribing"}
            aria-label={rec.state === "recording" ? "Zakończ nagrywanie" : "Nagraj odpowiedź"}
            className={cn(
              "inline-flex size-20 items-center justify-center rounded-full text-accent-ink transition active:scale-95 disabled:opacity-50",
              rec.state === "recording" ? "animate-pulse-ring bg-accent-hover" : "bg-accent",
            )}
          >
            {rec.state === "transcribing" ? (
              <Loader2 className="size-8 animate-spin" />
            ) : rec.state === "recording" ? (
              <Square className="size-7 fill-current" />
            ) : (
              <Mic className="size-8" />
            )}
          </button>
        )}
        <span className="size-11" aria-hidden />
      </div>
    </div>
  );
}
