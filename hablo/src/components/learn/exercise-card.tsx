"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb, Volume2 } from "lucide-react";
import type { QueueItem, AnswerResult } from "@/lib/services/review";
import { AnswerInput } from "@/components/answer-input";
import { PlayButton } from "@/components/play-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { useSpeech } from "@/lib/client/use-speech";
import { useCapabilities } from "@/components/capabilities";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const SKILL_LABEL = { listening: "Rozumienie ze słuchu", recall: "Aktywne przypominanie", speaking: "Mówienie" } as const;

export function ExerciseCard({
  item,
  source,
  onDone,
}: {
  item: QueueItem;
  source: "flashcard" | "new_words" | "manual";
  onDone: (result: AnswerResult) => void;
}) {
  const ex = item.exercise;
  const caps = useCapabilities();
  const { play, playing } = useSpeech(caps.tts);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [hint, setHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
    // Auto-play listening prompts (works after the first user gesture on iOS).
    if (ex.audioText) void play(ex.audioText).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.key]);

  async function answer(response: string, inputMode: "voice" | "text" | "choice") {
    setError(null);
    try {
      const r = await api<AnswerResult>("/api/review/answer", {
        method: "POST",
        json: {
          entryId: ex.entryId,
          skill: ex.skill,
          type: ex.type,
          exampleIdx: ex.exampleIdx,
          response,
          inputMode,
          latencyMs: Date.now() - shownAt.current,
          assisted: hint,
          source,
        },
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd zapisu odpowiedzi");
    }
  }

  return (
    <div className="animate-rise flex flex-1 flex-col">
      <div className="flex items-center justify-between">
        <Badge>{SKILL_LABEL[ex.skill]}</Badge>
        {ex.hint && !result && (
          <button
            type="button"
            onClick={() => setHint(true)}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
            aria-label="Podpowiedź"
          >
            <Lightbulb className="size-4" /> Podpowiedź
          </button>
        )}
      </div>

      <div className="mt-8 text-center">
        <p className="text-[15px] text-muted">{ex.instruction}</p>
        {ex.prompt && (
          <div className="mt-3 whitespace-pre-line font-serif text-[26px] leading-snug" lang={ex.type === "recall_say" || ex.type === "translate" || ex.type === "speak_prompt" ? "pl" : "es"}>
            {ex.prompt.split("\n").map((line, i) => (
              <span key={i} className={cn("block", i > 0 && "mt-2 font-sans text-base text-muted")}>
                {line}
              </span>
            ))}
          </div>
        )}
        {ex.audioText && (
          <button
            type="button"
            onClick={() => play(ex.audioText!)}
            className={cn(
              "mx-auto mt-4 flex size-20 items-center justify-center rounded-full bg-accent-soft text-accent active:scale-95",
              playing && "animate-pulse-ring",
            )}
            aria-label="Odtwórz nagranie"
          >
            <Volume2 className="size-9" />
          </button>
        )}
        {hint && ex.hint && <p className="mt-4 text-sm text-accent">{ex.hint}</p>}
      </div>

      <div className="mt-auto pt-8">
        {!result ? (
          ex.inputModes.includes("choice") && ex.options ? (
            <div className="grid gap-2">
              {ex.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={!!chosen}
                  onClick={() => {
                    setChosen(o);
                    void answer(o, "choice");
                  }}
                  className={cn(
                    "rounded-2xl border bg-surface px-4 py-4 text-left text-[17px] transition-colors active:scale-[0.99]",
                    chosen === o ? "border-accent" : "border-line hover:border-line-strong",
                  )}
                  lang={ex.type === "listen_choose" ? "pl" : "es"}
                >
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <AnswerInput multiline={ex.type === "own_sentence"} onSubmit={(t, m) => answer(t, m)} />
          )
        ) : (
          <ResultPanel result={result} reveal={ex.reveal} onNext={() => onDone(result)} />
        )}
        {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}

export function ResultPanel({
  result,
  reveal,
  onNext,
}: {
  result: AnswerResult;
  reveal: { es: string; pl: string; note: string | null };
  onNext: () => void;
}) {
  const tone = result.verdict === "correct" ? "success" : result.verdict === "minor" ? "warn" : "danger";
  const title = result.verdict === "correct" ? "¡Correcto!" : result.verdict === "minor" ? "Prawie dobrze" : "Jeszcze nie";
  return (
    <div className="animate-rise space-y-4">
      <div
        className={cn(
          "rounded-2xl p-4",
          tone === "success" && "bg-success-soft",
          tone === "warn" && "bg-warn-soft",
          tone === "danger" && "bg-danger-soft",
        )}
      >
        <div className={cn("font-semibold", tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "text-danger")}>{title}</div>
        {result.verdict !== "correct" && (
          <div className="mt-1 font-serif text-lg" lang="es">
            {result.corrected ?? result.expected}
          </div>
        )}
        {result.explanation && <p className="mt-1 text-sm text-ink-2">{result.explanation}</p>}
        {result.approximate && <p className="mt-2 text-xs text-muted">Ocena przybliżona (bez modelu AI).</p>}
        {result.evaluator === "test" && <p className="mt-2 text-xs text-muted">[TEST] ocena atrapy</p>}
      </div>
      <div className="flex items-start gap-3 px-1">
        <PlayButton text={reveal.es.split(" — ").pop() ?? reveal.es} size="sm" slow={false} autoLabel={false} />
        <div className="text-sm">
          <div className="font-serif text-base" lang="es">
            {reveal.es}
          </div>
          <div className="text-muted">{reveal.pl}</div>
        </div>
      </div>
      <Button size="lg" className="w-full" onClick={onNext} autoFocus>
        Dalej
      </Button>
    </div>
  );
}
