import { requirePageSession, type Session } from "@/lib/session";
import { eq, gte } from "@/lib/db/db";
import { getPrefs } from "@/lib/learning/profile";
import { localDate } from "@/lib/learning/time";
import { getMemory } from "@/lib/learning/intelligence";
import { plannerInputs } from "@/lib/learning/plan-service";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui/primitives";
import { FinishFeedback } from "./finish-feedback";

export const metadata = { title: "Podsumowanie dnia" };

/** Daily feedback: what happened today (from real logs) and what tomorrow will focus on. */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const s = await requirePageSession();
  const { item } = await searchParams;
  const { minutes, reviews, accuracy, newWords, spoken, mistakes, strengths, memory, tomorrow } = await feedbackData(s);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Podsumowanie dnia" subtitle="Na podstawie twoich prawdziwych wyników z dziś." />
      <Card className="grid grid-cols-2 gap-5 p-5">
        <Stat label="Czas nauki" value={`${minutes} min`} />
        <Stat label="Skuteczność powtórek" value={accuracy === null ? "—" : `${accuracy}%`} hint={`${reviews.length} odpowiedzi`} />
        <Stat label="Nowe słowa" value={newWords} />
        <Stat label="Słowa użyte w rozmowie" value={spoken} hint="samodzielnie, bez podpowiedzi" />
      </Card>
      {strengths.length > 0 && (
        <section>
          <SectionTitle>Co poszło dobrze</SectionTitle>
          <ul className="space-y-1.5 text-[15px]">{strengths.map((x) => <li key={x}>· {x}</li>)}</ul>
        </section>
      )}
      {(mistakes.length > 0 || memory.length > 0) && (
        <section>
          <SectionTitle>Do poprawy</SectionTitle>
          <ul className="space-y-2 text-[15px]">
            {mistakes.map((m) => (
              <li key={m.corrected}>
                <span className="font-serif" lang="es">{m.corrected}</span>
                <span className="block text-sm text-muted">{m.explanation_pl}</span>
              </li>
            ))}
            {!mistakes.length && memory.map((m) => <li key={m.id} className="text-sm">{m.content}</li>)}
          </ul>
        </section>
      )}
      <section>
        <SectionTitle>Jutro</SectionTitle>
        <ul className="space-y-1.5 text-[15px] text-ink-2">
          <li>· Powtórki: ok. {tomorrow.dueCount} kart</li>
          <li>· Nowe słowa: {tomorrow.newQuota.count}</li>
          {tomorrow.grammarNext && <li>· Gramatyka: {tomorrow.grammarNext.title}</li>}
          {tomorrow.conversation && <li>· Rozmowa: {tomorrow.conversation.title}</li>}
          {tomorrow.assessmentDue && <li>· Cotygodniowy test rozmowy</li>}
        </ul>
      </section>
      <FinishFeedback itemId={item ?? null} />
    </div>
  );
}

/** Today's real results (kept outside the component: it reads the clock). */
async function feedbackData(s: Session) {
  const prefs = await getPrefs(s.db, s.userId);
  const today = localDate(prefs.timezone);
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const logs = (await s.db.select("vocabulary_review_logs", { where: [eq("user_id", s.userId), gte("reviewed_at", since)] })).filter(
    (l) => localDate(prefs.timezone, new Date(l.reviewed_at)) === today,
  );
  const events = await s.db.select("learning_events", { where: [eq("user_id", s.userId), eq("local_date", today)] });
  const minutes = Math.round(events.reduce((a, e) => a + e.minutes, 0));
  const reviews = logs.filter((l) => l.source !== "new_words" && l.source !== "conversation");
  const accuracy = reviews.length ? Math.round((reviews.filter((r) => r.correct).length / reviews.length) * 100) : null;
  const newWords = new Set(logs.filter((l) => l.source === "new_words").map((l) => l.entry_id)).size;
  const spoken = logs.filter((l) => l.source === "conversation" && l.scheduled).length;
  const fb = await s.db.select("conversation_feedback", { where: [eq("user_id", s.userId), gte("created_at", since)] });
  const mistakes = fb.flatMap((f) => (f.mistakes as { corrected: string; explanation_pl: string }[]) ?? []).slice(0, 3);
  const strengths = fb.flatMap((f) => (f.strengths as string[]) ?? []).slice(0, 3);
  const memory = (await getMemory(s.db, s.userId)).filter((m) => m.kind === "error_pattern").slice(0, 2);
  const tomorrow = await plannerInputs(s.db, s.userId, prefs.plan_variant, new Date(Date.now() + 18 * 3_600_000));

  return { minutes, reviews, accuracy, newWords, spoken, mistakes, strengths, memory, tomorrow };
}
