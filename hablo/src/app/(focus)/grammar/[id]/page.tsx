import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { grammarLesson } from "@/lib/services/grammar";
import { Button } from "@/components/ui/button";
import { GrammarLessonView } from "./grammar-lesson";

export const metadata = { title: "Lekcja gramatyki" };

export default async function GrammarLessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string }> }) {
  const s = await requirePageSession();
  const { id } = await params;
  const { item } = await searchParams;
  const lesson = await grammarLesson(s, id);
  if (lesson.locked) {
    return (
      <div className="mt-20 text-center">
        <h1 className="text-xl font-semibold">{lesson.title}</h1>
        <p className="mt-2 text-muted">Ten temat otworzy się po przećwiczeniu: {lesson.prerequisites.join(", ")}.</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/grammar">Mapa gramatyki</Link>
        </Button>
      </div>
    );
  }
  return <GrammarLessonView lesson={lesson} itemId={item ?? null} />;
}
