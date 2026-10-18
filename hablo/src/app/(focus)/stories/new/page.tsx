import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { createNewStory } from "@/lib/services/stories";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Nowa historia" };

/** Creates (generates or picks) a new story once and opens it; the story is stored, never regenerated on open. */
export default async function NewStoryPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const s = await requirePageSession();
  const { item } = await searchParams;
  let target: string | null = null;
  let error: string | null = null;
  try {
    const r = await createNewStory(s);
    target = `/stories/${r.id}${item ? `?item=${item}` : ""}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się przygotować historii.";
  }
  if (target) redirect(target);
  return (
    <div className="mt-20 text-center">
      <p className="text-danger">{error}</p>
      <Button asChild className="mt-6" variant="secondary">
        <Link href="/stories">Wróć do historii</Link>
      </Button>
    </div>
  );
}
