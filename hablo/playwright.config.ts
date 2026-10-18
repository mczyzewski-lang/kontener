import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app in demo mode (local data file) with the
 * deterministic TEST AI provider — no external services are called.
 * Uses the pre-installed Chromium; override with PLAYWRIGHT_CHROMIUM_PATH.
 */
const PORT = 3210;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (process.env.CI ? undefined : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");

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
  webServer: {
    command: `rm -rf .hablo-data/e2e && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/offline`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      HABLO_DEMO_MODE: "1",
      HABLO_AI_MOCK: "1",
      HABLO_DATA_FILE: ".hablo-data/e2e/db.json",
      ELEVENLABS_WEBHOOK_SECRET: "whsec_e2e",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      HABLO_ALLOWED_EMAIL: "",
    },
  },
});
