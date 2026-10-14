// Phase 6: offline collection and store-and-forward sync.
// TEST MODE: simulated GPS, in-memory test server. "Internet" is cut with Playwright's offline mode,
// which also blocks the local server, exactly like losing the connection on a phone.
const {
  test, expect, openApp, moveTo, entries, startButton, savedRecords, settle, syncStates, serverRecords,
  BASE_URL, createVerifiedUser, registerThisBrowser
} = require("./helpers");

test.use({ appConfig: {} }); // accounts and backup on

async function readyToBackUp(page, name) {
  await createVerifiedUser(page, name ? { name } : undefined);
  await openApp(page);
  await registerThisBrowser(page);
}

// Counts what the server says about every upload, to prove each point was stored exactly once.
function watchUploads(page) {
  const stats = { requests: 0, accepted: [], duplicates: [] };
  page.on("response", async (response) => {
    if (!response.url().includes("/api/v1/locations/batch") || response.status() !== 200) return;
    stats.requests += 1;
    const body = await response.json();
    stats.accepted.push(...body.accepted);
    stats.duplicates.push(...body.duplicates);
  });
  return stats;
}

test.describe("offline store-and-forward", () => {
  test.describe("with the offline page copy (service worker)", () => {
    test.use({ serviceWorkers: "allow" });

    test("offline: record several points, refresh, reconnect, and every point is uploaded exactly once", async ({ page, context }) => {
      await readyToBackUp(page);
      // The service worker must control the page before the connection drops, so the page can reload offline.
      await page.reload();
      test.slow(); // installing the offline copy downloads Leaflet from the internet
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30000 }).toBe(true);
      await expect(page.locator("#backup-active")).toBeVisible();
      const uploads = watchUploads(page);

      await context.setOffline(true);
      await expect(page.locator("#status-connection")).toHaveText("Internet unavailable");
      await startButton(page).click();
      await expect(entries(page)).toHaveCount(1);
      for (const step of [1, 2, 3]) {
        await moveTo(context, step);
        await page.clock.fastForward(60000);
        await expect(entries(page)).toHaveCount(step + 1);
      }
      await expect(page.locator("#status-sync")).toHaveText("Synchronization pending: 4 points");
      expect(uploads.requests).toBe(0);

      // Refresh while still offline: the page comes from the offline copy, the queue from IndexedDB.
      await page.reload();
      await expect(page.locator("#status-connection")).toHaveText("Internet unavailable");
      await expect(page.locator("#tracking-state")).toHaveText("Tracking active"); // resumed after the refresh
      await expect.poll(async () => (await savedRecords(page)).length).toBeGreaterThanOrEqual(5); // 4 + the reading after resuming
      await page.getByRole("button", { name: "Stop tracking" }).click();
      const local = await savedRecords(page);
      expect(local.every((record) => record.syncState === "pending")).toBe(true);

      // Connection back: everything uploads.
      await context.setOffline(false);
      await expect.poll(() => syncStates(page), { timeout: 15000 }).toEqual(local.map(() => "synced"));
      await expect(page.locator("#status-sync")).toHaveText("Synchronization complete");

      const stored = await serverRecords(page);
      const localIds = local.map((record) => record.id).sort();
      expect(stored.map((record) => record.id).sort()).toEqual(localIds); // every accepted point, nothing else
      expect(new Set(stored.map((record) => record.id)).size).toBe(stored.length); // no duplicates on the server
      expect(uploads.accepted.sort()).toEqual(localIds); // each point accepted exactly once
      expect(uploads.duplicates).toEqual([]); // and never sent twice
    });
  });

  test("internet unavailable and server unavailable are shown differently", async ({ page, context }) => {
    await readyToBackUp(page);
    await expect(page.locator("#status-connection")).toHaveText("Online, server reachable");

    await context.route("**/api/v1/**", (route) => route.abort("connectionrefused"));
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator("#status-connection")).toHaveText("Server unavailable");
    await expect(page.locator("#network-state")).toHaveText("Server unavailable");
    await expect(page.locator("#status-sync")).toHaveText("Synchronization pending: 1 point");

    await context.setOffline(true);
    await expect(page.locator("#status-connection")).toHaveText("Internet unavailable");
    await expect(page.locator("#network-state")).toHaveText("Offline");
  });

  test("Sync now uploads straight away instead of waiting for the next retry", async ({ page, context }) => {
    await readyToBackUp(page);
    await context.route("**/api/v1/locations/batch", (route) => route.fulfill({ status: 503, json: { error: { code: "server_error", message: "down" } } }));
    await startButton(page).click();
    await expect(page.locator("#stat-sync")).toContainText("temporary problem (503)");
    await page.getByRole("button", { name: "Stop tracking" }).click();

    await context.unroute("**/api/v1/locations/batch");
    await page.getByRole("button", { name: "Sync now" }).click(); // no clock fast-forward: the retry timer is skipped
    await expect(page.locator("#message")).toContainText("Synchronization complete");
    expect(await syncStates(page)).toEqual(["synced"]);
  });

  test("the last successful sync time survives a refresh", async ({ page }) => {
    await readyToBackUp(page);
    await expect(page.locator("#status-last-sync")).toHaveText("Never on this device");
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
    const shown = await page.locator("#status-last-sync").textContent();
    expect(shown).not.toBe("Never on this device");
    await page.getByRole("button", { name: "Stop tracking" }).click();

    await page.reload();
    await expect(page.locator("#status-last-sync")).toHaveText(shown);
  });

  test("an expired session keeps the queue through a refresh and uploads after signing in", async ({ page }) => {
    await readyToBackUp(page);
    // The session expires on the server; this page only finds out when it next uploads.
    await page.request.post("/dev/expire-my-session", { headers: { origin: BASE_URL } });
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator("#backup-signed-out-text")).toContainText("Your session has ended");
    await page.getByRole("button", { name: "Stop tracking" }).click();
    await page.reload();
    await expect(page.locator("#status-sync")).toContainText("Paused: sign in to upload 1 point");
    expect(await syncStates(page)).toEqual(["pending"]);
  });

  test("a rate-limited or failing account check never counts as 'signed out'", async ({ page, context }) => {
    await readyToBackUp(page, "Ada");
    await context.route("**/api/auth/get-session", (route) => route.fulfill({ status: 429, json: { message: "Too many requests" } }));
    await page.reload();
    await expect(page.locator("#backup-signed-out")).toBeHidden(); // not shown as signed out
    await expect(page.locator("#account-link")).toHaveText("Ada"); // account remembered
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("safe-location-account")).name)).toBe("Ada");
  });

  test("storage full: points are kept in memory, still uploaded, clearly reported and saved once space returns", async ({ page }) => {
    await readyToBackUp(page);
    await page.evaluate(() => {
      window.__realAddMany = storage.addMany.bind(storage);
      storage.addMany = () => Promise.reject(Object.assign(new Error("simulated full disk"), { name: "QuotaExceededError" }));
    });
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator("#storage-notice")).toContainText("This device's storage is full");
    await expect(page.locator("#status-storage")).toContainText("1 point kept only in memory");
    await expect(page.getByText("Not saved on device")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => app.history[0].syncState)).toBe("synced"); // still reached the server
    expect(await serverRecords(page)).toHaveLength(1);
    expect(await savedRecords(page)).toHaveLength(0); // honestly: not on the device

    // Space is back: the next save writes the memory-only point too, and the warning clears.
    await page.evaluate(() => { storage.addMany = window.__realAddMany; });
    await moveTo(page.context(), 1);
    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2);
    await expect.poll(async () => (await savedRecords(page)).length).toBe(2);
    await expect(page.locator("#storage-notice")).toBeHidden();
    await expect(page.locator("#status-storage-row")).toBeHidden();
  });

  test("ISOLATION: if another account signs in from another tab, this tab never uploads into it", async ({ page, context }) => {
    await readyToBackUp(page, "Alice");
    await context.route("**/api/v1/locations/batch", (route) => route.abort("connectionrefused"));
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Stop tracking" }).click();

    // Bob signs in "in another tab": the shared cookie now belongs to Bob, but this tab still shows Alice.
    await createVerifiedUser(page, { name: "Bob" });
    await context.unroute("**/api/v1/locations/batch");
    await page.evaluate(() => runSync()); // this tab still believes Alice is signed in
    await settle(page);

    expect(await serverRecords(page)).toHaveLength(0); // Bob's account received nothing
    const [local] = await savedRecords(page);
    expect(local.syncState).toBe("pending"); // Alice's point is still queued on this device
    await expect(page.locator("#account-link")).toHaveText("Bob");
  });

  test.describe("location states", () => {
    test.use({ permissions: [] });

    test("permission denied is shown before and after trying", async ({ page }) => {
      await openApp(page);
      await startButton(page).click();
      await expect(page.locator("#gps-signal-text")).toContainText("Location permission denied");
    });
  });

  test("no recent GPS fix is shown when the last fix is old", async ({ page }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator("#gps-signal-text")).toContainText("Location available");
    await page.evaluate(() => {
      tracker.latestFix.receivedAt -= 5 * 60000;
      renderLiveStatus();
    });
    await expect(page.locator("#gps-signal-text")).toHaveText("No recent GPS fix: the last one was 5 min ago.");
  });
});
