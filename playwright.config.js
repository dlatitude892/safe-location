// Playwright configuration for Safe Location's automated browser tests.
// Run with: npm test   (starts a local server automatically)
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: true,
  workers: 3, // trip tests depend on real server timing; more at once on an 8-core laptop made them flaky
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    serviceWorkers: "block", // the offline-reload tests turn the service worker on explicitly
    screenshot: "only-on-failure"
  },
  // The real Safe Location server (website + API) with a throwaway in-memory database.
  webServer: {
    command: "node server/index.js",
    url: "http://127.0.0.1:4173/api/v1/health",
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      HOST: "127.0.0.1",
      PORT: "4173",
      PUBLIC_URL: "http://127.0.0.1:4173",
      DATABASE_PATH: ":memory:",
      AUTH_DATABASE_PATH: ":memory:",
      BETTER_AUTH_SECRET: "playwright-test-secret-not-a-real-secret-0123456789", // test-only value
      MAIL_OUTBOX_DIR: "", // emails stay in memory; tests read them from /dev/outbox
      DEV_TEST_ENDPOINTS: "true",
      API_RATE_LIMIT_PER_MINUTE: "100000",
      AUTH_RATE_LIMIT_PER_MINUTE: "100000",
      AUTH_GENERAL_RATE_LIMIT_PER_MINUTE: "100000", // all parallel tests share one IP address
      NOTIFY_MODE: "simulated", // never send real messages from tests
      SIMULATED_DELIVERY_DELAY_MS: "300",
      NOTIFY_POLL_INTERVAL_MS: "100",
      NOTIFY_RETRY_BASE_MS: "100",
      TRIP_TEST_MINUTE_MS: "400", // a trip-setting "minute" lasts 400 ms in tests (enough headroom when every test runs in parallel)
      TRIP_WATCH_INTERVAL_MS: "200",
      LOG_LEVEL: "warn"
    }
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec/ }
  ]
});
