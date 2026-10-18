import Link from "next/link";
import { Lock, Check } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { grammarMap } from "@/lib/services/grammar";
import { Badge, PageHeader, Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata = { title: "Gramatyka" };

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "success" | "warn" }> = {
  locked: { label: "zablokowane", tone: "neutral" },
  available: { label: "do rozpoczęcia", tone: "accent" },
  learning: { label: "w nauce", tone: "warn" },
  practiced: { label: "przećwiczone", tone: "success" },
  mastered: { label: "opanowane", tone: "success" },
};

export default async function GrammarPage() {
  const s = await requirePageSession();
  const topics = await grammarMap(s);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Gramatyka" subtitle="Konstrukcje opanowane przez używanie. Kolejny etap otwiera się, gdy poprzedni jest przećwiczony — nie wystarczy go otworzyć." />
      <ol className="relative space-y-2">
        {topics.map((t) => {
          const locked = t.status === "locked";
          const st = STATUS[t.status];
          const inner = (
            <div className={cn("flex items-center gap-4 rounded-2xl border bg-surface p-4", locked ? "border-line opacity-55" : "border-line hover:border-line-strong")}>
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  t.status === "mastered" || t.status === "practiced" ? "bg-success-soft text-success" : locked ? "bg-sunken text-faint" : "bg-accent-soft text-accent",
                )}
              >
                {locked ? <Lock className="size-4" /> : t.status === "mastered" ? <Check className="size-4" /> : t.stage}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.title}</div>
                <div className="truncate text-sm text-muted">{t.subtitle}</div>
                {!locked && t.attempts > 0 && <Progress value={t.mastery * 100} className="mt-2 h-1" label={`Opanowanie: ${Math.round(t.mastery * 100)}%`} />}
              </div>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
          );
          return <li key={t.id}>{locked ? inner : <Link href={`/grammar/${t.id}`}>{inner}</Link>}</li>;
        })}
      </ol>
    </div>
  );
}
