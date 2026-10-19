import { expect, test as setup } from "@playwright/test";

/** Postgres mode only: signs in once and stores the session for the journey. */
setup("password sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  // Retry until the form is hydrated (the first dev-mode compile can be slow).
  await expect(async () => {
    await page.getByLabel("E-mail").fill("me@example.com");
    await page.getByLabel("Hasło").fill("wrong password");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page.getByText("Nieprawidłowy e-mail lub hasło.")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
  const api = await page.request.get("/api/export?format=json");
  expect(api.status()).toBe(401);
  await page.getByLabel("Hasło").fill("e2e-password");
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.context().storageState({ path: ".hablo-data/e2e-auth.json" });
});
