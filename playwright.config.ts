import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const testURL = new URL(baseURL);
if (!["localhost", "127.0.0.1"].includes(testURL.hostname)) {
  throw new Error(
    "Browser tests require a disposable loopback app and database.",
  );
}
const databaseURL = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(databaseURL.hostname) ||
  !/^\/budget_(?:e2e|ledger)_test(?:_[a-z0-9_]+)?$/.test(databaseURL.pathname)
) {
  throw new Error(
    "Browser tests require a disposable local budget_e2e_test database. Set DATABASE_URL before running.",
  );
}
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${testURL.port || "3100"}`,
    env: { BETTER_AUTH_URL: baseURL },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
