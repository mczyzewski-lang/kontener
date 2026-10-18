/**
 * Validates all educational content and cross-references between files.
 * Run in CI and before seeding: npx tsx scripts/validate-content.ts
 */
import { loadContent } from "../src/lib/content";
import { GRAMMAR_TOPIC_IDS } from "../src/lib/content/schemas";

const errors: string[] = [];
const c = loadContent();

const grammarIds = new Set(c.grammar.map((g) => g.id));
for (const id of GRAMMAR_TOPIC_IDS) if (!grammarIds.has(id)) errors.push(`Missing grammar topic ${id}`);
for (const g of c.grammar) {
  for (const ex of g.exercises) {
    if (ex.type === "choice" && !ex.options.includes(ex.answer)) errors.push(`${g.id}: choice answer not in options`);
    if (ex.type === "speak" || ex.type === "fill" || ex.type === "translate") {
      // fine
    }
  }
  for (const q of g.mini_conversation.questions) {
    try {
      new RegExp(q.pattern);
    } catch {
      errors.push(`${g.id}: invalid regex ${q.pattern}`);
    }
  }
}

const ids = new Set<string>();
for (const v of c.vocabulary) {
  if (ids.has(v.id)) errors.push(`Duplicate vocabulary id ${v.id}`);
  ids.add(v.id);
}
const words = c.vocabulary.filter((v) => v.kind === "word");
if (words.length < 200) errors.push(`Need at least 200 words, have ${words.length}`);

const lemmas = new Set(words.map((w) => w.lemma.toLowerCase()));
for (const s of c.stories) {
  for (const l of s.target_lemmas) if (!lemmas.has(l)) errors.push(`Story ${s.id}: target lemma "${l}" not in vocabulary`);
}
if (c.scenarios.length < 5) errors.push("Need at least five scenarios");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Content OK: ${words.length} words, ${c.vocabulary.length - words.length} phrases, ` +
    `${c.grammar.length} grammar topics, ${c.scenarios.length} scenarios, ${c.stories.length} seed stories.`,
);
