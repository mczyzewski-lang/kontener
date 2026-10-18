import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { progressStats } from "@/lib/services/stats";
import { Badge, Card, PageHeader, Progress, SectionTitle, Stat } from "@/components/ui/primitives";
import { MonthChart } from "@/components/month-chart";

export const metadata = { title: "Postępy" };

const SCORE_LABEL: Record<string, string> = {
  comprehension: "Rozumienie",
  fluency: "Płynność",
  grammar: "Gramatyka",
  vocabulary: "Słownictwo",
  task_completion: "Zadanie",
};

export default async function ProgressPage() {
  const s = await requirePageSession();
  const p = await progressStats(s);
  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader title="Postępy" subtitle="Liczy się samodzielna, zrozumiała komunikacja — nie tylko liczba słów." />

      <Card className="p-5">
        <div className="text-[13px] text-muted">Minuty samodzielnej, zrozumiałej rozmowy</div>
        <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{p.conversation.independentMinutes}</div>
        <p className="mt-1 text-xs text-muted">
          Czas rozmów × udział twoich wypowiedzi bez podpowiedzi × zrozumiałość (ocena AI).
          {p.conversation.independentApprox && " Część rozmów ma tylko analizę podstawową — wartość przybliżona."}
        </p>
      </Card>

      <section>
        <SectionTitle>Słownictwo</SectionTitle>
        <Card className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Rozpoznawane ze słuchu" value={p.vocab.recognized} />
            <Stat label="Aktywnie przypominane" value={p.vocab.recalled} />
            <Stat label="Używane w mowie" value={p.vocab.spoken} />
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <span>
                Opanowane: <strong>{p.vocab.mastered}</strong> / {p.vocab.goal}
              </span>
              <span className="text-muted">Poziom {p.vocab.band.level}</span>
            </div>
            <Progress className="mt-2" value={(p.vocab.mastered / p.vocab.goal) * 100} label="Opanowane słowa" />
            <p className="mt-2 text-xs text-muted">„Opanowane” = utrwalone w słuchu i w przypominaniu oraz użyte samodzielnie w mowie.</p>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Ostatnie 30 dni · minuty nauki</SectionTitle>
        <Card className="p-4">
          <MonthChart days={p.days} />
        </Card>
        <div className="mt-3 grid grid-cols-3 gap-4 px-1">
          <Stat label="Seria" value={`${p.activity.streak} dni`} />
          <Stat label="Aktywne dni (30)" value={p.activity.activeDays30} />
          <Stat label="Rozmowy łącznie" value={`${p.conversation.totalMinutes} min`} hint={`${p.conversation.sessions} sesji`} />
        </div>
      </section>

      <section>
        <SectionTitle>Proponowany kierunek</SectionTitle>
        <ul className="space-y-1.5 text-[15px]">{p.direction.map((d) => <li key={d}>→ {d}</li>)}</ul>
      </section>

      {p.problems.length > 0 && (
        <section>
          <SectionTitle>Największe problemy</SectionTitle>
          <Card className="divide-y divide-line">
            {p.problems.map((x) => (
              <div key={x.content} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <span>{x.content}</span>
                <Badge>{x.count}×</Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Gramatyka</SectionTitle>
        <Card className="divide-y divide-line">
          {p.grammar.map((g) => (
            <Link key={g.id} href={`/grammar/${g.id}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 text-sm tabular-nums text-muted">{g.stage}</span>
              <span className="flex-1 truncate text-sm">{g.title}</span>
              <span className="w-24">
                <Progress value={g.mastery * 100} className="h-1" label={g.title} />
              </span>
            </Link>
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>Testy tygodniowe</SectionTitle>
        {p.assessments.length === 0 ? (
          <p className="text-sm text-muted">Pierwszy test pojawi się w planie po kilku dniach nauki.</p>
        ) : (
          <div className="space-y-3">
            {p.assessments.map((a) => {
              const scores = a.scores as Record<string, number>;
              const report = a.report as { summary_pl?: string; areas_pl?: string[] };
              return (
                <Card key={a.weekStart} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Tydzień od {new Date(a.weekStart).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}</div>
                    {a.sessionId && (
                      <Link href={`/speak/report/${a.sessionId}`} className="text-sm text-accent">
                        raport
                      </Link>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                    {Object.entries(SCORE_LABEL).map(([k, label]) => (
                      <div key={k}>
                        <div className="text-lg font-semibold tabular-nums">{scores[k] ?? "—"}</div>
                        <div className="text-[10px] leading-tight text-muted">{label}</div>
                      </div>
                    ))}
                  </div>
                  {report.summary_pl && <p className="mt-3 text-sm text-ink-2">{report.summary_pl}</p>}
                </Card>
              );
            })}
            <p className="text-xs text-muted">Skala 1–5. Przybliżone oceny AI według stałych kryteriów — nie certyfikowany test CEFR.</p>
          </div>
        )}
      </section>
    </div>
  );
}
