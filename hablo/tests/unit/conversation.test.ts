import { describe, expect, it } from "vitest";
import { applyAnalysis, basicAnalysis, detectUsage, saveTranscript } from "@/lib/learning/conversation";
import { normalizeTurns } from "@/lib/services/conversation";
import { getEntries } from "@/lib/learning/vocabulary";
import { getCard } from "@/lib/learning/memory";
import { eq } from "@/lib/db/db";
import { CONTROL_ACTIONS } from "@/lib/learning/actions";
import { mockResponse } from "@/lib/ai/mock";
import type { ConversationAnalysis } from "@/lib/ai/schemas";
import { freshDb, USER } from "./helpers";

async function sessionWith(turns: Parameters<typeof saveTranscript>[2]) {
  const db = await freshDb();
  const [s] = await db.insert("conversation_sessions", { user_id: USER, mode: "natural", channel: "voice", scenario_id: "neighbor-chat", duration_secs: 300 });
  await saveTranscript(db, s, turns);
  const rows = await db.select("conversation_turns", { where: [eq("session_id", s.id)], order: [{ col: "idx" }] });
  return { db, s, rows };
}

describe("conversation transcript", () => {
  it("turns control messages into action turns and flags the next learner turn as assisted", async () => {
    const turns = normalizeTurns([
      { role: "agent", text: "¿Qué hiciste ayer?" },
      { role: "user", text: CONTROL_ACTIONS.hint.message },
      { role: "agent", text: "Puedes decir: Ayer fui a…" },
      { role: "user", text: "Ayer fui a la playa" },
    ]);
    expect(turns[1]).toMatchObject({ role: "action", action: "hint" });
    const { rows } = await sessionWith(turns);
    expect(rows.find((r) => r.text === "Ayer fui a la playa")?.assisted).toBe(true);
  });

  it("does not count words the learner only echoed from the tutor", async () => {
    const { db, rows } = await sessionWith([
      { role: "agent", text: "¿Te gusta la playa?" },
      { role: "user", text: "Sí, me gusta la playa" },
      { role: "agent", text: "¿Y qué haces los domingos?" },
      { role: "user", text: "Los domingos compro pan en el mercado" },
    ]);
    const usage = detectUsage(rows, await getEntries(db, USER));
    expect(usage.get("playa-n-f")?.echoed).toBe(true);
    expect(usage.get("playa-n-f")?.spontaneous).toBe(false);
    expect(usage.get("comprar-v")?.spontaneous).toBe(true);
  });
});

describe("analysis feeds the shared learner model", () => {
  it("missing words → recall reviews + task; grammar errors → grammar task + memory; spontaneous words → speaking evidence", async () => {
    const { db, s } = await sessionWith([
      { role: "agent", text: "¿Qué tal todo?" },
      { role: "user", text: "Yo soy cansado. Quiero ir a casa. ¿Cómo se dice klucz?" },
    ]);
    const analysis = mockResponse("analyze_conversation", { transcript: [{ role: "user", text: "x" }] }) as ConversationAnalysis;
    await applyAnalysis(db, s, { analysis, source: "test" });

    const llave = await db.select("vocabulary_entries", { where: [eq("owner_id", USER)] });
    expect(llave.map((e) => e.lemma)).toContain("llave");
    const recall = await getCard(db, USER, llave[0].id, "recall");
    expect(recall?.priority_boost).toBe(3);
    const tasks = await db.select("learning_tasks", { where: [eq("user_id", USER)] });
    expect(tasks.map((t) => t.type).sort()).toEqual(["grammar", "review_words"]);
    expect(tasks.find((t) => t.type === "grammar")?.grammar_topic_ids).toEqual(["g03-ser-estar"]);
    const speaking = await getCard(db, USER, "querer-v", "speaking");
    expect(speaking?.spontaneous_uses).toBe(1);
    const memory = await db.select("learner_memory", { where: [eq("user_id", USER)] });
    expect(memory.some((m) => m.kind === "error_pattern" && m.key === "g03-ser-estar")).toBe(true);
    const fb = await db.select("conversation_feedback", { where: [eq("session_id", s.id)] });
    expect(fb).toHaveLength(1);

    // Re-running the analysis must not double-count evidence.
    await applyAnalysis(db, s, { analysis, source: "test" });
    expect((await getCard(db, USER, "querer-v", "speaking"))?.spontaneous_uses).toBe(1);
  });

  it("basic analysis (no AI) is clearly labelled and still credits spontaneous words", async () => {
    const { db, rows } = await sessionWith([
      { role: "agent", text: "Hola" },
      { role: "user", text: "Necesito comprar pan" },
    ]);
    const a = basicAnalysis(rows, await getEntries(db, USER));
    expect(a.summary_pl).toMatch(/bez modelu AI/);
    expect(a.spontaneous_lemmas).toContain("necesitar");
  });
});
