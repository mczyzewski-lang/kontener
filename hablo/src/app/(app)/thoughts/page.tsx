import { requirePageSession } from "@/lib/session";
import { listLibrary } from "@/lib/thoughts/service";
import { PageHeader } from "@/components/ui/primitives";
import { ThoughtLibrary } from "./thought-library";

export const metadata = { title: "Moje myśli" };

export default async function ThoughtsPage() {
  const s = await requirePageSession();
  const { categories, entries } = await listLibrary(s.db, s.userId);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Moje myśli" subtitle="To, co jest dla mnie ważne. Do przeczytania, wysłuchania i zmiany — bez obowiązków." />
      <ThoughtLibrary
        categories={categories.map((c) => ({ key: c.key, name: c.name }))}
        entries={entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          text: e.text,
          category_key: e.category_key,
          contexts: e.contexts,
          featured: e.featured,
          favorite: e.favorite,
          hidden: e.hidden,
          edited: e.edited,
        }))}
      />
    </div>
  );
}
