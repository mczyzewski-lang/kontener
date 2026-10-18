"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Loader2, Check } from "lucide-react";
import type { AnswerResult, QueueItem } from "@/lib/services/review";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Empty, Progress } from "@/components/ui/primitives";
import { ExerciseCard } from "./exercise-card";
import { WordIntro } from "./word-intro";

type Step = { kind: "intro"; item: QueueItem } | { kind: "exercise"; item: QueueItem; retry: boolean };

/**
 * A flashcard session (reviews, new words, quick practice). Every answer is
 * saved immediately, so closing the app mid-session loses nothing; reopening
 * rebuilds the queue from the current state.
 */
export function LearnSession({ mode, itemId }: { mode: "review" | "new" | "practice"; itemId: string | null }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    const qs = new URLSearchParams({ mode, ...(itemId ? { item: itemId } : {}) });
    api<{ items: QueueItem[] }>(`/api/review/queue?${qs}`)
      .then(({ items }) => {
        const out: Step[] = [];
        const introduced = new Set<string>();
        for (const it of items) {
          if (mode === "new" && !introduced.has(it.entry.id)) {
            out.push({ kind: "intro", item: it });
            introduced.add(it.entry.id);
          }
          out.push({ kind: "exercise", item: it, retry: false });
        }
        setSteps(out);
        if (itemId && out.length) void api(`/api/plan/items/${itemId}`, { method: "PATCH", json: { status: "in_progress" } }).catch(() => null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"));
  }, [mode, itemId]);

  const finished = steps !== null && idx >= steps.length;
  useEffect(() => {
    if (finished && itemId) {
      void api(`/api/plan/items/${itemId}`, { method: "PATCH", json: { status: "done", result: stats } }).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, itemId]);

  const exerciseCount = useMemo(() => steps?.filter((s) => s.kind === "exercise").length ?? 0, [steps]);
  const doneCount = useMemo(() => steps?.slice(0, idx).filter((s) => s.kind === "exercise").length ?? 0, [steps, idx]);
  const title = mode === "new" ? "Nowe słowa" : mode === "practice" ? "Szybka praktyka" : "Powtórki";

  function next(result?: AnswerResult) {
    if (result && steps) {
      const step = steps[idx];
      setStats((s) => ({ correct: s.correct + (result.correct ? 1 : 0), total: s.total + 1 }));
      // A missed card comes back once at the end of the session (short-term learning step).
      if (!result.correct && step.kind === "exercise" && !step.retry) {
        setSteps([...steps, { ...step, retry: true }]);
      }
    }
    setIdx((i) => i + 1);
  }

  return (
    <div className="flex flex-1 flex-col pb-4">
      <div className="flex items-center gap-3 py-2">
        <Link href={itemId ? "/lesson" : "/"} aria-label="Zamknij" className="-ml-2 rounded-full p-2 text-muted hover:bg-sunken">
          <X className="size-6" />
        </Link>
        <Progress value={exerciseCount ? (doneCount / exerciseCount) * 100 : 0} label={title} />
        <span className="w-12 text-right text-sm tabular-nums text-muted">
          {doneCount}/{exerciseCount}
        </span>
      </div>

      {error && <p className="mt-10 text-center text-danger">{error}</p>}
      {!steps && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted" />
        </div>
      )}
      {steps && steps.length === 0 && (
        <div className="mt-10">
          <Empty title={mode === "new" ? "Nowe słowa na dziś są już za tobą" : "Brak kart do powtórki"}>
            {mode === "review" ? "Wszystko powtórzone — wróć jutro albo przejdź dalej." : "Świetnie!"}
          </Empty>
          <Button className="mt-6 w-full" size="lg" onClick={() => router.push(itemId ? "/lesson" : "/")}>
            Dalej
          </Button>
        </div>
      )}
      {steps && !finished && steps[idx] && (
        <div className="flex flex-1 flex-col pt-4" key={`${idx}`}>
          {steps[idx].kind === "intro" ? (
            <WordIntro entry={steps[idx].item.entry} onContinue={() => next()} />
          ) : (
            <ExerciseCard item={steps[idx].item} source={mode === "new" ? "new_words" : mode === "practice" ? "manual" : "flashcard"} onDone={next} />
          )}
        </div>
      )}
      {finished && steps && steps.length > 0 && (
        <div className="animate-rise mt-16 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-8" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold">{title}: gotowe</h2>
          <p className="mt-1 text-muted">
            {stats.correct} z {stats.total} odpowiedzi poprawnych. Każda odpowiedź została zapisana i zaplanowana w powtórkach.
          </p>
          <Button className="mt-8 w-full" size="lg" onClick={() => router.push(itemId ? "/lesson" : "/")}>
            {itemId ? "Wróć do lekcji" : "Wróć"}
          </Button>
        </div>
      )}
    </div>
  );
}
