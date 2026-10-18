import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { getEntries, getProgress, displayLemma } from "@/lib/learning/vocabulary";
import { competence } from "@/lib/learning/memory";
import { normalize } from "@/lib/learning/text";
import { eq } from "@/lib/db/db";
import type { Skill, VocabularyProgressRow } from "@/lib/db/types";
import { HttpError } from "@/lib/http-error";

export const GET = withSession(async (_req, s) => {
  const [entries, progress] = await Promise.all([getEntries(s.db, s.userId), getProgress(s.db, s.userId)]);
  const by = new Map<string, Partial<Record<Skill, VocabularyProgressRow>>>();
  for (const p of progress) {
    if (!by.has(p.entry_id)) by.set(p.entry_id, {});
    by.get(p.entry_id)![p.skill] = p;
  }
  const now = Date.now();
  return {
    items: entries
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "word" ? -1 : 1) || (a.frequency_rank ?? 1e6) - (b.frequency_rank ?? 1e6))
      .map((e) => {
        const p = by.get(e.id) ?? {};
        return {
          id: e.id,
          kind: e.kind,
          display: displayLemma(e),
          lemma: e.lemma,
          pl: e.translations.slice(0, 2).join(", "),
          rank: e.frequency_rank,
          level: e.level,
          topics: e.topics,
          own: !!e.owner_id,
          listening: competence(p.listening),
          recall: competence(p.recall),
          speaking: competence(p.speaking),
          claimed: !!(p.listening?.known_claimed || p.recall?.known_claimed),
          due: Object.values(p).some((c) => c && new Date(c.due).getTime() <= now),
          seen: !!(p.listening || p.recall || p.speaking),
        };
      }),
  };
});

const addSchema = z.object({
  lemma: z.string().min(1).max(60),
  pos: z.enum(["v", "n.m", "n.f", "adj", "adv", "phrase", "other"]),
  translation: z.string().min(1).max(120),
  exampleEs: z.string().max(200).optional(),
  examplePl: z.string().max(200).optional(),
});

export const POST = withSession(async (req, s) => {
  const input = await body(req, addSchema);
  const key = normalize(input.lemma).replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const id = `u-${key}-${s.userId.slice(0, 8)}`;
  const exists = await s.db.count("vocabulary_entries", [eq("id", id)]);
  if (exists) throw new HttpError(409, "To słowo już jest w twojej bibliotece.");
  const [entry] = await s.db.insert("vocabulary_entries", {
    id,
    owner_id: s.userId,
    kind: input.pos === "phrase" ? "phrase" : "word",
    lemma: input.lemma.trim(),
    pos: input.pos === "other" ? "n.mf" : input.pos,
    translations: input.translation.split(/[;,]/).map((t) => t.trim()).filter(Boolean),
    source: "manual",
  });
  if (input.exampleEs && input.examplePl) {
    await s.db.insert("vocabulary_examples", { entry_id: id, position: 0, es: input.exampleEs, pl: input.examplePl });
  }
  return { entry };
});
