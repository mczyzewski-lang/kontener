import type { Capabilities } from "@/components/capabilities";

/** Always-visible statement of what is real and what is not configured. */
export function DemoBanner({ caps }: { caps: Capabilities }) {
  const notes: string[] = [];
  if (caps.mode === "demo") notes.push("Tryb demonstracyjny: dane zapisują się lokalnie na serwerze, bez logowania");
  if (caps.aiMock) notes.push("TRYB TESTOWY AI — oceny i historie są atrapami");
  if (!notes.length) return null;
  return (
    <div role="status" className="bg-warn-soft px-4 py-2 text-center text-[13px] text-[#7a4d0c]">
      {notes.join(" · ")}
    </div>
  );
}
