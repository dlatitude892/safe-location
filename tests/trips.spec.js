// Trip Mode (Phase 7) in the browser.
// TEST MODE: simulated GPS and notifications; a trip-setting "minute" lasts 400 ms on the test server
// (TRIP_TEST_MINUTE_MS) and the watchdog runs every 200 ms, so missed check-ins happen within seconds.
// The page has a fake clock: page.clock.fastForward() moves the phone's timers (recording, polling).
const {
  test, expect, openApp, moveTo, entries, settle, syncStates, serverRecords, BASE_URL, createVerifiedUser, registerThisBrowser
} = require("./helpers");

test.use({ appConfig: {} });

async function addContact(page, contact) {
  const response = await page.request.post("/api/v1/contacts", { headers: { origin: BASE_URL }, data: { notifySos: true, relationship: null, email: null, phone: null, ...contact } });
  expect(response.status()).toBe(201);
}

async function readyForTrips(page, contacts = [{ name: "Mum", phone: "+2348031234567" }]) {
  await createVerifiedUser(page, { name: "Ada" });
  for (const contact of contacts) await addContact(page, contact);
  await openApp(page);
  await registerThisBrowser(page);
  await expect(page.getByRole("button", { name: "Start a trip" })).toBeVisible();
}

// Fills the Trip Mode form. silence/grace are in trip "minutes" (400 ms each on the test server).
async function startTripWithForm(page, { silence = "60", grace = "15", escalation = "checkin-then-notify", notifyStartEnd = false, arrivalInMinutes = null } = {}) {
  await page.getByRole("button", { name: "Start a trip" }).click();
  await expect(page.getByRole("button", { name: "Start trip" })).toBeEnabled(); // contacts loaded
  await page.getByLabel("From").fill("Yaba");
  await page.getByLabel("To", { exact: true }).fill("Lekki Phase 1");
  if (arrivalInMinutes) {
    const time = await page.evaluate((minutes) => {
      const at = new Date(Date.now() + minutes * 60000 + 30000);
      return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    }, arrivalInMinutes);
    await page.getByLabel("Expected arrival (optional)").fill(time);
  }
  // The check-in rules are folded under "Check-in options" (sensible defaults for most trips).
  const more = page.locator("details.trip-more");
  if (!(await more.evaluate((node) => node.open))) await more.locator("summary").click();
  await page.locator("#trip-silence").selectOption(silence);
  await page.locator("#trip-grace").selectOption(grace);
  await page.locator(`input[name="trip-escalation"][value="${escalation}"]`).check();
  if (notifyStartEnd) await page.getByLabel("Also message my trip contacts when the trip starts and ends").check();
  await page.getByRole("button", { name: "Start trip" }).click();
  await expect(page.locator("#trip-active")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(trip.current && trip.current.confirmed))).toBe(true);
  return page.evaluate(() => trip.current.id);
}

const serverTrip = async (page, id) => (await (await page.request.get(`/api/v1/trips/${id}`)).json()).trip;
const badge = (page) => page.locator("#trip-badge");

test.describe("Trip Mode", () => {
  test("history page needs sign-in", async ({ page }) => {
    await page.goto("/trips");
    await expect(page).toHaveURL(/\/signin\?next=%2Ftrips/);
  });

  test("start, record, end, and review the trip with its route and messages", async ({ page, context }) => {
    await readyForTrips(page);
    const id = await startTripWithForm(page, { notifyStartEnd: true });
    await expect(badge(page)).toHaveText("Active");
    await expect(page.locator("#trip-route")).toHaveText("Yaba → Lekki Phase 1");
    await expect(page.locator("#trip-contacts-list")).toHaveText("Mum");
    await expect(page.locator("#trip-tracking-note")).toBeVisible(); // tracking is controlled by the trip
    await expect(page.locator("#tracking-state")).toHaveText("Tracking active");

    for (const step of [1, 2]) {
      await moveTo(context, step);
      await page.clock.fastForward(60000);
    }
    await expect(entries(page)).toHaveCount(3);
    await expect.poll(() => syncStates(page)).toEqual(["synced", "synced", "synced"]);
    await expect(page.locator("#trip-pending")).toHaveText("None: everything is uploaded");
    await expect(page.locator("#trip-confirmed")).toContainText("±15 m");
    await expect(page.locator("#trip-current")).toContainText("Current: ±15 m");
    const stored = await serverRecords(page);
    expect(stored.every((record) => record.sessionId === id)).toBe(true); // the trip's points carry the trip's ID

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "End trip" }).click();
    await expect(page.locator("#message")).toContainText("You can review it in Trip history", { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Start a trip" })).toBeVisible();
    await expect(page.locator("#tracking-state")).toHaveText("Not tracking");
    expect((await serverTrip(page, id)).status).toBe("completed");

    await page.goto("/trips");
    await expect(page.locator("#trip-list")).toContainText("Yaba → Lekki Phase 1");
    await expect(page.locator("#trip-list")).toContainText("Completed");
    await page.getByRole("button", { name: /View trip from Yaba/ }).click();
    await expect(page.locator("#detail-facts")).toContainText("Uploaded points3");
    await expect(page.locator("#detail-messages")).toContainText("Trip started · Mum · SMS");
    await expect(page.locator("#detail-messages")).toContainText("Trip ended · Mum · SMS");
    await expect(page.locator("#trip-map .leaflet-overlay-pane path")).toHaveCount(3); // route line + start + end markers
    await expect(page.locator("#detail-facts")).toContainText("Check-in if no update for60 min");
  });

  test("pause stops recording; resume continues the same trip", async ({ page }) => {
    await readyForTrips(page);
    const id = await startTripWithForm(page);
    await expect(entries(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(badge(page)).toHaveText("Paused");
    await expect(page.locator("#trip-current")).toHaveText("Not recording (paused)");
    await expect(page.locator("#tracking-state")).toHaveText("Not tracking");
    await page.clock.fastForward(3 * 60000);
    await settle(page);
    await expect(entries(page)).toHaveCount(1);
    await expect.poll(async () => (await serverTrip(page, id)).status, { timeout: 15000 }).toBe("paused");

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(badge(page)).toHaveText("Active");
    await expect(entries(page)).toHaveCount(2);
    await expect.poll(async () => (await serverTrip(page, id)).status, { timeout: 15000 }).toBe("active");
    const sessions = await page.evaluate(() => [...new Set(app.history.map((record) => record.sessionId))]);
    expect(sessions).toEqual([id]);
  });

  test("starting a trip while already tracking keeps recording, now as part of the trip", async ({ page }) => {
    await readyForTrips(page);
    await page.getByRole("button", { name: "Start Tracking" }).click();
    await expect(entries(page)).toHaveCount(1);

    const id = await startTripWithForm(page);
    await expect(page.locator("#tracking-state")).toHaveText("Tracking active");
    expect(await page.evaluate(() => tracker.sessionId)).toBe(id); // new points belong to the trip
    await expect(page.locator("#message")).not.toContainText("another Safe Location tab");
  });

  test("updates stop: the server asks for a check-in, and 'I'm OK' clears it", async ({ page, context }) => {
    await readyForTrips(page);
    const id = await startTripWithForm(page, { silence: "10", escalation: "remind-only" });
    await context.route("**/api/v1/locations/batch", (route) => route.abort("connectionrefused")); // nothing reaches the server
    await expect.poll(async () => (await serverTrip(page, id)).state, { timeout: 10000 }).toBe("checkin-requested");

    await page.clock.fastForward(30000); // the phone's next status check
    await expect(badge(page)).toHaveText("Check-in requested");
    await expect(page.locator("#trip-checkin-text")).toHaveText("No location has reached the server for 10 minutes. Your contacts won't be told.");
    await expect(page.getByRole("button", { name: "I'm OK" })).toBeFocused(); // shown over the map, with the focus
    await expect(page).toHaveTitle("Check in · Safe Location");

    await page.getByRole("button", { name: "I'm OK" }).click();
    await expect(page.locator("#trip-checkin")).toBeHidden();
    await expect.poll(async () => (await serverTrip(page, id)).checkinRequestedAt).toBeNull();
    expect((await serverTrip(page, id)).notifications).toEqual([]); // "remind only": contacts never messaged
  });

  test("missed check-in: contacts are told, failures are shown honestly, and the wording makes no claims", async ({ page, context }) => {
    await readyForTrips(page, [
      { name: "Mum", phone: "+2348031234567" },
      { name: "Flaky", phone: "+2348030000000" } // simulated provider rejects this number
    ]);
    const id = await startTripWithForm(page, { silence: "10", escalation: "notify-immediately" });
    await context.route("**/api/v1/locations/batch", (route) => route.abort("connectionrefused"));
    await expect.poll(async () => {
      const current = await serverTrip(page, id);
      return current.notifications.filter((item) => item.kind === "trip-missed-checkin" && item.submissionStatus !== "pending").length;
    }, { timeout: 15000 }).toBe(2);

    await page.clock.fastForward(30000);
    await expect(page.locator("#trip-checkin-text")).toContainText("have been told");
    const outbox = await (await page.request.get("/dev/outbox?to=%2B2348031234567")).json();
    const text = outbox.messages.at(-1).text;
    expect(text).toContain("doesn't necessarily mean something is wrong");
    expect(text).not.toMatch(/kidnap|abduct|in danger/i);

    await page.goto(`/trips?trip=${id}`);
    await expect(page.locator("#detail-messages")).toContainText("Missed check-in · Flaky · SMS");
    await expect(page.locator("#detail-messages")).toContainText("Failed to send");
    await expect(page.locator("#detail-messages")).toContainText("Delivery confirmed (simulated");
  });

  test("an offline journey keeps every point and uploads it when the connection returns", async ({ page, context }) => {
    await readyForTrips(page);
    const id = await startTripWithForm(page);
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);

    await context.setOffline(true);
    for (const step of [1, 2, 3]) {
      await moveTo(context, step);
      await page.clock.fastForward(60000);
    }
    await expect(entries(page)).toHaveCount(4);
    await expect(badge(page)).toHaveText("Offline");
    await expect(page.locator("#trip-state-text")).toContainText("points are saved on this phone");
    await expect(page.locator("#trip-pending")).toHaveText("3 points (synchronization pending)");

    await context.setOffline(false);
    await expect.poll(() => syncStates(page), { timeout: 15000 }).toEqual(["synced", "synced", "synced", "synced"]);
    await expect(page.locator("#trip-pending")).toHaveText("None: everything is uploaded");
    expect((await serverTrip(page, id)).points).toBe(4);
  });

  test("a trip started offline is registered with the server when the connection returns", async ({ page, context }) => {
    await readyForTrips(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Start a trip" }).click();
    await page.getByLabel("From").fill("Ikeja");
    await page.getByLabel("To", { exact: true }).fill("Surulere");
    await page.locator("details.trip-more summary").click(); // "Check-in options"
    await page.locator("#trip-silence").selectOption("60");
    await page.getByRole("button", { name: "Start trip" }).click();
    await expect(badge(page)).toHaveText("Offline (not yet registered)");
    await expect(page.locator("#trip-state-text")).toContainText("Not yet registered with the server");
    const id = await page.evaluate(() => trip.current.id);

    await context.setOffline(false);
    await expect.poll(() => page.evaluate(() => trip.current && trip.current.confirmed), { timeout: 15000 }).toBe(true);
    expect((await serverTrip(page, id)).origin).toBe("Ikeja");
    await expect(page.locator("#trip-state-text")).not.toContainText("Not yet registered");
  });

  test("delayed synchronization is shown, and a stale position is never called current", async ({ page, context }) => {
    await readyForTrips(page);
    await startTripWithForm(page);
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
    // The server is reachable but too busy to take uploads ("try again later"), so points wait on the phone.
    await context.route("**/api/v1/locations/batch", (route) => route.fulfill({ status: 429, headers: { "Retry-After": "60" }, json: { error: { code: "rate_limited", message: "busy" } } }));
    for (const step of [1, 2, 3, 4]) {
      await moveTo(context, step);
      await page.clock.fastForward(60000);
    }
    // Fast-forwarding the fake clock can also fire the app's 15-second request timeout on a request that
    // happened to be in flight, which (correctly) counts as "server unreachable". The app re-checks the
    // server 30 s later, so let that happen before looking at the badge.
    // Under load that can happen more than once, so keep moving the clock until a re-check has succeeded.
    await expect.poll(async () => {
      await page.clock.fastForward(30000);
      return badge(page).textContent();
    }, { timeout: 20000 }).toBe("Delayed update");
    await expect(page.locator("#trip-pending")).toContainText("synchronization pending");
    await expect(page.locator("#trip-confirmed")).toContainText("min old"); // the last confirmed point is minutes old

    // Make the latest fix 5 minutes old and read the result in one step: the emulated GPS can deliver a
    // fresh fix at any moment, which would (correctly) make the position current again.
    const stale = await page.evaluate(() => {
      tracker.latestFix.receivedAt = Date.now() - 5 * 60000;
      renderTrip();
      return document.querySelector("#trip-current").textContent;
    });
    expect(stale).toMatch(/Last known: [5-6] min old/);
    expect(stale).toContain("may be out of date");
  });

  test("cancelling a trip stops tracking and keeps the points", async ({ page }) => {
    await readyForTrips(page);
    const id = await startTripWithForm(page);
    await expect(entries(page)).toHaveCount(1);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel trip" }).click();
    await expect(page.getByRole("button", { name: "Start a trip" })).toBeVisible({ timeout: 10000 });
    expect((await serverTrip(page, id)).status).toBe("cancelled");
    await expect(entries(page)).toHaveCount(1);
  });
});
