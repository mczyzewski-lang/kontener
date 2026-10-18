import { describe, expect, it } from "vitest";
import { buildLexicon, findEntries, matchSentence, matchShort, patternMatches } from "@/lib/learning/text";
import { parseControlMessage, CONTROL_ACTIONS } from "@/lib/learning/actions";
import { loadContent } from "@/lib/content";
import type { VocabularyEntryRow } from "@/lib/db/types";

describe("answer matching", () => {
  it("accepts exact answers and optional articles", () => {
    expect(matchShort("necesitar", ["necesitar"]).verdict).toBe("correct");
    expect(matchShort("coche", ["el coche"]).verdict).toBe("correct");
  });
  it("treats a missing accent as a minor issue, not an error", () => {
    const r = matchShort("adios", ["adiós"]);
    expect(r.verdict).toBe("minor");
    expect(r.note).toMatch(/akcent/);
  });
  it("tolerates a one-letter typo on longer words", () => {
    expect(matchShort("necesitr", ["necesitar"]).verdict).toBe("minor");
    expect(matchShort("comer", ["beber"]).verdict).toBe("incorrect");
  });
  it("accepts a paraphrase that matches closely, rejects a different meaning", () => {
    expect(matchSentence("Necesito tu ayuda", ["Necesito tu ayuda."]).verdict).toBe("correct");
    expect(matchSentence("Necesito mucho tu ayuda", ["Necesito tu ayuda."]).verdict).not.toBe("incorrect");
    expect(matchSentence("Quiero un café", ["Necesito tu ayuda."]).verdict).toBe("incorrect");
  });
  it("evaluates grammar patterns on accent-free text", () => {
    expect(patternMatches("\\besta\\b", "¿Dónde está?")).toBe(true);
  });
});

describe("lexicon", () => {
  const entries = loadContent().vocabulary.map((v) => ({ ...v, owner_id: null }) as unknown as VocabularyEntryRow);
  const lex = buildLexicon(entries);
  it("finds lemmas from inflected forms and set phrases", () => {
    const found = findEntries("Ayer compré un coche y tengo que pagar. A lo mejor voy mañana.", lex);
    expect(found.has("comprar-v")).toBe(true);
    expect(found.has("coche-n-m")).toBe(true);
    expect(found.has("tener-v")).toBe(true);
    expect(found.has("fr-a-lo-mejor")).toBe(true);
  });
});

describe("control messages", () => {
  it("round-trips every action", () => {
    for (const [key, a] of Object.entries(CONTROL_ACTIONS)) expect(parseControlMessage(a.message)).toBe(key);
    expect(parseControlMessage("Quiero un café")).toBeNull();
  });
});
