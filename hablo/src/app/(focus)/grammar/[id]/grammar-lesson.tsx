"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Mic, X } from "lucide-react";
import type { grammarLesson } from "@/lib/services/grammar";
import { api } from "@/lib/client/api";
import { AnswerInput } from "@/components/answer-input";
import { PlayButton } from "@/components/play-button";
import { Button } from "@/components/ui/button";
import { Notice, Progress } from "@/components/ui/primitives";
import { useCapabilities } from "@/components/capabilities";
import { cn } from "@/lib/utils";

type Lesson = Extract<Awaited<ReturnType<typeof grammarLesson>>, { locked: false }>;
type ExResult = { verdict: "correct" | "minor" | "incorrect"; corrected: string | null; explanation: string; approximate: boolean; evaluator: string };
type MiniResult = { communicated: boolean; constructionOk: boolean; feedback: string; corrected: string | null; approximate: boolean };

export function GrammarLessonView({ lesson, itemId }: { lesson: Lesson; itemId: string | null }) {
  const router = useRouter();
  const caps = useCapabilities();
  const [phase, setPhase] = useState<"explain" | "practice" | "mini" | "done">("explain");
  const [exIdx, setExIdx] = useState(0);
  const [exResult, setExResult] = useState<ExResult | null>(null);
  const [correct, setCorrect] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [mini, setMini] = useState<MiniResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { topic, exercises } = lesson;
  const ex = exercises[exIdx];
  const q = topic.mini.questions[qIdx];
  const total = exercises.length + topic.mini.questions.length;
  const done = phase === "explain" ? 0 : phase === "practice" ? exIdx : phase === "mini" ? exercises.length + qIdx : total;

  async function answerEx(response: string, inputMode: "voice" | "text" | "choice") {
    setError(null);
    try {
      const r = await api<ExResult>(`/api/grammar/${topic.id}`, { method: "POST", json: { action: "exercise", index: ex.index, response, inputMode } });
      setExResult(r);
      if (r.verdict !== "incorrect") setCorrect((c) => c + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    }
  }

  async function answerMini(response: string, inputMode: "voice" | "text") {
    setError(null);
    try {
      setMini(await api<MiniResult>(`/api/grammar/${topic.id}`, { method: "POST", json: { action: "mini", index: qIdx, response, inputMode } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    }
  }

  async function complete() {
    await api(`/api/grammar/${topic.id}`, { method: "POST", json: { action: "complete" } }).catch(() => null);
    if (itemId) await api(`/api/plan/items/${itemId}`, { method: "PATCH", json: { status: "done" } }).catch(() => null);
    setPhase("done");
  }

  return (
    <div className="flex flex-1 flex-col pb-6">
      <div className="flex items-center gap-3 py-2">
        <Link href={itemId ? "/lesson" : "/grammar"} aria-label="Zamknij" className="-ml-2 rounded-full p-2 text-muted hover:bg-sunken">
          <X className="size-6" />
        </Link>
        <Progress value={(done / total) * 100} label="Postęp lekcji" />
      </div>

      {phase === "explain" && (
        <div className="animate-rise mt-4 flex-1 space-y-6">
          <div>
            <div className="text-sm text-muted">Etap {topic.stage}</div>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{topic.title}</h1>
            <p className="mt-1 text-muted">{topic.subtitle}</p>
          </div>
          <div className="space-y-3 text-[16px] leading-relaxed">
            {topic.explanation.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="space-y-3">
            {topic.examples.map((x) => (
              <div key={x.es} className="flex items-start gap-3 rounded-xl bg-sunken p-3">
                <PlayButton text={x.es} size="sm" slow={false} autoLabel={false} />
                <div>
                  <div className="font-serif text-[17px]" lang="es">
                    {x.es}
                  </div>
                  <div className="text-sm text-muted">{x.pl}</div>
                  {x.note && <div className="mt-0.5 text-xs text-accent">{x.note}</div>}
                </div>
              </div>
            ))}
          </div>
          <Button size="lg" className="w-full" onClick={() => setPhase("practice")}>
            Ćwiczymy
          </Button>
        </div>
      )}

      {phase === "practice" && ex && (
        <div className="animate-rise mt-6 flex flex-1 flex-col" key={exIdx}>
          <p className="text-sm text-muted">{ex.prompt_pl}</p>
          <div className="mt-3 font-serif text-[24px] leading-snug" lang={ex.type === "translate" ? "pl" : "es"}>
            {ex.text}
          </div>
          {ex.type === "speak" && (
            <div className="mt-3">
              <PlayButton text={ex.text} size="sm" autoLabel={false} />
            </div>
          )}
          <div className="mt-auto pt-8">
            {!exResult ? (
              ex.options ? (
                <div className="grid gap-2">
                  {ex.options.map((o) => (
                    <button key={o} onClick={() => answerEx(o, "choice")} className="rounded-2xl border border-line bg-surface px-4 py-4 text-left text-[17px]" lang="es">
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <AnswerInput preferText={ex.type === "fill"} onSubmit={(t, m) => answerEx(t, m)} />
              )
            ) : (
              <div className="animate-rise space-y-4">
                <div className={cn("rounded-2xl p-4", exResult.verdict === "correct" ? "bg-success-soft" : exResult.verdict === "minor" ? "bg-warn-soft" : "bg-danger-soft")}>
                  <div className={cn("font-semibold", exResult.verdict === "correct" ? "text-success" : exResult.verdict === "minor" ? "text-warn" : "text-danger")}>
                    {exResult.verdict === "correct" ? "¡Bien!" : exResult.verdict === "minor" ? "Prawie" : "Jeszcze nie"}
                  </div>
                  {exResult.corrected && exResult.verdict !== "correct" && (
                    <div className="mt-1 font-serif text-lg" lang="es">
                      {exResult.corrected}
                    </div>
                  )}
                  <p className="mt-1 text-sm">{exResult.explanation}</p>
                  {exResult.approximate && <p className="mt-1 text-xs text-muted">Ocena przybliżona (bez modelu AI).</p>}
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setExResult(null);
                    if (exIdx + 1 < exercises.length) setExIdx((i) => i + 1);
                    else setPhase("mini");
                  }}
                >
                  Dalej
                </Button>
              </div>
            )}
            {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}
          </div>
        </div>
      )}

      {phase === "mini" && q && (
        <div className="animate-rise mt-6 flex flex-1 flex-col" key={`m${qIdx}`}>
          <p className="text-sm text-muted">Mini-rozmowa · {topic.mini.intro_pl}</p>
          <div className="mt-5 flex items-start gap-3">
            <PlayButton text={q.es} size="md" autoLabel={false} />
            <div>
              <div className="font-serif text-[24px] leading-snug" lang="es">
                {q.es}
              </div>
              <div className="text-sm text-muted">{q.pl}</div>
            </div>
          </div>
          <div className="mt-auto pt-8">
            {!mini ? (
              <AnswerInput onSubmit={(t, m) => answerMini(t, m)} />
            ) : (
              <div className="animate-rise space-y-4">
                <Notice tone={mini.communicated && mini.constructionOk ? "success" : mini.communicated ? "warn" : "danger"}>
                  <div>{mini.feedback}</div>
                  {mini.corrected && !mini.constructionOk && (
                    <div className="mt-1 font-serif text-base" lang="es">
                      {mini.corrected}
                    </div>
                  )}
                </Notice>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setMini(null);
                    if (qIdx + 1 < topic.mini.questions.length) setQIdx((i) => i + 1);
                    else void complete();
                  }}
                >
                  Dalej
                </Button>
              </div>
            )}
            {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="animate-rise mt-16 flex-1 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-8" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold">Lekcja zakończona</h2>
          <p className="mt-1 text-muted">
            {correct} z {exercises.length} ćwiczeń poprawnie. Konstrukcja wróci w powtórkach i rozmowach, aż ją opanujesz.
          </p>
          <div className="mt-8 space-y-2">
            {caps.voice || caps.ai ? (
              <Button asChild variant="secondary" size="lg" className="w-full">
                <Link href={`/speak/session?mode=grammar&grammar=${topic.id}${caps.voice ? "" : "&channel=text"}`}>
                  <Mic /> Porozmawiaj z tą konstrukcją
                </Link>
              </Button>
            ) : null}
            <Button size="lg" className="w-full" onClick={() => router.push(itemId ? "/lesson" : "/grammar")}>
              {itemId ? "Wróć do lekcji" : "Mapa gramatyki"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
