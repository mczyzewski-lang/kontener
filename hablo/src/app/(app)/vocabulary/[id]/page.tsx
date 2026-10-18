import { requirePageSession } from "@/lib/session";
import { WordDetail } from "./word-detail";

export const metadata = { title: "Słowo" };

export default async function WordPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const { id } = await params;
  return <WordDetail id={id} />;
}
