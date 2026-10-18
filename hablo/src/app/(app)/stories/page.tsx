import Link from "next/link";
import { Plus, RotateCcw, ChevronRight } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { listStories } from "@/lib/services/stories";
import { eq } from "@/lib/db/db";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/primitives";

export const metadata = { title: "Historie" };

const VARIANT: Record<string, string> = {
  original: "",
  past: "w przeszłości",
  extended: "rozszerzona",
  perspective: "inna perspektywa",
  future: "w przyszłości",
  own: "własna",
};

export default async function StoriesPage() {
  const s = await requirePageSession();
  const stories = await listStories(s);
  const own = await s.db.select("story_attempts", { where: [eq("user_id", s.userId), eq("kind", "own_story")], order: [{ col: "created_at", asc: false }], limit: 10 });
  const titleOf = new Map(stories.map((x) => [x.id, x.title]));
  const due = stories.filter((x) => x.retellDue);
  const current = stories.filter((x) => x.status === "in_progress");
  const fresh = stories.filter((x) => x.status === "new");
  const done = stories.filter((x) => x.status === "completed" && !x.retellDue);

  return (
    <div className="animate-fade-in space-y-7">
      <PageHeader
        title="Historie"
        subtitle="Słowa zapamiętane przez wyobraźnię — słuchasz, czytasz, opowiadasz."
        action={
          <Button asChild size="sm">
            <Link href="/stories/new">
              <Plus /> Nowa
            </Link>
          </Button>
        }
      />
      {due.length > 0 && (
        <section>
          <SectionTitle>Do powtórzenia — w nowej wersji</SectionTitle>
          <List items={due} />
        </section>
      )}
      {current.length > 0 && (
        <section>
          <SectionTitle>W trakcie</SectionTitle>
          <List items={current} />
        </section>
      )}
      {fresh.length > 0 && (
        <section>
          <SectionTitle>Biblioteka</SectionTitle>
          <List items={fresh} />
        </section>
      )}
      {done.length > 0 && (
        <section>
          <SectionTitle>Ukończone</SectionTitle>
          <List items={done} />
        </section>
      )}
      {own.length > 0 && (
        <section>
          <SectionTitle>Moje własne historie</SectionTitle>
          <div className="space-y-2">
            {own.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="text-xs text-muted">
                  na podstawie: {titleOf.get(o.story_id) ?? "historia"} · {new Date(o.created_at).toLocaleDateString("pl-PL")}
                </div>
                <p className="mt-1 font-serif text-[16px] leading-relaxed" lang="es">
                  {o.input_text}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type StoryItem = Awaited<ReturnType<typeof listStories>>[number];

function List({ items }: { items: StoryItem[] }) {
  return (
    <Card className="divide-y divide-line">
      {items.map((x) => (
        <Link key={x.id} href={x.retellDue ? `/stories/${x.id}?retell=1` : `/stories/${x.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-sunken/60">
          <div className="min-w-0 flex-1">
            <div className="truncate font-serif text-[17px]" lang="es">
              {x.title}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
              {VARIANT[x.variant] && <Badge>{VARIANT[x.variant]}</Badge>}
              {x.source === "ai" && <Badge tone="accent">dla ciebie</Badge>}
              {x.status === "in_progress" && <span>etap {x.stage}/6</span>}
              {x.nextRetellAt && !x.retellDue && <span>wróci {new Date(x.nextRetellAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>}
            </div>
          </div>
          {x.retellDue ? <RotateCcw className="size-4 text-accent" /> : <ChevronRight className="size-4 text-faint" />}
        </Link>
      ))}
    </Card>
  );
}
