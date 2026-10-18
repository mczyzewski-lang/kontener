import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import { eq } from "@/lib/db/db";
import { claimKnown, competence } from "@/lib/learning/memory";
import { getExamples } from "@/lib/learning/vocabulary";
import { toDto } from "@/lib/services/review";
import { makeMnemonic } from "@/lib/ai/tasks";
import { getPrefs } from "@/lib/learning/profile";
import { HttpError } from "@/lib/http-error";
import type { Session } from "@/lib/session";

async function loadEntry(s: Session, id: string) {
  const e = (await s.db.select("vocabulary_entries", { where: [eq("id", id)], limit: 1 }))[0];
  if (!e || (e.owner_id && e.owner_id !== s.userId)) throw new HttpError(404, "Nie ma takiego słowa.");
  return e;
}

export const GET = withSession<IdCtx>(async (_req, s, ctx) => {
  const { id } = await ctx.params;
  const e = await loadEntry(s, id);
  const examples = (await getExamples(s.db, [id])).get(id) ?? [];
  const progress = await s.db.select("vocabulary_progress", { where: [eq("user_id", s.userId), eq("entry_id", id)] });
  const logs = await s.db.select("vocabulary_review_logs", {
    where: [eq("user_id", s.userId), eq("entry_id", id)],
    order: [{ col: "reviewed_at", asc: false }],
    limit: 12,
  });
  const assoc = await s.db.select("word_associations", { where: [eq("user_id", s.userId), eq("entry_id", id)] });
  return {
    entry: toDto(e, examples),
    skills: (["listening", "recall", "speaking"] as const).map((skill) => {
      const p = progress.find((x) => x.skill === skill);
      return {
        skill,
        competence: competence(p),
        due: p?.due ?? null,
        stability: p?.stability ?? 0,
        reps: p?.reps ?? 0,
        lapses: p?.lapses ?? 0,
        correct: p?.correct_count ?? 0,
        incorrect: p?.incorrect_count ?? 0,
        spontaneous: p?.spontaneous_uses ?? 0,
        claimed: p?.known_claimed ?? false,
        firstSeen: p?.first_seen_at ?? null,
      };
    }),
    history: logs.map((l) => ({ at: l.reviewed_at, skill: l.skill, type: l.exercise_type, correct: l.correct, scheduled: l.scheduled, source: l.source, assisted: l.assisted })),
    associations: assoc.map((a) => ({ source: a.source, scene: a.scene })),
  };
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("known") }),
  z.object({ action: z.literal("mnemonic") }),
  z.object({ action: z.literal("association"), text: z.string().min(3).max(500) }),
]);

export const POST = withSession<IdCtx>(async (req, s, ctx) => {
  const { id } = await ctx.params;
  const e = await loadEntry(s, id);
  const input = await body(req, actionSchema);
  if (input.action === "known") {
    const n = await claimKnown(s.db, s.userId, [id], { spreadDays: 3 });
    return { ok: true, created: n, note: "Oznaczone jako znane — sprawdzimy to w powtórce w ciągu kilku dni." };
  }
  if (input.action === "association") {
    await s.db.upsert("word_associations", { user_id: s.userId, entry_id: id, source: "user", scene: input.text }, { onConflict: ["user_id", "entry_id", "source"] });
    return { ok: true };
  }
  const examples = (await getExamples(s.db, [id])).get(id) ?? [];
  const m = await makeMnemonic(
    { db: s.db, userId: s.userId, prefs: await getPrefs(s.db, s.userId) },
    { lemma: e.lemma, pl: e.translations[0], example_es: examples[0]?.es ?? "" },
  );
  if (!m) throw new HttpError(503, "Generowanie skojarzeń wymaga klucza Claude API. Możesz wpisać własne skojarzenie.");
  const scene = `${m.scene_pl}\n${m.sound_link_pl}`;
  await s.db.upsert("word_associations", { user_id: s.userId, entry_id: id, source: "ai", scene }, { onConflict: ["user_id", "entry_id", "source"] });
  return { ok: true, scene };
});
