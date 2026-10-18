import type { VocabularyEntryRow } from "@/lib/db/types";

/**
 * Text utilities for evaluating Spanish answers without an LLM. These are the
 * deterministic fallback; with an AI provider configured, sentence answers are
 * judged for meaning (see lib/ai). Results from this module are always marked
 * as "approximate" in the UI.
 */

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalize(s: string, keepAccents = false): string {
  const lower = s.toLowerCase().replace(/[¿?¡!.,;:"«»()…—–\-]/g, " ");
  return (keepAccents ? lower : stripAccents(lower)).replace(/\s+/g, " ").trim();
}

export function tokens(s: string, keepAccents = false): string[] {
  return normalize(s, keepAccents).split(" ").filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export type Verdict = "correct" | "minor" | "incorrect";
export interface MatchResult {
  verdict: Verdict;
  note: string | null;
  best: string;
  score: number;
}

/** Compares a short answer (word or set phrase) against accepted variants. */
export function matchShort(answer: string, accepted: string[]): MatchResult {
  const a = normalize(answer, true);
  const aPlain = stripAccents(a);
  let best: MatchResult = { verdict: "incorrect", note: null, best: accepted[0] ?? "", score: 0 };
  for (const target of accepted) {
    const t = normalize(target, true);
    if (!t) continue;
    const tPlain = stripAccents(t);
    if (a === t) return { verdict: "correct", note: null, best: target, score: 1 };
    // Spanish articles in front of nouns are optional in a vocabulary answer.
    const noArt = (s: string) => s.replace(/^(el|la|los|las|un|una) /, "");
    if (noArt(a) === noArt(t)) return { verdict: "correct", note: null, best: target, score: 1 };
    if (aPlain === tPlain || noArt(aPlain) === noArt(tPlain)) {
      best = { verdict: "minor", note: "Brakuje akcentu graficznego lub jest w złym miejscu.", best: target, score: 0.95 };
      continue;
    }
    const d = levenshtein(noArt(aPlain), noArt(tPlain));
    if (d === 1 && tPlain.length >= 5 && best.score < 0.9) {
      best = { verdict: "minor", note: "Drobna literówka.", best: target, score: 0.9 };
    }
  }
  return best;
}

/** Token F1 between two sentences (accent-insensitive). */
export function sentenceSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const counts = new Map<string, number>();
  for (const t of tb) counts.set(t, (counts.get(t) ?? 0) + 1);
  let common = 0;
  for (const t of ta) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      common++;
      counts.set(t, c - 1);
    }
  }
  const p = common / ta.length;
  const r = common / tb.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

/** Fallback sentence judgement: similarity to the closest accepted answer. */
export function matchSentence(answer: string, accepted: string[], requiredForms: string[] = []): MatchResult {
  const short = matchShort(answer, accepted);
  if (short.verdict !== "incorrect") return short;
  let bestScore = 0;
  let best = accepted[0] ?? "";
  for (const t of accepted) {
    const s = sentenceSimilarity(answer, t);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  const ans = ` ${normalize(answer)} `;
  const hasRequired = requiredForms.length === 0 || requiredForms.some((f) => ans.includes(` ${normalize(f)} `));
  if (bestScore >= 0.85 && hasRequired) return { verdict: "correct", note: null, best, score: bestScore };
  if (bestScore >= 0.6 && hasRequired)
    return { verdict: "minor", note: "Sens podobny, ale forma różni się od wzorca.", best, score: bestScore };
  return {
    verdict: "incorrect",
    note: hasRequired ? null : "W odpowiedzi brakuje ćwiczonego słowa.",
    best,
    score: bestScore,
  };
}

// ---------------------------------------------------------------------------
// Lexicon: map surface forms in free text to vocabulary entries
// ---------------------------------------------------------------------------
export interface Lexicon {
  byForm: Map<string, Set<string>>;
  verbStems: { stem: string; id: string }[];
  phrases: { norm: string; id: string }[];
}

export function buildLexicon(entries: Pick<VocabularyEntryRow, "id" | "kind" | "lemma" | "pos" | "forms">[]): Lexicon {
  const byForm = new Map<string, Set<string>>();
  const verbStems: { stem: string; id: string }[] = [];
  const phrases: { norm: string; id: string }[] = [];
  const add = (form: string, id: string) => {
    const f = normalize(form);
    if (!f || f.includes(" ")) return;
    if (!byForm.has(f)) byForm.set(f, new Set());
    byForm.get(f)!.add(id);
  };
  for (const e of entries) {
    if (e.kind === "phrase") {
      const norm = normalize(e.lemma.replace(/\.\.\.|…/g, " ").split("/")[0]);
      if (norm.split(" ").length >= 2) phrases.push({ norm, id: e.id });
      continue;
    }
    add(e.lemma, e.id);
    for (const f of e.forms) add(f, e.id);
    if (e.pos === "v") {
      const lemma = normalize(e.lemma).replace(/se$/, "");
      const stem = lemma.replace(/(ar|er|ir)$/, "");
      if (stem.length >= 4) verbStems.push({ stem, id: e.id });
    }
  }
  return { byForm, verbStems, phrases };
}

/** Entry ids that occur in `text`, with the matched surface form. */
export function findEntries(text: string, lex: Lexicon): Map<string, string> {
  const found = new Map<string, string>();
  const toks = tokens(text);
  for (const t of toks) {
    const ids = lex.byForm.get(t);
    if (ids) {
      // Ambiguous forms (e.g. "fue" = ser/ir) credit every candidate lemma.
      for (const id of ids) if (!found.has(id)) found.set(id, t);
      continue;
    }
    for (const { stem, id } of lex.verbStems) {
      if (t.length > stem.length && t.startsWith(stem) && !found.has(id)) found.set(id, t);
    }
  }
  const joined = ` ${toks.join(" ")} `;
  for (const p of lex.phrases) if (joined.includes(` ${p.norm} `)) found.set(p.id, p.norm);
  return found;
}

/** True when the regex pattern (written for accent-free lowercase text) matches. */
export function patternMatches(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern).test(normalize(text));
  } catch {
    return false;
  }
}
