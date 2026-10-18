import { describe, expect, it } from "vitest";
import { loadContent } from "@/lib/content";
import { generatedStorySchema, conversationAnalysisSchema } from "@/lib/ai/schemas";
import { validateGeneratedStory } from "@/lib/learning/story";
import { buildLexicon } from "@/lib/learning/text";
import type { VocabularyEntryRow } from "@/lib/db/types";

describe("educational content", () => {
  const c = loadContent();
  it("has at least 200 ranked words, phrases, 11 grammar stages and 5+ scenarios", () => {
    const words = c.vocabulary.filter((v) => v.kind === "word");
    expect(words.length).toBeGreaterThanOrEqual(200);
    expect(words.every((w) => w.frequency_rank && w.frequency_rank > 0)).toBe(true);
    expect(c.vocabulary.some((v) => v.kind === "phrase" && v.lemma === "me gustaría")).toBe(true);
    expect(c.grammar).toHaveLength(11);
    expect(c.scenarios.length).toBeGreaterThanOrEqual(5);
  });
  it("every word has a Polish translation and a translated example", () => {
    for (const v of c.vocabulary) {
      expect(v.translations.length).toBeGreaterThan(0);
      expect(v.examples[0].es.length).toBeGreaterThan(2);
      expect(v.examples[0].pl.length).toBeGreaterThan(2);
    }
  });
  it("frequency ranking follows the corpus (de/que/no before coche)", () => {
    const rank = (l: string) => c.vocabulary.find((v) => v.lemma === l)!.frequency_rank!;
    expect(rank("de")).toBeLessThan(10);
    expect(rank("ser")).toBeLessThan(rank("coche"));
  });
});

describe("AI output validation", () => {
  const entries = loadContent().vocabulary.map((v) => ({ ...v, owner_id: null }) as unknown as VocabularyEntryRow);
  const lex = buildLexicon(entries);
  const targets = entries.filter((e) => ["comprar", "coche", "grande"].includes(e.lemma));
  const good = {
    title: "El coche",
    sentences: [
      { es: "Ayer fui a comprar un coche.", pl: "Wczoraj poszedłem kupić samochód." },
      { es: "Quería un coche grande.", pl: "Chciałem duży samochód." },
      { es: "Pero era muy caro.", pl: "Ale był bardzo drogi." },
    ],
    glossary: [{ form: "caro", lemma: "caro", pl: "drogi", is_new: false }],
    questions: [
      { q_es: "¿Qué quería?", q_pl: "Czego chciał?", answer_es: "Un coche grande.", keywords: ["coche"] },
      { q_es: "¿Cómo era?", q_pl: "Jaki był?", answer_es: "Caro.", keywords: ["caro"] },
    ],
    used_target_lemmas: ["comprar", "coche", "grande"],
  };
  it("accepts a well-formed story that uses the target words", () => {
    expect(generatedStorySchema.safeParse(good).success).toBe(true);
    expect(validateGeneratedStory(good, targets, lex).ok).toBe(true);
  });
  it("rejects malformed output and stories missing target words or with fake glossary forms", () => {
    expect(generatedStorySchema.safeParse({ ...good, sentences: [] }).success).toBe(false);
    const missing = { ...good, sentences: good.sentences.map((s) => ({ ...s, es: "Hola." })) };
    expect(validateGeneratedStory(missing, targets, lex).ok).toBe(false);
    const fakeGloss = { ...good, glossary: [{ form: "inventado", lemma: "x", pl: "y", is_new: true }] };
    expect(validateGeneratedStory(fakeGloss, targets, lex).problems.join()).toMatch(/Glosariusz/);
  });
  it("rejects a conversation analysis without required fields", () => {
    expect(conversationAnalysisSchema.safeParse({ summary_pl: "x" }).success).toBe(false);
  });
});
