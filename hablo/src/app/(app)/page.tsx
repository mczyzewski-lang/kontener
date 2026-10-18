import Link from "next/link";
import { ArrowRight, BookOpen, Mic, Zap, Check } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { getOrCreateTodayPlan } from "@/lib/learning/plan-service";
import { homeStats, VOCAB_GOAL } from "@/lib/services/stats";
import { getPrefs } from "@/lib/learning/profile";
import { planItemHref } from "@/lib/plan-links";
import { eq } from "@/lib/db/db";
import { Button } from "@/components/ui/button";
import { Card, Progress, Stat } from "@/components/ui/primitives";
import { VariantPicker } from "./variant-picker";
import { applyRetention } from "@/lib/services/data";

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()));
  if (h < 6 || h >= 21) return "Buenas noches";
  if (h < 14) return "Buenos días";
  return "Buenas tardes";
}

export default async function HomePage() {
  const s = await requirePageSession();
  const prefs = await getPrefs(s.db, s.userId);
  const { plan, items } = await getOrCreateTodayPlan(s.db, s.userId);
  await applyRetention(s).catch(() => null);
  const stats = await homeStats(s);
  const next = items.find((i) => i.status === "pending" || i.status === "in_progress");
  const started = items.some((i) => i.status !== "pending");
  const done = items.length > 0 && !next;
  const minutes = items.reduce((a, i) => a + i.est_minutes, 0);
  const story = (await s.db.select("stories", { where: [eq("user_id", s.userId), eq("status", "in_progress")], limit: 1 }))[0];
  const sprint = (await s.db.select("sprints", { where: [eq("user_id", s.userId), eq("status", "active")], limit: 1 }))[0];

  return (
    <div className="animate-fade-in space-y-6">
      <header className="pt-2">
        <div className="text-sm text-muted">
          Dzień {stats.day}
          {stats.streak > 1 && <> · {stats.streak} dni z rzędu</>}
        </div>
        <h1 className="mt-1 font-serif text-[34px] leading-tight tracking-tight" lang="es">
          {greeting(prefs.timezone)}
        </h1>
        <p className="text-[17px] text-muted">Gotowy na dzisiejszy hiszpański?</p>
      </header>

      <Card className="p-5">
        <div className="text-[13px] font-medium uppercase tracking-wide text-accent">Cel na dziś</div>
        <p className="mt-1.5 text-[17px] leading-snug">
          {done ? "Plan na dziś wykonany. ¡Muy bien! Jutro czeka nowy." : (next?.goal ?? "Twój plan jest gotowy.")}
        </p>
        {sprint && <p className="mt-2 text-sm text-muted">Sprint: {sprint.goal_text}</p>}
        <div className="mt-5">
          {done ? (
            <Button asChild variant="secondary" size="lg" className="w-full">
              <Link href="/lesson">
                <Check /> Zobacz podsumowanie dnia
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link href={next ? (started ? planItemHref(next) : "/lesson") : "/lesson"}>
                {started ? "Kontynuuj lekcję" : "Zacznij dzisiejszą lekcję"} · {minutes} min <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
        {!started && <VariantPicker current={plan.variant} />}
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <QuickAction href="/learn/review?mode=practice" icon={<Zap />} label="Szybka praktyka" />
        <QuickAction href="/speak" icon={<Mic />} label="Mów teraz" />
        <QuickAction href={story ? `/stories/${story.id}` : "/stories"} icon={<BookOpen />} label={story ? "Dokończ historię" : "Historie"} />
      </div>

      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <div className="text-[13px] text-muted">Opanowane słowa</div>
          <div className="text-sm tabular-nums text-muted">
            <span className="text-2xl font-semibold text-ink">{stats.mastered}</span> / {VOCAB_GOAL}
          </div>
        </div>
        <Progress className="mt-3" value={(stats.mastered / VOCAB_GOAL) * 100} label="Postęp słownictwa" />
        <div className="mt-5 grid grid-cols-3 gap-4">
          <Stat label="Używane w mowie" value={stats.spoken} />
          <Stat label="Do powtórki" value={stats.due} />
          <Stat label="Rozmowy w tyg." value={`${stats.convMinutesWeek} min`} />
        </div>
      </Card>

      <Link href="/progress" className="block rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
        <div className="text-[13px] text-muted">Etap programu</div>
        <div className="mt-1 font-medium">
          Poziom {stats.band.level}: {stats.band.name}
        </div>
        {stats.grammarStage && (
          <div className="mt-0.5 text-sm text-muted">
            Gramatyka — etap {stats.grammarStage.stage}: {stats.grammarStage.title}
          </div>
        )}
      </Link>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-4 text-center text-[13px] font-medium transition-colors hover:border-line-strong active:scale-[0.98] [&_svg]:size-5 [&_svg]:text-accent"
    >
      {icon}
      {label}
    </Link>
  );
}
