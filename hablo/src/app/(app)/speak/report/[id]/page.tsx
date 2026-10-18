import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { getFeedback } from "@/lib/services/conversation";
import { getGrammarTopic, getScenario } from "@/lib/content";
import type { ConversationAnalysis, Mistake } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";
import { Badge, Card, Notice, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { PlayButton } from "@/components/play-button";
import { CapabilitiesProvider } from "@/components/capabilities";
import { serverCapabilities } from "@/lib/capabilities";

export const metadata = { title: "Raport z rozmowy" };

const SCORE_LABEL: Record<string, string> = {
  comprehension: "Rozumienie",
  fluency: "Płynność i samodzielność",
  grammar: "Poprawność gramatyczna",
  vocabulary: "Aktywny zasób słów",
  task_completion: "Realizacja zadania",
};

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string }> }) {
  const s = await requirePageSession();
  const { id } = await params;
  const { item } = await searchParams;
  const { session, feedback, turns } = await getFeedback(s, id);
  const fb = feedback;
  const mistakes = (fb?.mistakes as Mistake[]) ?? [];
  const missing = (fb?.missing_words as ConversationAnalysis["missing_words"]) ?? [];
  const strengths = (fb?.strengths as string[]) ?? [];
  const scores = fb?.scores as ConversationAnalysis["scores"] | null;
  const next = fb?.next_exercise as ConversationAnalysis["next_exercise"] | null;
  const nextHref =
    next?.type === "grammar" && next.grammar_topic_id && getGrammarTopic(next.grammar_topic_id)
      ? `/grammar/${next.grammar_topic_id}`
      : next?.type === "conversation" && next.scenario_id && getScenario(next.scenario_id)
        ? `/speak/session?scenario=${next.scenario_id}`
        : next?.type === "story"
          ? "/stories"
          : "/learn/review";

  return (
    <CapabilitiesProvider value={serverCapabilities()}>
      <div className="animate-fade-in space-y-7">
        <PageHeader
          title={session.title}
          subtitle={`${new Date(session.startedAt).toLocaleString("pl-PL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}${session.durationSecs ? ` · ${Math.max(1, Math.round(session.durationSecs / 60))} min` : ""}${session.channel === "text" ? " · tryb tekstowy" : ""}`}
        />
        {!fb && <Notice tone="warn">Ta rozmowa nie ma jeszcze analizy (mogła zostać przerwana przed zapisaniem).</Notice>}
        {fb && (
          <>
            <section>
              <SectionTitle>Podsumowanie</SectionTitle>
              <p className="text-[16px] leading-relaxed">{fb.summary}</p>
              {fb.analysis_source === "basic" && <p className="mt-2 text-xs text-muted">Analiza podstawowa — bez modelu AI nie oceniam błędów.</p>}
              {fb.analysis_source === "test" && <p className="mt-2 text-xs text-muted">[TEST] analiza atrapy (tryb testowy).</p>}
            </section>

            {scores && Object.values(scores).some((v) => v > 0) && (
              <section>
                <SectionTitle>{session.mode === "assessment" ? "Ocena tygodniowa" : "Ocena rozmowy"}</SectionTitle>
                <Card className="divide-y divide-line">
                  {Object.entries(scores).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between px-4 py-3">
                      <span>{SCORE_LABEL[k] ?? k}</span>
                      <span className="flex gap-1" aria-label={`${v} z 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i key={n} className={n <= v ? "size-2.5 rounded-full bg-accent" : "size-2.5 rounded-full bg-sunken"} />
                        ))}
                      </span>
                    </div>
                  ))}
                </Card>
                <p className="mt-2 text-xs text-muted">
                  Przybliżona ocena AI według stałych kryteriów Hablo — nie jest to certyfikowany test CEFR. Wymowa nie jest oceniana: transkrypcja nie mierzy akcentu.
                </p>
              </section>
            )}

            {mistakes.length > 0 && (
              <section>
                <SectionTitle>Najważniejsze błędy</SectionTitle>
                <div className="space-y-3">
                  {mistakes.map((m, i) => (
                    <Card key={i} className="p-4">
                      <div className="flex items-center gap-2">
                        <Badge tone={m.severity === "major" ? "danger" : "warn"}>{m.severity === "major" ? "ważny" : "drobny"}</Badge>
                        {m.category === "pronunciation_suspect" && <Badge>możliwy problem z wymową (z transkrypcji)</Badge>}
                      </div>
                      <div className="mt-2 font-serif text-[16px] text-danger line-through decoration-1" lang="es">
                        {m.original}
                      </div>
                      <p className="mt-1 text-sm text-ink-2">{m.explanation_pl}</p>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {mistakes.length > 0 && (
              <section>
                <SectionTitle>Poprawne wersje</SectionTitle>
                <div className="space-y-2">
                  {mistakes.map((m, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <PlayButton text={m.corrected} size="sm" slow={false} autoLabel={false} />
                      <div className="font-serif text-[17px]" lang="es">
                        {m.corrected}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {missing.length > 0 && (
              <section>
                <SectionTitle>Słowa, których zabrakło</SectionTitle>
                <Card className="divide-y divide-line">
                  {missing.map((m, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="font-serif text-[17px]" lang="es">
                          {m.es || "—"}
                        </div>
                        <div className="text-sm text-muted">{m.pl}</div>
                      </div>
                      {m.es && <PlayButton text={m.es} size="sm" slow={false} autoLabel={false} />}
                    </div>
                  ))}
                </Card>
                <p className="mt-2 text-xs text-muted">Dodane do powtórek z wysokim priorytetem.</p>
              </section>
            )}

            {strengths.length > 0 && (
              <section>
                <SectionTitle>Mocne strony</SectionTitle>
                <ul className="space-y-1.5">{strengths.map((x) => <li key={x}>✓ {x}</li>)}</ul>
              </section>
            )}

            {next && (
              <section>
                <SectionTitle>Następne ćwiczenie</SectionTitle>
                <Card className="p-4">
                  <p>{next.reason_pl}</p>
                  <Button asChild variant="soft" size="sm" className="mt-3">
                    <Link href={nextHref}>
                      Przejdź <ArrowRight />
                    </Link>
                  </Button>
                </Card>
              </section>
            )}
          </>
        )}

        {session.hasAudio && (
          <section>
            <SectionTitle>Nagranie</SectionTitle>
            <audio controls preload="none" src={`/api/conversation/${session.id}/audio`} className="w-full" />
          </section>
        )}

        {turns.length > 0 && (
          <details className="rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer font-medium">Transkrypcja ({turns.filter((t) => t.role === "user").length} twoich wypowiedzi)</summary>
            <div className="mt-3 space-y-2 text-[15px]">
              {turns.map((t) => (
                <p key={t.idx} className={t.role === "action" ? "text-center text-xs text-faint" : ""}>
                  {t.role === "action" ? (
                    `— ${t.text} —`
                  ) : (
                    <>
                      <span className="text-xs text-muted">{t.role === "user" ? "Ty" : session.title}: </span>
                      <span lang="es">{t.text}</span>
                      {t.assisted && <span className="text-xs text-faint"> (po podpowiedzi)</span>}
                    </>
                  )}
                </p>
              ))}
            </div>
          </details>
        )}

        <Button asChild size="lg" className="w-full">
          <Link href={item ? "/lesson" : "/speak"}>{item ? "Wróć do lekcji" : "Gotowe"}</Link>
        </Button>
      </div>
    </CapabilitiesProvider>
  );
}
