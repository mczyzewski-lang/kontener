import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app with the deterministic TEST AI provider —
 * no external services are called. By default in demo mode (local data file);
 * with E2E_DATABASE_URL set, against that PostgreSQL database with password
 * sign-in (the database is emptied first, so use a dedicated test database).
 * Uses the pre-installed Chromium; override with PLAYWRIGHT_CHROMIUM_PATH.
 */
const PORT = 3210;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (process.env.CI ? undefined : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");
const PG = process.env.E2E_DATABASE_URL;

const modeEnv: Record<string, string> = PG
  ? { DATABASE_URL: PG, HABLO_ALLOWED_EMAIL: "me@example.com", HABLO_PASSWORD: "e2e-password", HABLO_DEMO_MODE: "" }
  : { HABLO_DEMO_MODE: "1", HABLO_DATA_FILE: ".hablo-data/e2e/db.json", HABLO_ALLOWED_EMAIL: "", DATABASE_URL: "" };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: `http://localhost:${PORT}`,
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
  },
  projects: PG
    ? [
        { name: "login", testMatch: /login\.setup\.ts/ },
        { name: "journey", testMatch: /\.spec\.ts/, dependencies: ["login"], use: { storageState: ".hablo-data/e2e-auth.json" } },
      ]
    : [{ name: "journey", testMatch: /\.spec\.ts/ }],
  webServer: {
    command: PG ? `npx tsx tests/e2e/reset-postgres.ts && npx next dev -p ${PORT}` : `rm -rf .hablo-data/e2e && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/offline`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...modeEnv,
      HABLO_AI_MOCK: "1",
      ELEVENLABS_WEBHOOK_SECRET: "whsec_e2e",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
  },
});
