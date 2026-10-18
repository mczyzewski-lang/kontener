"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Progress, Textarea } from "@/components/ui/primitives";
import { AnswerInput } from "@/components/answer-input";
import { PlayButton } from "@/components/play-button";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type Level = "unknown" | "beginner" | "elementary" | "intermediate" | "advanced";
interface Placement {
  items: { entryId: string; lemma: string; band: number; options: string[] }[];
  communication: { id: string; pl: string }[];
}
interface Result {
  level: Level;
  claimed: number;
  placement: { band: string; correct: number; total: number }[];
  communication: { id: string; ok: boolean; feedback: string }[];
}

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "beginner", label: "Zaczynam od zera", hint: "Znam pojedyncze słowa" },
  { id: "elementary", label: "Podstawy", hint: "Przedstawię się, zamówię kawę" },
  { id: "intermediate", label: "Średnio zaawansowany", hint: "Dogadam się w codziennych sprawach" },
  { id: "advanced", label: "Zaawansowany", hint: "Rozmawiam swobodnie, chcę szlifować" },
  { id: "unknown", label: "Nie wiem", hint: "Sprawdź mnie testem" },
];
const MINUTES = [10, 20, 30, 45, 60];
const MOTIVATIONS = ["Mieszkam / zamieszkam w Hiszpanii", "Dom w Hiszpanii", "Podróże", "Biznes", "Rodzina i znajomi", "Dla siebie"];
const INTERESTS = ["jedzenie", "podróże", "sport", "biznes", "rodzina", "dom i remont", "kultura", "natura", "technologia", "muzyka"];

export function Onboarding({ situations }: { situations: { id: string; label: string }[] }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level | null>(null);
  const [doTest, setDoTest] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [motivation, setMotivation] = useState("");
  const [chosenSituations, setChosenSituations] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [pIdx, setPIdx] = useState(0);
  const [answers, setAnswers] = useState<{ entryId: string; answer: string }[]>([]);
  const [cIdx, setCIdx] = useState(0);
  const [comm, setComm] = useState<{ id: string; text: string; inputMode: "voice" | "text" }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testSteps = doTest ? 2 : 0;
  const total = 6 + testSteps;

  useEffect(() => {
    if (doTest && !placement) api<Placement>("/api/placement").then(setPlacement).catch((e) => setError(e.message));
  }, [doTest, placement]);

  async function finish(finalComm = comm) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("/api/onboarding", {
        method: "POST",
        json: {
          level: level ?? "unknown",
          dailyMinutes: minutes,
          motivation,
          situations: chosenSituations,
          interests,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw",
          displayName: name || null,
          placement: doTest ? answers : null,
          communication: doTest ? finalComm : null,
        },
      });
      setResult(r);
      setStep(total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (list: string[], v: string, set: (x: string[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const canNext = [true, !!level, doTest !== null, true, true, chosenSituations.length > 0][step] ?? true;

  return (
    <div className="flex flex-1 flex-col pb-6">
      {step < total && (
        <div className="flex items-center gap-3 py-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={cn("-ml-2 rounded-full p-2 text-muted", step === 0 && "invisible")}
            aria-label="Wstecz"
          >
            <ArrowLeft className="size-5" />
          </button>
          <Progress value={(step / total) * 100} label="Postęp konfiguracji" />
        </div>
      )}

      <div className="animate-rise mt-6 flex-1" key={step}>
        {step === 0 && (
          <Section title="¡Hola! Jestem Hablo." subtitle="Będę twoim nauczycielem hiszpańskiego z Hiszpanii. Kilka pytań, żeby dopasować program — zajmie to 2 minuty.">
            <label className="block text-sm text-muted">Jak mam się do ciebie zwracać? (opcjonalnie)</label>
            <Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Imię" autoComplete="given-name" />
          </Section>
        )}
        {step === 1 && (
          <Section title="Jaki jest twój poziom hiszpańskiego?">
            <Choices options={LEVELS.map((l) => ({ id: l.id, label: l.label, hint: l.hint }))} value={level} onChange={(v) => setLevel(v as Level)} />
          </Section>
        )}
        {step === 2 && (
          <Section title="Krótki test na start?" subtitle="Ok. 3 minuty: rozpoznawanie słów i trzy proste wypowiedzi. Dzięki temu nie będziesz przerabiać słów, które już znasz.">
            <Choices
              options={[
                { id: "yes", label: "Tak, sprawdź mnie", hint: "Zalecane" },
                { id: "no", label: "Pomiń", hint: "Zacznę od najczęstszych słów; znane szybko odhaczysz" },
              ]}
              value={doTest === null ? null : doTest ? "yes" : "no"}
              onChange={(v) => setDoTest(v === "yes")}
            />
          </Section>
        )}
        {step === 3 && (
          <Section title="Ile czasu dziennie chcesz poświęcać?">
            <div className="grid grid-cols-5 gap-2">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  className={cn("rounded-2xl border py-4 text-center", minutes === m ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface")}
                >
                  <div className="text-xl font-semibold">{m}</div>
                  <div className="text-xs text-muted">min</div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">Plan dnia i tak dopasuje się do zaległości — możesz go zmieniać codziennie.</p>
          </Section>
        )}
        {step === 4 && (
          <Section title="Dlaczego uczysz się hiszpańskiego?">
            <Chips options={MOTIVATIONS} selected={motivation ? [motivation] : []} onToggle={(v) => setMotivation(v)} />
            <Textarea className="mt-3" value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="Albo opisz własnymi słowami…" />
          </Section>
        )}
        {step === 5 && (
          <Section title="Jakie sytuacje są dla ciebie najważniejsze?" subtitle="Wybierz kilka. Program częściej sięgnie po te tematy.">
            <div className="grid grid-cols-2 gap-2">
              {situations.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggle(chosenSituations, s.id, setChosenSituations)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-[15px]",
                    chosenSituations.includes(s.id) ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-6 text-sm text-muted">Zainteresowania (do historii i rozmów):</div>
            <div className="mt-2">
              <Chips options={INTERESTS} selected={interests} onToggle={(v) => toggle(interests, v, setInterests)} />
            </div>
          </Section>
        )}
        {step === 6 && doTest && (
          <Section title="Co znaczy to słowo?" subtitle={`Słowo ${Math.min(pIdx + 1, placement?.items.length ?? 0)} z ${placement?.items.length ?? "…"} · nie zgaduj — „Nie wiem” jest w porządku.`}>
            {!placement ? (
              <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted" />
            ) : pIdx < placement.items.length ? (
              <div className="space-y-5">
                <div className="flex items-center justify-center gap-3">
                  <span className="font-serif text-4xl" lang="es">
                    {placement.items[pIdx].lemma}
                  </span>
                  <PlayButton text={placement.items[pIdx].lemma} size="sm" slow={false} autoLabel={false} />
                </div>
                <div className="grid gap-2">
                  {placement.items[pIdx].options.map((o) => (
                    <button
                      key={o}
                      onClick={() => {
                        setAnswers((a) => [...a, { entryId: placement.items[pIdx].entryId, answer: o }]);
                        setPIdx((i) => i + 1);
                      }}
                      className={cn("rounded-2xl border border-line bg-surface px-4 py-3.5 text-left", o === "Nie wiem" && "text-muted")}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted">Gotowe! Teraz trzy krótkie wypowiedzi.</div>
            )}
          </Section>
        )}
        {step === 7 && doTest && placement && (
          <Section title="Powiedz po hiszpańsku" subtitle={`Zadanie ${Math.min(cIdx + 1, 3)} z 3 · odpowiedz głosem albo napisz. Możesz pominąć.`}>
            {cIdx < placement.communication.length && (
              <div className="space-y-6">
                <p className="text-xl leading-snug">{placement.communication[cIdx].pl}</p>
                <AnswerInput
                  multiline
                  submitLabel="Dalej"
                  onSubmit={(text, inputMode) => {
                    const next = [...comm, { id: placement.communication[cIdx].id, text, inputMode }];
                    setComm(next);
                    if (cIdx + 1 >= placement.communication.length) void finish(next);
                    else setCIdx((i) => i + 1);
                  }}
                />
                <Button
                  variant="ghost"
                  className="w-full text-muted"
                  onClick={() => {
                    if (cIdx + 1 >= placement.communication.length) void finish();
                    else setCIdx((i) => i + 1);
                  }}
                >
                  Nie wiem — pomiń
                </Button>
              </div>
            )}
          </Section>
        )}
        {step === total && result && (
          <Section title="Twój program jest gotowy" subtitle="Pierwszy dzień nauki czeka na ekranie głównym.">
            <div className="space-y-3 text-[15px]">
              <p>
                Poziom startowy: <strong>{LEVELS.find((l) => l.id === result.level)?.label}</strong>
              </p>
              {result.claimed > 0 && (
                <p>
                  Uznałem za znane ok. <strong>{Math.round(result.claimed / 2)}</strong> słów. Nie będziesz ich przerabiać od zera — w ciągu najbliższych tygodni pojawią
                  się w krótkich powtórkach weryfikujących.
                </p>
              )}
              {result.communication.map((c) => (
                <p key={c.id} className="text-sm text-muted">
                  {c.ok ? "✓" : "·"} {c.feedback}
                </p>
              ))}
            </div>
            <Button
              size="lg"
              className="mt-8 w-full"
              onClick={() => {
                // Full page load on purpose: the client router may still hold the cached
                // pre-onboarding redirect for "/", which would bounce back here.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/");
              }}
            >
              Zaczynamy <ArrowRight />
            </Button>
          </Section>
        )}
      </div>

      {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}
      {step < 6 && (
        <Button
          size="lg"
          className="w-full"
          disabled={!canNext || busy}
          onClick={() => {
            if (step === 5 && !doTest) void finish();
            else setStep((s) => s + 1);
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : step === 5 && !doTest ? <Check /> : null}
          {step === 5 && !doTest ? "Przygotuj mój program" : "Dalej"}
        </Button>
      )}
      {step === 6 && placement && pIdx >= placement.items.length && (
        <Button size="lg" className="w-full" onClick={() => setStep(7)}>
          Dalej
        </Button>
      )}
      {busy && step >= 6 && <p className="text-center text-sm text-muted">Przygotowuję twój program…</p>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Choices({ options, value, onChange }: { options: { id: string; label: string; hint?: string }[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("rounded-2xl border px-4 py-3.5 text-left", value === o.id ? "border-accent bg-accent-soft" : "border-line bg-surface")}
        >
          <div className={cn("font-medium", value === o.id && "text-accent")}>{o.label}</div>
          {o.hint && <div className="text-sm text-muted">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

function Chips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onToggle(o)}
          className={cn("rounded-full border px-3.5 py-2 text-sm", selected.includes(o) ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
