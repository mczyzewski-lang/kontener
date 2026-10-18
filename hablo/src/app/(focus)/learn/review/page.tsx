import { LearnSession } from "@/components/learn/session";

export const metadata = { title: "Powtórki" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ item?: string; mode?: string }> }) {
  const { item, mode } = await searchParams;
  return <LearnSession mode={mode === "practice" ? "practice" : "review"} itemId={item ?? null} />;
}
