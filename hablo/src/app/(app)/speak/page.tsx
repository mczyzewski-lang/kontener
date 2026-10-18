import Link from "next/link";
import { ChevronRight, Mic, MessageSquare } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { loadContent } from "@/lib/content";
import { eq } from "@/lib/db/db";
import { serverCapabilities } from "@/lib/capabilities";
import { Badge, Card, Notice, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { ModePicker } from "./mode-picker";
import { SprintCard } from "./sprint-card";

export const metadata = { title: "Mów" };

const MODE_LABEL: Record<string, string> = {
  guided: "Prowadzona",
  natural: "Naturalna",
  real_life: "Z życia",
  assessment: "Test",
  grammar: "Gramatyka",
};

export default async function SpeakPage() {
  const s = await requirePageSession();
  const caps = serverCapabilities();
  const { scenarios } = loadContent();
  const sessions = await s.db.select("conversation_sessions", {
    where: [eq("user_id", s.userId)],
    order: [{ col: "started_at", asc: false }],
    limit: 15,
  });
  const mastered = new Set(
    (await s.db.select("learner_memory", { where: [eq("user_id", s.userId), eq("kind", "mastered_scenario")] })).map((m) => m.key),
  );
  const practiced = new Map<string, number>();
  for (const x of sessions) if (x.scenario_id) practiced.set(x.scenario_id, (practiced.get(x.scenario_id) ?? 0) + 1);
  const sprint = (await s.db.select("sprints", { where: [eq("user_id", s.userId), eq("status", "active")], limit: 1 }))[0] ?? null;
  const title = (id: string | null, mode: string) => scenarios.find((x) => x.id === id)?.title ?? (mode === "assessment" ? "Test tygodniowy" : "Swobodna rozmowa");

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader title="Mów" subtitle="Rozmowy z nauczycielką i postaciami z Hiszpanii." />

      {!caps.voice && (
        <Notice tone="warn">
          Rozmowy głosowe wymagają ElevenLabs (ELEVENLABS_API_KEY i ELEVENLABS_AGENT_ID).{" "}
          {caps.ai ? "Do tego czasu możesz rozmawiać w trybie tekstowym." : "Skonfiguruj też Claude API, aby włączyć tryb tekstowy."}
        </Notice>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <Mic className="size-6" />
          </span>
          <div>
            <div className="font-semibold">Swobodna rozmowa z Lucíą</div>
            <div className="text-sm text-muted">O twoim dniu, planach, rodzinie — dopasowana do twojego poziomu.</div>
          </div>
        </div>
        <ModePicker voice={caps.voice} text={caps.ai} />
      </Card>

      <SprintCard sprint={sprint ? { goal: sprint.goal_text, summary: sprint.summary, endsOn: sprint.ends_on } : null} />

      <section>
        <SectionTitle>Sytuacje z życia</SectionTitle>
        <Card className="divide-y divide-line">
          {scenarios.map((sc) => (
            <Link
              key={sc.id}
              href={`/speak/session?scenario=${sc.id}&mode=${sc.default_mode}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-sunken/60"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{sc.title}</div>
                <div className="truncate text-sm text-muted">
                  {sc.character_name} · {sc.description}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={mastered.has(sc.id) ? "success" : "neutral"}>{mastered.has(sc.id) ? "opanowana" : `poziom ${sc.level}`}</Badge>
                {practiced.get(sc.id) && <span className="text-[11px] text-faint">{practiced.get(sc.id)}× ćwiczona</span>}
              </div>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </Link>
          ))}
        </Card>
      </section>

      {sessions.length > 0 && (
        <section>
          <SectionTitle>Historia rozmów</SectionTitle>
          <Card className="divide-y divide-line">
            {sessions.map((x) => (
              <div key={x.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/speak/report/${x.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{title(x.scenario_id, x.mode)}</div>
                  <div className="text-xs text-muted">
                    {new Date(x.started_at).toLocaleDateString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {MODE_LABEL[x.mode]} · {x.duration_secs ? `${Math.max(1, Math.round(x.duration_secs / 60))} min` : x.status === "active" ? "nieukończona" : "—"}
                    {x.channel === "text" && " · tekst"}
                  </div>
                </Link>
                {x.scenario_id && (
                  <Link
                    href={`/speak/session?scenario=${x.scenario_id}&mode=${x.mode}`}
                    className="rounded-full p-2 text-muted hover:bg-sunken"
                    aria-label="Powtórz scenariusz"
                    title="Powtórz scenariusz"
                  >
                    <MessageSquare className="size-4" />
                  </Link>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
