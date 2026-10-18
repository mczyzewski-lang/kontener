import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { getOrCreateTodayPlan } from "@/lib/learning/plan-service";
import { planItemHref, PLAN_ITEM_LABEL } from "@/lib/plan-links";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { SkipButton } from "./skip-button";

export const metadata = { title: "Lekcja" };

export default async function LessonPage() {
  const s = await requirePageSession();
  const { plan, items } = await getOrCreateTodayPlan(s.db, s.userId);
  const next = items.find((i) => i.status === "pending" || i.status === "in_progress");
  const doneCount = items.filter((i) => i.status === "done" || i.status === "skipped").length;
  const rationale = (plan.rationale as string[]) ?? [];
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dzisiejsza lekcja"
        subtitle={`${doneCount} z ${items.length} · ok. ${items.reduce((a, i) => a + i.est_minutes, 0)} min · ${plan.variant === "quick" ? "Quick" : plan.variant === "deep" ? "Deep" : "Standard"}`}
      />
      <ol className="space-y-2">
        {items.map((it, idx) => {
          const finished = it.status === "done" || it.status === "skipped";
          const isNext = next?.id === it.id;
          return (
            <li key={it.id}>
              <Link
                href={planItemHref(it)}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border bg-surface p-4 transition-colors",
                  isNext ? "border-accent" : "border-line hover:border-line-strong",
                  finished && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                    finished ? "bg-success-soft text-success" : isNext ? "bg-accent text-white" : "bg-sunken text-muted",
                  )}
                >
                  {finished ? <Check className="size-4" /> : idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-muted">
                    {PLAN_ITEM_LABEL[it.type]} · {it.est_minutes} min
                  </span>
                  <span className="block truncate font-medium">{it.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{it.goal}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ol>
      {next ? (
        <div className="mt-6 space-y-2">
          <Button asChild size="lg" className="w-full">
            <Link href={planItemHref(next)}>
              {doneCount ? "Dalej" : "Zaczynamy"}: {next.title} <ArrowRight />
            </Link>
          </Button>
          <SkipButton itemId={next.id} />
        </div>
      ) : (
        <Card className="mt-6 p-5 text-center">
          <div className="font-medium">Plan na dziś wykonany.</div>
          <p className="mt-1 text-sm text-muted">Jutrzejszy plan powstanie na podstawie dzisiejszych wyników.</p>
        </Card>
      )}
      {rationale.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Dlaczego taki plan</SectionTitle>
          <ul className="space-y-1.5 text-sm text-ink-2">
            {rationale.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
