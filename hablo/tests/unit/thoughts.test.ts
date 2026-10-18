import { describe, expect, it } from "vitest";
import { parseLibrary } from "@/lib/thoughts/import";
import { parseContext, autoContext } from "@/lib/thoughts/contexts";
import { importLibrary, pickThought, updateThought, listLibrary } from "@/lib/thoughts/service";
import { eq } from "@/lib/db/db";
import { freshDb, USER } from "./helpers";

const LIB = {
  kategorie: [
    { id: "spokoj", nazwa: "Spokój", opis: "O zwalnianiu" },
    { id: "rodzina", nazwa: "Rodzina" },
  ],
  myśli: [
    { id: "m1", tekst: "Nie muszę wszystkiego dziś.", kategoria: "spokoj", konteksty: ["poranek", "napięcie"], wyróżniona: true, źródło: "notes" },
    { id: "m2", tekst: "Kolacja bez telefonu.", kategoria: "rodzina", konteksty: ["Rodzina", "koniec pracy"] },
    { id: "m3", tekst: "Zapisz pomysł, zanim go ocenisz.", kategoria: "spokoj", konteksty: ["nowy pomysł", "księżyc"] },
  ],
  pytania: [{ id: "p1", tekst: "Co dziś było naprawdę ważne?", kategoria: "spokoj" }],
};

describe("thought library import format", () => {
  it("parses Polish keys, contexts, featured flags and keeps unknown fields as metadata", () => {
    const lib = parseLibrary(LIB);
    expect(lib.categories.map((c) => c.key)).toEqual(["spokoj", "rodzina"]);
    const m1 = lib.entries.find((e) => e.originId === "m1")!;
    expect(m1.kind).toBe("thought");
    expect(m1.featured).toBe(true);
    expect(m1.contexts).toEqual(["morning", "tension"]);
    expect(m1.meta).toMatchObject({ źródło: "notes" });
    const m3 = lib.entries.find((e) => e.originId === "m3")!;
    expect(m3.contexts).toEqual(["new_idea"]);
    expect(m3.meta.unknown_contexts).toEqual(["księżyc"]);
    expect(lib.entries.filter((e) => e.kind === "question")).toHaveLength(1);
  });

  it("accepts a plain array and derives stable ids from the text", () => {
    const a = parseLibrary([{ text: "Jedna myśl" }, "Druga myśl"]);
    const b = parseLibrary([{ text: "Jedna myśl" }, "Druga myśl"]);
    expect(a.entries).toHaveLength(2);
    expect(a.entries.map((e) => e.originId)).toEqual(b.entries.map((e) => e.originId));
  });

  it("maps context labels regardless of diacritics", () => {
    expect(parseContext("Wyjazd")).toBe("travel");
    expect(parseContext("napiecie")).toBe("tension");
    expect(parseContext("odpoczynek")).toBe("rest");
  });

  it("chooses a context from the time of day", () => {
    expect(autoContext("Europe/Warsaw", new Date("2026-10-19T06:00:00Z"))).toBe("morning"); // Monday 8:00
    expect(autoContext("Europe/Warsaw", new Date("2026-10-19T15:30:00Z"))).toBe("end_of_work");
    expect(autoContext("Europe/Warsaw", new Date("2026-10-18T07:00:00Z"))).toBe("rest"); // Sunday
  });
});

describe("re-import keeps the learner's own changes", () => {
  it("never overwrites edits, favourites or hidden flags", async () => {
    const db = await freshDb();
    const first = await importLibrary(db, USER, LIB);
    expect(first.thoughts.created).toBe(3);
    expect(first.questions.created).toBe(1);

    const rows = await db.select("thoughts", { where: [eq("user_id", USER)] });
    const m1 = rows.find((r) => r.origin_id === "m1")!;
    const m2 = rows.find((r) => r.origin_id === "m2")!;
    await updateThought(db, USER, m1.id, { text: "Moja wersja." });
    await updateThought(db, USER, m2.id, { favorite: true, hidden: true });

    const changed = structuredClone(LIB);
    changed.myśli[0].tekst = "Nowy tekst z aktualizacji.";
    changed.myśli[1].tekst = "Kolacja bez telefonów.";
    const second = await importLibrary(db, USER, changed);
    expect(second.thoughts).toEqual({ created: 0, updated: 1, keptEdited: 1, unchanged: 1 });

    const after = await db.select("thoughts", { where: [eq("user_id", USER)] });
    expect(after.find((r) => r.origin_id === "m1")!.text).toBe("Moja wersja.");
    const m2After = after.find((r) => r.origin_id === "m2")!;
    expect(m2After.text).toBe("Kolacja bez telefonów.");
    expect(m2After.favorite).toBe(true);
    expect(m2After.hidden).toBe(true);
    expect(after).toHaveLength(4);
  });

  it("keeps renamed categories", async () => {
    const db = await freshDb();
    await importLibrary(db, USER, LIB);
    await db.update("thought_categories", [eq("user_id", USER), eq("key", "spokoj")], { name: "Cisza" });
    await importLibrary(db, USER, LIB);
    const { categories } = await listLibrary(db, USER);
    expect(categories.find((c) => c.key === "spokoj")!.name).toBe("Cisza");
  });
});

describe("home thought", () => {
  const TZ = "Europe/Warsaw";
  const MON = new Date("2026-10-19T06:00:00Z");

  it("shows at most one thought matching the context, stable during the day", async () => {
    const db = await freshDb();
    await importLibrary(db, USER, LIB);
    const a = await pickThought(db, USER, "morning", TZ, MON);
    expect(a?.origin_id).toBe("m1");
    const again = await pickThought(db, USER, "tension", TZ, new Date(MON.getTime() + 3_600_000));
    expect(again?.id).toBe(a?.id);
  });

  it("returns nothing when no thought fits, and never shows questions or hidden thoughts", async () => {
    const db = await freshDb();
    await importLibrary(db, USER, LIB);
    expect(await pickThought(db, USER, "travel", TZ, MON)).toBeNull();
    const m2 = (await db.select("thoughts", { where: [eq("origin_id", "m2")] }))[0];
    await updateThought(db, USER, m2.id, { hidden: true });
    expect(await pickThought(db, USER, "family", TZ, MON)).toBeNull();
  });
});
