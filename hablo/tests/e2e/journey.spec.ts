import { expect, test, type Page } from "@playwright/test";

/**
 * Main user journey, in order (shared state): onboarding → daily plan →
 * new words → interruption & resume → reviews → story → grammar →
 * conversation (text mode, TEST AI) → report → progress/settings.
 */
test.describe.configure({ mode: "serial" });

async function typeAnswer(page: Page, text: string, submit = /Sprawdź|Dalej|Oceń|Odpowiedz|Wyślij/) {
  const kb = page.getByRole("button", { name: "Napisz odpowiedź" });
  if (await kb.isVisible().catch(() => false)) await kb.click();
  await page.getByLabel("Twoja odpowiedź").fill(text);
  await page.getByRole("button", { name: submit }).first().click();
}

test("onboarding with placement test prepares the first day", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/onboarding/);
  await expect(page.getByText("TRYB TESTOWY AI")).toBeVisible();
  await page.getByPlaceholder("Imię").fill("Marek");
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("radio", { name: /Podstawy/ }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("radio", { name: /Tak, sprawdź mnie/ }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: /^30/ }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Dom w Hiszpanii" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Restauracje i bary" }).click();
  await page.getByRole("button", { name: "Sąsiedzi i small talk" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();

  // Placement: answer "Nie wiem" to everything — nothing may be claimed as known.
  await expect(page.getByText("Co znaczy to słowo?")).toBeVisible();
  for (let i = 0; i < 40; i++) {
    const dunno = page.getByRole("button", { name: "Nie wiem", exact: true });
    if (!(await dunno.isVisible().catch(() => false))) break;
    const counter = page.getByText(/^Słowo \d+ z \d+/);
    const before = await counter.innerText().catch(() => "");
    await dunno.click();
    // Wait until the answer registers (the first click can land before hydration).
    await expect(async () => {
      const stillHere = await dunno.isVisible().catch(() => false);
      if (stillHere && (await counter.innerText().catch(() => "")) === before) {
        await dunno.click();
        throw new Error("answer not registered yet");
      }
    }).toPass({ timeout: 15_000 });
  }
  await page.getByRole("button", { name: "Dalej" }).click();
  await typeAnswer(page, "Me llamo Marek y vivo en Alicante", /Dalej/);
  await typeAnswer(page, "Quiero un café con leche, por favor", /Dalej/);
  await typeAnswer(page, "Ayer trabajé y fui a la playa", /Dalej/);
  await expect(page.getByText("Twój program jest gotowy")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Zaczynamy/ }).click();
  await expect(page.getByText("Dzień 1")).toBeVisible();
  await expect(page.getByRole("link", { name: /Zacznij dzisiejszą lekcję/ })).toBeVisible();
});

test("the daily plan is stable across refreshes", async ({ page }) => {
  await page.goto("/lesson");
  const first = await page.locator("ol li").allInnerTexts();
  await page.reload();
  expect(await page.locator("ol li").allInnerTexts()).toEqual(first);
  expect(first.join(" ")).toMatch(/Nowe słowa/);
  expect(first.join(" ")).toMatch(/Rozmowa|Zamawiam|Sąsiad|Restauracja|Rozmowa z/);
});

test("learning new words, interrupting and resuming without losing progress", async ({ page }) => {
  await page.goto("/lesson");
  await page.getByRole("link", { name: /Nowe słowa/ }).first().click();
  await expect(page).toHaveURL(/learn\/new/);
  const counter = page.locator("span.tabular-nums").first();
  await expect(counter).toHaveText(/^0\/[1-9]\d*$/);
  const total = Number((await counter.innerText()).split("/")[1]);

  // Word 1: intro → listening choice → recall typed.
  await page.getByRole("button", { name: "Ćwicz to słowo" }).click();
  await page.locator("button[lang='pl']").first().click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await typeAnswer(page, "zzz");
  await expect(page.getByText(/Jeszcze nie|Prawie|Correcto/)).toBeVisible();
  await page.getByRole("button", { name: "Dalej" }).click();

  // Interrupt: leave and come back. The finished word must not be offered again.
  await page.reload();
  await expect(counter).toHaveText(/^0\/[1-9]\d*$/);
  const remaining = Number((await counter.innerText()).split("/")[1]);
  expect(remaining).toBe(total - 2);
});

test("vocabulary shows progress per competence and word details", async ({ page }) => {
  await page.goto("/vocabulary");
  await page.getByRole("button", { name: "W nauce" }).click();
  const first = page.locator("a[href^='/vocabulary/']").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByText("Trzy kompetencje")).toBeVisible();
  await expect(page.getByText("Historia prób")).toBeVisible();
});

test("story: listen, read, questions, retell, own story → recurring schedule", async ({ page }) => {
  await page.goto("/stories");
  await page.locator("a[href^='/stories/']").filter({ hasText: "Un coche grande" }).first().click();
  await expect(page.getByText("Etap 1 z 6")).toBeVisible();
  await page.getByRole("button", { name: /Dalej: Czytaj/ }).click();
  await page.getByRole("button", { name: "coche." }).first().click();
  await expect(page.getByText("samochód")).toBeVisible();
  await page.getByRole("button", { name: /Dalej: Słowa/ }).click();
  await page.getByRole("button", { name: /Dalej: Pytania/ }).click();
  await typeAnswer(page, "Porque tiene una familia grande", /Odpowiedz/);
  await typeAnswer(page, "Treinta mil euros", /Odpowiedz/);
  await typeAnswer(page, "En autobús", /Odpowiedz/);
  await expect(page.getByText("✓ En autobús")).toBeVisible();
  await page.getByRole("button", { name: /Dalej: Opowiedz/ }).click();
  await typeAnswer(page, "Quiero comprar un coche grande para mi familia pero es caro", /Oceń/);
  await expect(page.getByText(/Wynik:/)).toBeVisible();
  await page.getByRole("button", { name: /Dalej: Twoja historia/ }).click();
  await typeAnswer(page, "El año pasado quería comprar un coche grande y el precio era caro", /Oceń/);
  await expect(page.getByText(/Wynik:/)).toBeVisible();
  await page.getByRole("button", { name: "Zakończ historię" }).click();
  await expect(page).toHaveURL(/\/stories$/);
  await expect(page.getByText(/wróci/).first()).toBeVisible();
});

test("grammar lesson: explanation, exercises, mini-conversation", async ({ page }) => {
  await page.goto("/grammar");
  await page.getByRole("link", { name: /Budowa zdania/ }).click();
  await page.getByRole("button", { name: "Ćwiczymy" }).click();
  for (let i = 0; i < 12; i++) {
    if (await page.getByText("Mini-rozmowa").isVisible().catch(() => false)) break;
    const choice = page.locator("button[lang='es']").first();
    if (await choice.isVisible().catch(() => false)) await choice.click();
    else await typeAnswer(page, "No, no vivo en Madrid");
    await page.getByRole("button", { name: "Dalej" }).click();
  }
  await expect(page.getByText("Mini-rozmowa")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    if (await page.getByText("Lekcja zakończona").isVisible().catch(() => false)) break;
    await typeAnswer(page, "Me llamo Marek, soy de Polonia y vivo en España, hablo un poco");
    await page.getByRole("button", { name: "Dalej" }).click();
  }
  await expect(page.getByText("Lekcja zakończona")).toBeVisible();
  await page.goto("/grammar");
  await expect(page.getByText("w nauce").first()).toBeVisible();
});

test("conversation (text mode, TEST AI) → report with mistakes and missing words feeding reviews", async ({ page }) => {
  await page.goto("/speak");
  await expect(page.getByText(/Rozmowy głosowe wymagają ElevenLabs/)).toBeVisible();
  await page.getByRole("link", { name: "Rozmawiaj tekstem" }).click();
  await expect(page.getByText(/Tryb tekstowy/)).toBeVisible();
  await page.getByRole("button", { name: "Rozpocznij rozmowę" }).click();
  await typeAnswer(page, "Hoy quiero ir a la playa con mi familia", /Wyślij/);
  await expect(page.getByText("¿Y qué más me cuentas?")).toBeVisible();
  await page.getByRole("button", { name: "Podpowiedź" }).click();
  await expect(page.getByText("— Podpowiedź —")).toBeVisible();
  await typeAnswer(page, "Yo soy cansado. ¿Cómo se dice klucz?", /Wyślij/);
  await page.getByRole("button", { name: /Zakończ/ }).click();
  await expect(page).toHaveURL(/speak\/report/, { timeout: 30_000 });
  await expect(page.getByText("Najważniejsze błędy")).toBeVisible();
  await expect(page.getByText("estoy cansado").first()).toBeVisible();
  await expect(page.getByText("Słowa, których zabrakło")).toBeVisible();
  await expect(page.getByText("llave")).toBeVisible();
  await expect(page.getByText(/nie jest to certyfikowany test CEFR/)).toBeVisible();

  // The missing word is now in the learner's own vocabulary, queued for review.
  await page.goto("/vocabulary");
  await page.getByRole("button", { name: "Moje" }).click();
  await expect(page.getByText("llave")).toBeVisible();
});

test("progress, daily feedback and settings (export, integration status)", async ({ page, request }) => {
  await page.goto("/progress");
  await expect(page.getByText("Minuty samodzielnej, zrozumiałej rozmowy")).toBeVisible();
  await expect(page.getByRole("img", { name: /Minuty nauki dziennie/ })).toBeVisible();
  await page.goto("/lesson/feedback");
  await expect(page.getByText("Skuteczność powtórek")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText("Status integracji")).toBeVisible();
  const exp = await request.get("/api/export?format=json");
  expect(exp.ok()).toBeTruthy();
  const data = await exp.json();
  expect(data.vocabulary_progress.length).toBeGreaterThan(0);
  const csv = await request.get("/api/export?format=csv");
  expect((await csv.text()).split("\n")[0]).toContain("lemma,kind,translation");
});

test("webhook rejects unsigned calls; voice start fails clearly without ElevenLabs", async ({ request }) => {
  const r = await request.post("/api/elevenlabs/webhook", { data: { type: "post_call_transcription" } });
  expect(r.status()).toBe(401);
  const v = await request.post("/api/conversation/start", {
    data: { scenarioId: "cafe-order", mode: "guided", grammarTopicId: null, planItemId: null, channel: "voice" },
  });
  expect(v.status()).toBe(503);
  expect((await v.json()).error).toMatch(/ELEVENLABS/);
});
