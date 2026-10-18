import { getScenario, getGrammarTopic } from "@/lib/content";
import { ConversationScreen } from "./conversation-screen";

export const metadata = { title: "Rozmowa" };

const MODES = ["guided", "natural", "real_life", "assessment", "grammar"] as const;
type Mode = (typeof MODES)[number];

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; mode?: string; item?: string; grammar?: string; channel?: string }>;
}) {
  const p = await searchParams;
  const scenario = p.scenario && getScenario(p.scenario) ? p.scenario : null;
  const grammar = p.grammar && getGrammarTopic(p.grammar) ? p.grammar : null;
  const mode: Mode = MODES.includes(p.mode as Mode) ? (p.mode as Mode) : grammar ? "grammar" : "guided";
  return (
    <ConversationScreen
      scenarioId={scenario}
      grammarTopicId={grammar}
      mode={mode}
      planItemId={p.item ?? null}
      forceText={p.channel === "text"}
    />
  );
}
