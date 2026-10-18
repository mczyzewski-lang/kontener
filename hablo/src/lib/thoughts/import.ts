import { createHash } from "node:crypto";
import type { ThoughtContext } from "@/lib/db/types";
import { parseContext } from "./contexts";

/**
 * Tolerant parser for the personal thoughts library. Accepts JSON shaped as
 * { categories, thoughts, questions } (Polish key names also work: kategorie,
 * myśli/mysli, pytania) or a plain array of thoughts. Nothing is dropped:
 * every field we do not model is preserved in `meta`, and unknown context
 * labels are kept in `meta.unknown_contexts`.
 */

export interface ParsedCategory {
  key: string;
  name: string;
  description: string | null;
  position: number;
}
export interface ParsedEntry {
  kind: "thought" | "question";
  originId: string;
  text: string;
  categoryKey: string | null;
  contexts: ThoughtContext[];
  featured: boolean;
  meta: Record<string, unknown>;
  hash: string;
}
export interface ParsedLibrary {
  categories: ParsedCategory[];
  entries: ParsedEntry[];
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}
function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}
function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") return ["true", "tak", "yes", "1", "x", "★"].includes(v.trim().toLowerCase());
  return false;
}
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
export function textHash(s: string): string {
  return createHash("sha256").update(s.trim()).digest("hex").slice(0, 16);
}

const TEXT_KEYS = ["text", "tekst", "tresc", "treść", "content", "mysl", "myśl", "thought", "question", "pytanie", "body", "quote"];
const ID_KEYS = ["id", "key", "slug", "uid"];
const CAT_KEYS = ["category", "kategoria", "category_id", "categoryId", "category_key", "categoryKey", "kategoria_id"];
const CTX_KEYS = ["contexts", "konteksty", "context", "kontekst", "display_contexts", "displayContexts", "when", "kiedy", "tags", "tagi"];
const FEAT_KEYS = ["featured", "wyrozniona", "wyróżniona", "wyrozniony", "wyróżniony", "highlighted", "highlight", "pinned", "starred"];

export function parseLibrary(raw: unknown): ParsedLibrary {
  const warnings: string[] = [];
  let root: Obj = {};
  if (Array.isArray(raw)) root = { thoughts: raw };
  else if (isObj(raw)) root = raw;
  else throw new Error("Plik musi zawierać obiekt JSON albo listę myśli.");

  // Categories
  const catSource = pick(root, ["categories", "kategorie", "category"]);
  const categories: ParsedCategory[] = [];
  const catByAny = new Map<string, string>();
  const addCategory = (key: string, name: string, description: string | null) => {
    if (catByAny.has(key.toLowerCase())) return catByAny.get(key.toLowerCase())!;
    categories.push({ key, name, description, position: categories.length });
    catByAny.set(key.toLowerCase(), key);
    catByAny.set(name.toLowerCase(), key);
    return key;
  };
  if (Array.isArray(catSource)) {
    for (const c of catSource) {
      if (typeof c === "string") addCategory(slug(c) || `kat-${categories.length + 1}`, c, null);
      else if (isObj(c)) {
        const name = str(pick(c, ["name", "nazwa", "title", "tytul", "tytuł", "label"])) ?? str(pick(c, ID_KEYS));
        if (!name) {
          warnings.push("Pominięto kategorię bez nazwy.");
          continue;
        }
        const key = str(pick(c, ID_KEYS)) ?? slug(name);
        addCategory(key, name, str(pick(c, ["description", "opis"])));
      }
    }
  } else if (isObj(catSource)) {
    for (const [k, v] of Object.entries(catSource)) addCategory(k, str(isObj(v) ? pick(v, ["name", "nazwa"]) : v) ?? k, isObj(v) ? str(pick(v, ["description", "opis"])) : null);
  }
  const resolveCategory = (v: unknown): string | null => {
    const s = str(isObj(v) ? pick(v, [...ID_KEYS, "name", "nazwa"]) : v);
    if (!s) return null;
    return catByAny.get(s.toLowerCase()) ?? addCategory(slug(s) || s, s, null);
  };

  const entries: ParsedEntry[] = [];
  const seen = new Set<string>();
  const parseList = (list: unknown, kind: "thought" | "question", inheritedCategory: string | null = null) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const o: Obj = isObj(item) ? item : { text: item };
      // A category object with nested thoughts: { name, thoughts: [...] }
      const nested = pick(o, ["thoughts", "mysli", "myśli", "items", "wpisy"]);
      if (Array.isArray(nested) && !str(pick(o, TEXT_KEYS))) {
        const cat = resolveCategory(o);
        parseList(nested, kind, cat);
        const nq = pick(o, ["questions", "pytania"]);
        if (Array.isArray(nq)) parseList(nq, "question", cat);
        continue;
      }
      const text = str(pick(o, TEXT_KEYS));
      if (!text) {
        warnings.push(`Pominięto wpis bez treści: ${JSON.stringify(item).slice(0, 80)}`);
        continue;
      }
      const ctxRaw = pick(o, CTX_KEYS);
      const ctxLabels = Array.isArray(ctxRaw) ? ctxRaw.map(String) : typeof ctxRaw === "string" ? ctxRaw.split(/[,;|]/) : [];
      const contexts: ThoughtContext[] = [];
      const unknown: string[] = [];
      for (const l of ctxLabels) {
        if (!l.trim()) continue;
        const c = parseContext(l);
        if (c && !contexts.includes(c)) contexts.push(c);
        else if (!c) unknown.push(l.trim());
      }
      const used = new Set([...TEXT_KEYS, ...ID_KEYS, ...CAT_KEYS, ...CTX_KEYS, ...FEAT_KEYS, "type", "kind", "rodzaj"]);
      const meta: Obj = {};
      for (const [k, v] of Object.entries(o)) if (!used.has(k)) meta[k] = v;
      if (unknown.length) meta.unknown_contexts = unknown;
      const typeHint = str(pick(o, ["type", "kind", "rodzaj"]))?.toLowerCase();
      const k = typeHint && /question|pytanie/.test(typeHint) ? "question" : kind;
      let originId = str(pick(o, ID_KEYS)) ?? `${k === "question" ? "q" : "t"}-${textHash(text)}`;
      if (seen.has(originId)) {
        warnings.push(`Powtórzony identyfikator „${originId}” — nadano nowy.`);
        originId = `${originId}-${textHash(text).slice(0, 6)}`;
      }
      seen.add(originId);
      entries.push({
        kind: k,
        originId,
        text,
        categoryKey: resolveCategory(pick(o, CAT_KEYS)) ?? inheritedCategory,
        contexts,
        featured: truthy(pick(o, FEAT_KEYS)),
        meta,
        hash: textHash(JSON.stringify([text, contexts, pick(o, CAT_KEYS) ?? inheritedCategory, truthy(pick(o, FEAT_KEYS))])),
      });
    }
  };
  parseList(pick(root, ["thoughts", "mysli", "myśli", "entries", "wpisy", "items"]), "thought");
  parseList(pick(root, ["questions", "pytania", "reflection_questions", "pytania_refleksyjne"]), "question");
  // Categories given as objects with nested thoughts.
  if (Array.isArray(catSource)) parseList(catSource.filter((c) => isObj(c) && (pick(c, ["thoughts", "mysli", "myśli", "questions", "pytania"]) !== undefined)), "thought");
  return { categories, entries, warnings };
}
