import { defineConfig, devices } from "@playwright/test";
import { browserTestEnvironment } from "./scripts/test-environment.mjs";
const testEnv = browserTestEnvironment();
const baseURL = testEnv.E2E_BASE_URL;
const testURL = new URL(baseURL);
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
    env: testEnv,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
