// Backup/sync: uploading, the offline queue, retries with backoff, duplicates and failures.
// Runs against the real server started by playwright.config.js (in-memory databases).
// Each test creates its own throwaway account and registers this browser as a device.
const {
  test, expect, openApp, moveTo, entries, startButton, savedRecords, settle, syncStates, serverRecords,
  createVerifiedUser, registerThisBrowser
} = require("./helpers");

test.use({ appConfig: {} }); // backup on

const DATA_API = "**/api/v1/**";
const BATCH = "**/api/v1/locations/batch";

async function readyToBackUp(page) {
  await createVerifiedUser(page);
  await openApp(page);
  await registerThisBrowser(page);
}

test.describe("backup", () => {
  test("health check answers without signing in", async ({ request }) => {
    const response = await request.get("/api/v1/health");
    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe("ok");
  });

  test("saved points upload and are marked synced only after the server confirms", async ({ page }) => {
    await readyToBackUp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
    await expect(page.locator("#sync-state")).toHaveText("All uploaded");
    await expect(page.locator("#status-sync")).toHaveText("Synchronization complete");
    await expect(page.locator("#status-last-sync")).not.toHaveText("Never on this device");

    const [local] = await savedRecords(page);
    const [stored] = await serverRecords(page);
    expect(stored.id).toBe(local.id);
    expect(stored.sessionId).toBe(local.sessionId);
    expect(stored.deviceTimestamp).toBe(local.timestamp); // device time kept as reported…
    expect(typeof stored.serverReceivedAt).toBe("number"); // …next to the server's own time
  });

  test("backend down: recording continues, points queue, and upload when it returns", async ({ page, context }) => {
    await readyToBackUp(page);
    await context.route(DATA_API, (route) => route.abort("connectionrefused"));
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    for (const step of [1, 2]) {
      await moveTo(context, step);
      await page.clock.fastForward(60000);
      await expect(entries(page)).toHaveCount(step + 1);
    }

    await settle(page);
    expect(await syncStates(page)).toEqual(["pending", "pending", "pending"]);
    await expect(page.locator("#sync-state")).toHaveText("3 waiting");
    await expect(page.locator("#stat-sync")).toContainText("could not be reached");
    await expect(page.getByText("Not uploaded")).toHaveCount(3);

    await page.getByRole("button", { name: "Stop tracking" }).click();
    await context.unroute(DATA_API); // server is back
    await page.clock.fastForward(5 * 60000); // the scheduled retry fires
    await expect.poll(() => syncStates(page)).toEqual(["synced", "synced", "synced"]);
    expect(await serverRecords(page)).toHaveLength(3);
    await expect(page.getByText("Not uploaded")).toHaveCount(0);
  });

  test("browser offline: nothing is sent until the connection returns", async ({ page, context }) => {
    await readyToBackUp(page);
    await context.setOffline(true);
    const uploads = [];
    page.on("request", (request) => { if (request.url().includes("/api/v1/locations/batch")) uploads.push(request); });

    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2);
    await settle(page);
    expect(uploads).toHaveLength(0);
    await expect(page.locator("#stat-sync")).toContainText("Offline");

    await context.setOffline(false); // "online" event uploads straight away
    await expect.poll(() => syncStates(page)).toEqual(["synced", "synced"]);
    expect(await serverRecords(page)).toHaveLength(2);
  });

  test("temporary failures retry with exponential backoff, then succeed", async ({ page, context }) => {
    await readyToBackUp(page);
    let calls = 0;
    await context.route(BATCH, (route) => {
      calls += 1;
      if (calls <= 2) return route.fulfill({ status: 503, json: { error: { code: "server_error", message: "test outage" } } });
      return route.continue();
    });

    await startButton(page).click();
    await expect.poll(() => calls).toBe(1);
    const firstDelay = await page.evaluate(() => sync.nextRetryAt - Date.now());
    expect(firstDelay).toBeGreaterThan(1400);
    expect(firstDelay).toBeLessThanOrEqual(2400); // ~2 s ±20 %
    expect(await syncStates(page)).toEqual(["pending"]); // never marked synced on failure
    await expect(page.locator("#stat-sync")).toContainText("temporary problem (503)");

    await page.clock.fastForward(2500);
    await expect.poll(() => calls).toBe(2);
    const secondDelay = await page.evaluate(() => sync.nextRetryAt - Date.now());
    expect(secondDelay).toBeGreaterThan(3000);
    expect(secondDelay).toBeLessThanOrEqual(4800); // ~4 s ±20 %

    await page.clock.fastForward(5000);
    await expect.poll(() => calls).toBe(3);
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
  });

  test("backoff never exceeds 5 minutes and respects Retry-After", async ({ page }) => {
    await openApp(page);
    const delays = await page.evaluate(() => {
      sync.attempt = 40;
      scheduleSyncRetry(new SyncError("test"));
      const capped = sync.nextRetryAt - Date.now();
      sync.attempt = 0;
      scheduleSyncRetry(new SyncError("test", { retryAfterMs: 90000 }));
      const retryAfter = sync.nextRetryAt - Date.now();
      clearTimeout(sync.timerId);
      sync.timerId = null;
      return { capped, retryAfter };
    });
    expect(delays.capped).toBeLessThanOrEqual(5 * 60000);
    expect(delays.capped).toBeGreaterThan(4 * 60000);
    expect(delays.retryAfter).toBeGreaterThanOrEqual(89000);
  });

  test("a server error keeps points pending and shows the problem", async ({ page, context }) => {
    await readyToBackUp(page);
    await context.route(BATCH, (route) => route.fulfill({ status: 500, json: { error: { code: "server_error", message: "boom" } } }));
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator("#stat-sync")).toContainText("temporary problem (500)");
    await page.clock.fastForward(3000);
    await settle(page);
    expect(await syncStates(page)).toEqual(["pending"]);
    await expect(page.locator("#sync-state")).toHaveText("1 waiting");
  });

  test("uploading the same points again does not create duplicates", async ({ page }) => {
    await readyToBackUp(page);
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);

    // Pretend this browser forgot the upload happened (e.g. it crashed before saving the "synced" mark).
    const reply = page.waitForResponse((response) => response.url().includes("/locations/batch"));
    await page.evaluate(() => {
      app.history.forEach((record) => { record.syncState = "pending"; });
      runSync();
    });
    const body = await (await reply).json();
    expect(body.accepted).toEqual([]);
    expect(body.duplicates).toHaveLength(1);

    await expect.poll(() => page.evaluate(() => app.history.map((record) => record.syncState))).toEqual(["synced"]);
    expect(await serverRecords(page)).toHaveLength(1);
  });

  test("an invalid point is rejected on its own; the rest still upload", async ({ page }) => {
    await readyToBackUp(page);
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);

    await page.evaluate(async () => {
      const bad = { ...app.history[0], id: crypto.randomUUID(), latitude: 95, syncState: "pending" }; // impossible latitude
      const good = { ...app.history[0], id: crypto.randomUUID(), timestamp: app.history[0].timestamp + 1, syncState: "pending" };
      app.history.push(good, bad);
      await storage.addMany([good, bad]);
      runSync();
    });
    await expect.poll(() => syncStates(page)).toEqual(expect.arrayContaining(["synced", "synced", "rejected"]));
    await expect(page.getByText("Rejected by server")).toHaveCount(1);
    expect(await serverRecords(page)).toHaveLength(2);
  });

  test("clearing local history keeps the backed-up copies and says so", async ({ page }) => {
    await readyToBackUp(page);
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear history" }).click();
    await expect(page.locator("#message")).toContainText("Backed-up copies in your account were kept");
    expect(await serverRecords(page)).toHaveLength(1);
  });
});
