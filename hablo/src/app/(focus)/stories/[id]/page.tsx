import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { createVariant, getStoryView } from "@/lib/services/stories";
import { StoryPlayer } from "./story-player";

export const metadata = { title: "Historia" };

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string; retell?: string }>;
}) {
  const s = await requirePageSession();
  const { id } = await params;
  const { item, retell } = await searchParams;
  if (retell) {
    // Recurring story: open the next modified version (past tense, extension, other perspective…).
    const v = await createVariant(s, id);
    if (v.id !== id) redirect(`/stories/${v.id}${item ? `?item=${item}` : ""}`);
  }
  const story = await getStoryView(s, id);
  return <StoryPlayer story={story} itemId={item ?? null} />;
}
