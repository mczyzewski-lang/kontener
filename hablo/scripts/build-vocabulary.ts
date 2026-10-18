/**
 * Builds content/vocabulary/vocabulary.json from the hand-authored sources in
 * content/vocabulary/source/*.txt and real corpus frequencies.
 *
 * Frequency data: OpenSubtitles 2018 Spanish word list (FrequencyWords by
 * Hermit Dave, content CC-BY-SA 4.0) — subtitles approximate spoken language.
 * Word forms are grouped into lemmas with the lemmatization-lists dataset by
 * Michal Měchura (ODbL), downloaded into .cache/ on demand.
 *
 * Ranking method: for every lemma in the corpus we sum the counts of its forms
 * (ambiguous forms split evenly). Curated entries may exclude misleading forms
 * (e.g. "como" for "comer") with a "-form" token. The rank is the lemma's
 * position among all corpus lemmas, so it is a true frequency rank rather than
 * an ordinal within the curated list.
 *
 * Usage: npx tsx scripts/build-vocabulary.ts
 */
import fs from "node:fs";
import path from "node:path";
import { vocabularyEntrySchema, type VocabularyEntryContent } from "../src/lib/content/schemas";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "content/vocabulary/source");
const OUT = path.join(ROOT, "content/vocabulary/vocabulary.json");
const CORPUS = path.join(ROOT, "content/corpus/opensubtitles2018_es_50k.txt");
const LEMMA_CACHE = path.join(ROOT, ".cache/lemmatization-es.txt");
const LEMMA_URL =
  "https://raw.githubusercontent.com/michmech/lemmatization-lists/master/lemmatization-es.txt";

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitList(s: string | undefined, sep: string): string[] {
  return (s ?? "")
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseExamples(s: string | undefined) {
  return splitList(s, ";;").map((pair) => {
    const idx = pair.indexOf("=");
    if (idx < 0) throw new Error(`Example without "=": ${pair}`);
    return { es: pair.slice(0, idx).trim(), pl: pair.slice(idx + 1).trim() };
  });
}

async function loadLemmaMap(): Promise<Map<string, Set<string>>> {
  if (!fs.existsSync(LEMMA_CACHE)) {
    console.log("Downloading lemmatization list…");
    const res = await fetch(LEMMA_URL);
    if (!res.ok) throw new Error(`Cannot download ${LEMMA_URL}: ${res.status}`);
    fs.mkdirSync(path.dirname(LEMMA_CACHE), { recursive: true });
    fs.writeFileSync(LEMMA_CACHE, await res.text());
  }
  const map = new Map<string, Set<string>>();
  for (const line of fs.readFileSync(LEMMA_CACHE, "utf8").replace(/^﻿/, "").split("\n")) {
    const [lemma, form] = line.trim().split("\t");
    if (!lemma || !form) continue;
    const f = form.toLowerCase();
    if (!map.has(f)) map.set(f, new Set());
    map.get(f)!.add(lemma.toLowerCase());
  }
  return map;
}

type Draft = Omit<VocabularyEntryContent, "frequency_rank" | "corpus_count" | "level" | "difficulty"> & {
  countForms: string[];
  excluded: string[];
};

function parseWordLine(line: string, file: string): Draft {
  const [lemma, pos, tr, ex, col, forms, topics, grammar, note] = line.split("|");
  if (!lemma || !pos || !tr || !ex) throw new Error(`${file}: malformed line: ${line}`);
  const formTokens = splitList(forms, ",");
  const excluded = formTokens.filter((f) => f.startsWith("-")).map((f) => f.slice(1).toLowerCase());
  const shown = formTokens.filter((f) => !f.startsWith("-"));
  return {
    id: `${slug(lemma)}-${slug(pos)}`,
    kind: "word",
    lemma: lemma.trim(),
    pos: pos.trim(),
    translations: splitList(tr, ";"),
    examples: parseExamples(ex),
    collocations: splitList(col, ";"),
    forms: shown,
    topics: splitList(topics, ","),
    grammar: splitList(grammar, ",") as VocabularyEntryContent["grammar"],
    note: note?.trim() ? note.trim() : null,
    source: "opensubtitles2018+curated",
    countForms: shown.map((f) => f.toLowerCase()),
    excluded,
  };
}

function parsePhraseLine(line: string, file: string): Draft {
  const [es, pl, note, topics, grammar, ex, components] = line.split("|");
  if (!es || !pl || !ex) throw new Error(`${file}: malformed phrase: ${line}`);
  return {
    id: `fr-${slug(es)}`,
    kind: "phrase",
    lemma: es.trim(),
    pos: "phrase",
    translations: splitList(pl, ";"),
    examples: parseExamples(ex),
    collocations: [],
    forms: [],
    topics: splitList(topics, ","),
    grammar: splitList(grammar, ",") as VocabularyEntryContent["grammar"],
    note: note?.trim() ? note.trim() : null,
    source: "curated-phrase",
    components: splitList(components, ","),
    countForms: [],
    excluded: [],
  };
}

async function main() {
  const lemmaMap = await loadLemmaMap();
  const corpus = new Map<string, number>();
  for (const line of fs.readFileSync(CORPUS, "utf8").split("\n")) {
    const [w, c] = line.trim().split(" ");
    if (w && c) corpus.set(w.toLowerCase(), Number(c));
  }

  const drafts: Draft[] = [];
  for (const file of fs.readdirSync(SRC).sort()) {
    const isPhrases = file.includes("phrases");
    for (const raw of fs.readFileSync(path.join(SRC, file), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      drafts.push(isPhrases ? parsePhraseLine(line, file) : parseWordLine(line, file));
    }
  }

  // Curated entries claim their lemma's forms from the lemmatization list.
  const words = drafts.filter((d) => d.kind === "word");
  const curatedLemma = new Map<string, Draft>();
  for (const d of words) curatedLemma.set(d.lemma.toLowerCase(), d);
  const formsOfLemma = new Map<string, Set<string>>();
  for (const [form, lemmas] of lemmaMap) {
    for (const l of lemmas) {
      if (!formsOfLemma.has(l)) formsOfLemma.set(l, new Set());
      formsOfLemma.get(l)!.add(form);
    }
  }
  const claim = new Map<string, Set<string>>(); // form -> lemma keys claiming it
  const addClaim = (form: string, key: string) => {
    if (!claim.has(form)) claim.set(form, new Set());
    claim.get(form)!.add(key);
  };
  for (const d of words) {
    const key = d.lemma.toLowerCase();
    const all = new Set<string>([key, ...d.countForms, ...(formsOfLemma.get(key) ?? [])]);
    for (const ex of d.excluded) all.delete(ex);
    for (const f of all) addClaim(f, key);
  }
  // Every other corpus word is attributed by the lemmatization list (or itself).
  for (const form of corpus.keys()) {
    if (claim.has(form)) continue;
    const lemmas = lemmaMap.get(form);
    const own = !lemmas || formsOfLemma.has(form) ? [form] : [...lemmas];
    for (const l of own) {
      if (curatedLemma.has(l)) continue; // curated lemmas only count forms they list or own
      addClaim(form, l);
    }
  }
  const lemmaCount = new Map<string, number>();
  for (const [form, keys] of claim) {
    const c = corpus.get(form) ?? 0;
    if (!c) continue;
    for (const k of keys) lemmaCount.set(k, (lemmaCount.get(k) ?? 0) + c / keys.size);
  }
  const ranking = [...lemmaCount.entries()].sort((a, b) => b[1] - a[1]);
  const rankOf = new Map<string, number>();
  ranking.forEach(([l], i) => rankOf.set(l, i + 1));

  const out: VocabularyEntryContent[] = [];
  const ids = new Set<string>();
  for (const d of drafts) {
    if (ids.has(d.id)) throw new Error(`Duplicate id ${d.id}`);
    ids.add(d.id);
    let rank: number | null = null;
    let count: number | null = null;
    if (d.kind === "word") {
      const key = d.lemma.toLowerCase();
      rank = rankOf.get(key) ?? null;
      count = Math.round(lemmaCount.get(key) ?? 0);
    } else {
      const comps = (d.components ?? []).map((c) => rankOf.get(c.toLowerCase())).filter((x): x is number => !!x);
      rank = comps.length ? Math.max(...comps) : null;
    }
    const level = rank ? Math.min(5, Math.max(1, Math.ceil(rank / 1000))) : 1;
    const { countForms: _cf, excluded: _ex, ...rest } = d;
    void _cf;
    void _ex;
    const entry = vocabularyEntrySchema.parse({
      ...rest,
      frequency_rank: d.kind === "word" ? rank : null,
      corpus_count: count,
      level,
      difficulty: Math.min(5, level + (d.kind === "phrase" ? 0 : d.pos === "v" ? 1 : 0)),
    });
    if (d.kind === "phrase" && rank) entry.level = level;
    out.push(entry);
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "word" ? -1 : 1;
    return (a.frequency_rank ?? 99999) - (b.frequency_rank ?? 99999);
  });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  const w = out.filter((e) => e.kind === "word");
  console.log(
    `Wrote ${w.length} words + ${out.length - w.length} phrases. ` +
      `Levels: ${[1, 2, 3, 4, 5].map((l) => `${l}:${w.filter((e) => e.level === l).length}`).join(" ")}. ` +
      `Unranked: ${w.filter((e) => !e.frequency_rank).map((e) => e.lemma).join(", ") || "none"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
