// Shared setup for Safe Location's Playwright tests.
//
// TEST MODE ONLY: every location here is simulated by Playwright's geolocation emulation.
// Map tiles and place-name lookups are replaced with local stand-ins so tests do not depend on
// (or add load to) OpenStreetMap's servers. Leaflet itself still loads from unpkg, so tests need internet.
// config.js is replaced per test: sync is off unless a test turns it on with test.use({ appConfig: {} }).
const { test: base, expect } = require("@playwright/test");

// Simulated starting point: Victoria Island, Lagos.
const START = { latitude: 6.4281, longitude: 3.4219, accuracy: 15 };

// A fixed fake time far from "now", so the app's clock-skew guard uses the fake clock for every reading.
const TEST_CLOCK = new Date("2026-01-15T07:00:00Z");

// 1×1 grey PNG used as a stand-in map tile.
const STAND_IN_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAI2AOq0BnJgwAAAABJRU5ErkJggg==",
  "base64"
);

async function stubMapServices(context) {
  const tile = (route) => route.fulfill({ contentType: "image/png", body: STAND_IN_TILE });
  await context.route("https://tile.openstreetmap.org/**", tile);
  await context.route("https://basemaps.cartocdn.com/**", tile);
  await context.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({ json: { display_name: "Test place (simulated lookup)" } })
  );
}

const test = base.extend({
  // Defaults for every test: simulated GPS at START, permission already granted, sync off.
  geolocation: [START, { option: true }],
  permissions: [["geolocation"], { option: true }],
  appConfig: [{ sync: false }, { option: true }],

  page: async ({ page, context, appConfig }, use) => {
    await stubMapServices(context);
    await context.route("**/config.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: `window.SAFE_LOCATION_CONFIG = ${JSON.stringify(appConfig)};` })
    );
    await page.clock.install({ time: TEST_CLOCK });
    await use(page);
  }
});

// Opens the app and waits until the map has finished its first load.
async function openApp(page) {
  await page.goto("/");
  await expect(page.locator("#map-overlay")).toBeHidden();
}

// Moves the simulated phone `steps` × ~28 m north of START.
async function moveTo(context, steps, accuracy = START.accuracy) {
  await context.setGeolocation({ latitude: START.latitude + steps * 0.00025, longitude: START.longitude, accuracy });
}

const entries = (page) => page.locator(".history-entry");
const startButton = (page) => page.getByRole("button", { name: "Start Tracking" });
const stopButton = (page) => page.getByRole("button", { name: "Stop" });

// Reads every saved record straight from IndexedDB through the app's storage helper.
const savedRecords = (page) => page.evaluate(() => storage.getAll());

// Gives the page a moment of real time, used to prove that nothing *extra* happened.
const settle = (page, ms = 800) => page.waitForTimeout(ms);

// Sync state of every local record, in order.
const syncStates = (page) => page.evaluate(async () => (await storage.getAll()).map((record) => record.syncState));

// Everything the server has stored for the signed-in user of this browser context.
async function serverRecords(page) {
  const response = await page.request.get("/api/v1/locations?limit=500");
  expect(response.status()).toBe(200);
  return (await response.json()).records;
}

/* ---------- Accounts (TEST MODE: throwaway users on the in-memory test server) ---------- */

const BASE_URL = "http://127.0.0.1:4173";
const TEST_PASSWORD = "e2e test passphrase only";

const uniqueEmail = () => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.test`;

// Reads the newest development email for an address and returns its link (path + query).
async function latestEmailLink(page, email) {
  let messages = [];
  await expect
    .poll(async () => {
      const response = await page.request.get(`/dev/outbox?to=${encodeURIComponent(email)}`);
      messages = (await response.json()).messages;
      return messages.length;
    })
    .toBeGreaterThan(0);
  const url = new URL(messages[messages.length - 1].text.match(/https?:\/\/\S+/)[0]);
  return url.pathname + url.search;
}

// Creates an account and confirms its email. Following the link signs this browser context in.
async function createVerifiedUser(page, { name = "Test user", email = uniqueEmail() } = {}) {
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: BASE_URL },
    data: { name, email, password: TEST_PASSWORD, callbackURL: "/account?welcome=1" }
  });
  expect(signUp.ok()).toBeTruthy();
  await page.request.get(await latestEmailLink(page, email), { maxRedirects: 0 });
  return { name, email, password: TEST_PASSWORD };
}

async function signInWithForm(page, { email, password }, next = "/") {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

// Uses the Backup card on the tracker page to register this browser as a device.
async function registerThisBrowser(page, name = "Test browser", { claim = false } = {}) {
  await expect(page.locator("#backup-register")).toBeVisible();
  await page.locator("#device-name").fill(name);
  if (claim) await page.locator("#claim-local").check();
  await page.getByRole("button", { name: "Register this browser" }).click();
  await expect(page.locator("#backup-active")).toBeVisible();
}

module.exports = {
  test, expect, START, openApp, moveTo, entries, startButton, stopButton, savedRecords, settle, syncStates, serverRecords,
  BASE_URL, TEST_PASSWORD, uniqueEmail, latestEmailLink, createVerifiedUser, signInWithForm, registerThisBrowser
};
