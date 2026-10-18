import { LearnSession } from "@/components/learn/session";

export const metadata = { title: "Nowe słowa" };

export default async function NewWordsPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  return <LearnSession mode="new" itemId={item ?? null} />;
}
