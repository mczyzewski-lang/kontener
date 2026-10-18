import { requirePageSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/primitives";
import { VocabularyBrowser } from "./vocabulary-browser";

export const metadata = { title: "Słownictwo" };

export default async function VocabularyPage() {
  await requirePageSession();
  return (
    <div className="animate-fade-in">
      <PageHeader title="Słownictwo" subtitle="5 poziomów po 1000 najczęstszych słów, z korpusu mowy potocznej." />
      <VocabularyBrowser />
    </div>
  );
}
