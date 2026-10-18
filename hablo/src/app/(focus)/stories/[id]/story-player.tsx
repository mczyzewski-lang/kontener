"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Languages, Pause, Play, X } from "lucide-react";
import type { getStoryView } from "@/lib/services/stories";
import { api } from "@/lib/client/api";
import { useSpeech } from "@/lib/client/use-speech";
import { useCapabilities } from "@/components/capabilities";
import { AnswerInput } from "@/components/answer-input";
import { PlayButton } from "@/components/play-button";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Story = Awaited<ReturnType<typeof getStoryView>>;
type Eval = {
  summary_pl: string;
  score: number;
  used_target_lemmas: string[];
  missing_target_lemmas: string[];
  mistakes: { original: string; corrected: string; explanation_pl: string }[];
  strengths_pl: string[];
  approximate?: boolean;
  evaluator?: string;
};

const STAGES = ["Słuchaj", "Czytaj", "Słowa", "Pytania", "Opowiedz", "Twoja historia"];
const VARIANT_NOTE: Record<string, string> = {
  past: "Ta sama historia — tym razem w czasie przeszłym.",
  extended: "Znasz już tę historię. Tu dzieje się coś więcej.",
  perspective: "Ta sama historia z perspektywy innej osoby.",
  future: "Ta sama historia jako plan na przyszłość.",
};

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:"«»()…—–]/g, "").trim();
}

export function StoryPlayer({ story, itemId }: { story: Story; itemId: string | null }) {
  const router = useRouter();
  const caps = useCapabilities();
  const { play, stop, playing } = useSpeech(caps.tts);
  const [stage, setStage] = useState(Math.min(story.stage, 5));
  const [playingAll, setPlayingAll] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [showText, setShowText] = useState(false);
  const [showPl, setShowPl] = useState<Set<number>>(new Set());
  const [gloss, setGloss] = useState<{ word: string; lemma: string; pl: string } | null>(null);
  const [qAnswers, setQAnswers] = useState<string[]>([]);
  const [qResults, setQResults] = useState<{ correct: boolean; expected: string; feedback: string | null }[] | null>(null);
  const [retell, setRetell] = useState<Eval | null>(null);
  const [own, setOwn] = useState<Eval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = story.body;

  async function go(next: number) {
    stop();
    setStage(next);
    setGloss(null);
    await api(`/api/stories/${story.id}`, { method: "POST", json: { action: "stage", stage: next } }).catch(() => null);
  }

  async function playAll() {
    if (playingAll) {
      stop();
      setPlayingAll(false);
      setCurrent(null);
      return;
    }
    setPlayingAll(true);
    for (let i = 0; i < body.sentences.length; i++) {
      setCurrent(i);
      await play(body.sentences[i].es);
    }
    setCurrent(null);
    setPlayingAll(false);
  }

  function tapWord(raw: string) {
    const key = normalize(raw);
    const g = story.gloss[key];
    setGloss(g ? { word: raw, lemma: g.lemma, pl: g.pl } : { word: raw, lemma: raw, pl: "—" });
    void api(`/api/stories/${story.id}`, { method: "POST", json: { action: "lookup", form: key, entryId: g?.entryId ?? null } }).catch(() => null);
  }

  async function finish() {
    await api(`/api/stories/${story.id}`, { method: "POST", json: { action: "complete" } });
    if (itemId) await api(`/api/plan/items/${itemId}`, { method: "PATCH", json: { status: "done" } }).catch(() => null);
    router.push(itemId ? "/lesson" : "/stories");
    router.refresh();
  }

  const renderSentence = (i: number, interactive: boolean) => {
    const s = body.sentences[i];
    return (
      <p key={i} className={cn("rounded-lg px-2 py-1 transition-colors", current === i && "bg-accent-soft")}>
        <span className="font-serif text-[21px] leading-relaxed" lang="es">
          {s.es.split(/(\s+)/).map((tok, k) =>
            /\s+/.test(tok) || !interactive ? (
              tok
            ) : (
              <button key={k} type="button" onClick={() => tapWord(tok)} className="rounded hover:bg-sunken active:bg-accent-soft">
                {tok}
              </button>
            ),
          )}
        </span>
        {interactive && (
          <button
            type="button"
            onClick={() => setShowPl((p) => new Set(p.has(i) ? [...p].filter((x) => x !== i) : [...p, i]))}
            className="ml-1 inline-flex align-middle text-faint"
            aria-label="Pokaż tłumaczenie zdania"
          >
            <Languages className="size-4" />
          </button>
        )}
        {showPl.has(i) && <span className="mt-0.5 block text-[15px] text-muted">{s.pl}</span>}
      </p>
    );
  };

  const renderEvaluation = (e: Eval) => (
    <div className="animate-rise space-y-3">
      <Notice tone={e.score >= 0.7 ? "success" : e.score >= 0.4 ? "warn" : "neutral"}>
        <div className="font-medium">Wynik: {Math.round(e.score * 100)}%</div>
        <p className="mt-1">{e.summary_pl}</p>
        {e.approximate && <p className="mt-1 text-xs opacity-80">Ocena przybliżona (bez modelu AI).</p>}
      </Notice>
      {e.missing_target_lemmas.length > 0 && (
        <p className="text-sm">
          <span className="text-muted">Zabrakło słów (wrócą w powtórkach): </span>
          <span lang="es" className="font-medium">{e.missing_target_lemmas.join(", ")}</span>
        </p>
      )}
      {e.mistakes.map((m) => (
        <div key={m.original} className="text-sm">
          <span className="text-danger line-through" lang="es">{m.original}</span> → <span className="font-medium" lang="es">{m.corrected}</span>
          <div className="text-muted">{m.explanation_pl}</div>
        </div>
      ))}
      {e.strengths_pl.map((x) => (
        <p key={x} className="text-sm text-success">✓ {x}</p>
      ))}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col pb-6">
      <div className="flex items-center gap-2 py-2">
        <Link href={itemId ? "/lesson" : "/stories"} aria-label="Zamknij" className="-ml-2 rounded-full p-2 text-muted hover:bg-sunken">
          <X className="size-6" />
        </Link>
        <ol className="flex flex-1 gap-1">
          {STAGES.map((label, i) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                onClick={() => i <= Math.max(stage, story.stage) && go(i)}
                className={cn("h-1.5 w-full rounded-full", i < stage ? "bg-accent" : i === stage ? "bg-accent/50" : "bg-sunken")}
                aria-label={`Etap ${i + 1}: ${label}`}
              />
            </li>
          ))}
        </ol>
      </div>

      <header className="mt-4">
        <div className="text-sm text-muted">
          Etap {stage + 1} z 6 · {STAGES[stage]}
        </div>
        <h1 className="mt-1 font-serif text-[28px] leading-tight" lang="es">
          {body.title}
        </h1>
        {story.variant !== "original" && VARIANT_NOTE[story.variant] && <p className="mt-1 text-sm text-accent">{VARIANT_NOTE[story.variant]}</p>}
      </header>

      <div className="mt-6 flex-1">
        {stage === 0 && (
          <div className="space-y-6">
            <p className="text-muted">Najpierw tylko słuchaj. Spróbuj wyobrazić sobie scenę — nie musisz rozumieć każdego słowa.</p>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={playAll}
                className={cn("flex size-24 items-center justify-center rounded-full bg-accent text-white active:scale-95", playingAll && "animate-pulse-ring")}
                aria-label={playingAll ? "Zatrzymaj" : "Odtwórz historię"}
              >
                {playingAll ? <Pause className="size-10" /> : <Play className="ml-1 size-10" />}
              </button>
            </div>
            <button type="button" onClick={() => setShowText((v) => !v)} className="mx-auto flex items-center gap-1.5 text-sm text-muted">
              {showText ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {showText ? "Ukryj tekst" : "Pokaż tekst"}
            </button>
            {showText && <div className="space-y-1">{body.sentences.map((_, i) => renderSentence(i, false))}</div>}
          </div>
        )}

        {stage === 1 && (
          <div className="space-y-1">
            <p className="mb-3 text-sm text-muted">Dotknij słowa, żeby zobaczyć znaczenie. Ikona obok zdania pokazuje tłumaczenie.</p>
            {body.sentences.map((_, i) => renderSentence(i, true))}
            <div className="pt-3">
              <Button variant="secondary" size="sm" onClick={playAll}>
                {playingAll ? <Pause /> : <Play />} {playingAll ? "Zatrzymaj" : "Czytaj na głos"}
              </Button>
            </div>
          </div>
        )}

        {stage === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">Słowa, które ta historia ćwiczy. Powtórz każde na głos.</p>
            {story.targets.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <div>
                  <div className="font-serif text-lg" lang="es">{t.lemma}</div>
                  <div className="text-sm text-muted">{t.pl}</div>
                </div>
                <PlayButton text={t.lemma} size="sm" slow={false} autoLabel={false} />
              </div>
            ))}
            {body.glossary.filter((g) => g.is_new).length > 0 && (
              <div className="pt-2 text-sm">
                <span className="text-muted">Nowe w tej historii: </span>
                {body.glossary.filter((g) => g.is_new).map((g) => `${g.form} (${g.pl})`).join(", ")}
              </div>
            )}
          </div>
        )}

        {stage === 3 && (
          <div className="space-y-6">
            {body.questions.map((q, i) => (
              <div key={q.q_es} className="space-y-2">
                <div className="flex items-start gap-2">
                  <PlayButton text={q.q_es} size="sm" slow={false} autoLabel={false} />
                  <div>
                    <div className="font-serif text-lg" lang="es">{q.q_es}</div>
                    <div className="text-sm text-muted">{q.q_pl}</div>
                  </div>
                </div>
                {qResults ? (
                  <div className={cn("rounded-xl px-3 py-2 text-sm", qResults[i]?.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                    {qResults[i]?.correct ? "✓ " : "✗ "}
                    {qAnswers[i] || "—"}
                    {!qResults[i]?.correct && <span className="block text-ink-2" lang="es">Np.: {qResults[i]?.expected}</span>}
                    {qResults[i]?.feedback && <span className="block text-ink-2">{qResults[i]?.feedback}</span>}
                  </div>
                ) : qAnswers[i] !== undefined ? (
                  <p className="rounded-xl bg-sunken px-3 py-2 font-serif" lang="es">{qAnswers[i]}</p>
                ) : i === qAnswers.length ? (
                  <AnswerInput
                    submitLabel="Odpowiedz"
                    onSubmit={async (t, m) => {
                      const next = [...qAnswers, t];
                      setQAnswers(next);
                      if (next.length === body.questions.length) {
                        try {
                          const r = await api<{ results: typeof qResults }>(`/api/stories/${story.id}`, {
                            method: "POST",
                            json: { action: "questions", answers: next, inputMode: m },
                          });
                          setQResults(r.results);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Błąd");
                        }
                      }
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}

        {stage === 4 && (
          <div className="space-y-5">
            <p className="text-muted">Opowiedz tę historię własnymi słowami — bez patrzenia na tekst. Wystarczy kilka zdań.</p>
            <div className="flex flex-wrap gap-1.5">
              {story.targets.map((t) => (
                <Badge key={t.id}>{t.lemma}</Badge>
              ))}
            </div>
            {retell ? (
              renderEvaluation(retell)
            ) : (
              <AnswerInput
                multiline
                submitLabel="Oceń"
                onSubmit={async (t, m) => {
                  try {
                    setRetell(await api<Eval>(`/api/stories/${story.id}`, { method: "POST", json: { action: "retell", text: t, inputMode: m } }));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Błąd");
                  }
                }}
              />
            )}
          </div>
        )}

        {stage === 5 && (
          <div className="space-y-5">
            <p className="text-muted">
              Teraz stwórz podobną historię o sobie — o twoim domu, rodzinie, pracy albo planach. Użyj jak najwięcej słów z tej historii.
            </p>
            {own ? (
              renderEvaluation(own)
            ) : (
              <AnswerInput
                multiline
                submitLabel="Oceń"
                onSubmit={async (t, m) => {
                  try {
                    setOwn(await api<Eval>(`/api/stories/${story.id}`, { method: "POST", json: { action: "own_story", text: t, inputMode: m } }));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Błąd");
                  }
                }}
              />
            )}
          </div>
        )}
      </div>

      {gloss && (
        <div className="animate-rise fixed inset-x-4 bottom-28 z-30 mx-auto max-w-md rounded-2xl border border-line bg-surface p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-serif text-xl" lang="es">{gloss.word}</div>
              {gloss.lemma.toLowerCase() !== normalize(gloss.word) && <div className="text-xs text-muted">od: {gloss.lemma}</div>}
              <div className="mt-1">{gloss.pl}</div>
            </div>
            <div className="flex items-center gap-1">
              <PlayButton text={gloss.word} size="sm" slow={false} autoLabel={false} />
              <button onClick={() => setGloss(null)} aria-label="Zamknij" className="p-2 text-muted">
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mb-2 text-center text-sm text-danger">{error}</p>}
      <div className="mt-6">
        {stage < 5 ? (
          <Button
            size="lg"
            className="w-full"
            disabled={(stage === 3 && !qResults) || (stage === 4 && !retell) || !!playing}
            onClick={() => go(stage + 1)}
          >
            Dalej: {STAGES[stage + 1]}
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!own} onClick={finish}>
            <Check /> Zakończ historię
          </Button>
        )}
        {stage >= 3 && stage < 5 && ((stage === 3 && !qResults) || (stage === 4 && !retell)) && (
          <Button variant="ghost" className="mt-1 w-full text-muted" onClick={() => go(stage + 1)}>
            Pomiń ten etap
          </Button>
        )}
        {stage === 5 && !own && (
          <Button variant="ghost" className="mt-1 w-full text-muted" onClick={finish}>
            Zakończ bez własnej historii
          </Button>
        )}
      </div>
    </div>
  );
}
