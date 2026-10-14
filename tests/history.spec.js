// History and data quality: persistence, refresh, flags, gaps, clearing, storage failure, Phase 1 import.
const { test, expect, START, openApp, moveTo, entries, startButton, stopButton, savedRecords, settle } = require("./helpers");

test.describe("history", () => {
  test("history survives a refresh and an active trip resumes", async ({ page }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    const [before] = await savedRecords(page);

    await page.reload();
    await expect(page.locator("#tracking-state")).toHaveText("Tracking active");
    await expect(page.locator("#message")).toContainText("resumed");

    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(3); // restored point + immediate reading + scheduled reading
    const records = await savedRecords(page);
    expect(records.every((record) => record.sessionId === before.sessionId)).toBe(true);
  });

  test("history persists after closing the page, without restarting tracking", async ({ page, context }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await stopButton(page).click();

    const reopened = await context.newPage();
    await openApp(reopened);
    await expect(entries(reopened)).toHaveCount(1);
    await expect(reopened.locator("#tracking-state")).toHaveText("Not tracking");
  });

  test("poor accuracy is saved but flagged and explained", async ({ page, context }) => {
    await context.setGeolocation({ ...START, accuracy: 650 });
    await openApp(page);
    await startButton(page).click();

    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).first().getByText("Low accuracy")).toBeVisible();
    await expect(page.locator("#location-flag")).toContainText("Low accuracy (±650 m)");
    await expect(page.locator("#message")).toContainText("low accuracy");
    const [record] = await savedRecords(page);
    expect(record.flags).toEqual(["low-accuracy"]);
  });

  test("an unrealistic GPS jump is flagged", async ({ page, context }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    await context.setGeolocation({ latitude: 9.0765, longitude: 7.3986, accuracy: 15 }); // Abuja, 1 minute later
    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2);
    await expect(entries(page).first().getByText("GPS jump")).toBeVisible();
    await expect(page.locator("#message")).toContainText("jumped unrealistically far");
  });

  test("a long silence is shown as a gap, not as a straight route", async ({ page, context }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    await moveTo(context, 4);
    await page.clock.fastForward(4 * 60000); // only one reading fires: 4 minutes with no data
    await expect(entries(page)).toHaveCount(2);
    await expect(page.locator(".history-gap")).toContainText("Gap: no location recorded for 4 min");
    await expect(page.locator("#stat-distance")).toHaveText("0 m"); // distance across a gap is not counted
  });

  test("clearing history asks first and can be cancelled", async ({ page }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await stopButton(page).click();

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Clear history" }).click();
    await expect(entries(page)).toHaveCount(1);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear history" }).click();
    await expect(entries(page)).toHaveCount(0);
    await expect(page.locator(".history-empty")).toBeVisible();
    expect(await savedRecords(page)).toHaveLength(0);
  });

  test("when browser storage is unavailable, tracking still works and says so", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
    await openApp(page);
    await expect(page.locator("#storage-notice")).toContainText("cannot be saved");

    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator("#history-count")).toContainText("not stored");
  });

  test("Phase 1 history is imported once and the old copy removed", async ({ page }) => {
    const legacy = [
      { latitude: 6.4301, longitude: 3.4219, accuracy: 20, timestamp: Date.parse("2026-01-10T10:01:00Z") },
      { latitude: 6.4291, longitude: 3.4219, accuracy: 20, timestamp: Date.parse("2026-01-10T10:00:00Z") }
    ];
    await page.addInitScript((points) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("safe-location-history", JSON.stringify(points));
        sessionStorage.setItem("seeded", "1");
      }
    }, legacy);
    await openApp(page);

    await expect(entries(page)).toHaveCount(2);
    await expect(page.locator(".history-session")).toContainText("Imported from Phase 1");
    expect(await page.evaluate(() => localStorage.getItem("safe-location-history"))).toBeNull();

    await page.reload();
    await expect(entries(page)).toHaveCount(2); // not imported twice
  });

  test("large histories load in pages", async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      const records = [];
      const startTime = Date.now() - 300 * 60000;
      for (let i = 0; i < 300; i += 1) {
        records.push({
          id: `seed-${i}`, sessionId: "seed-trip", latitude: 6.42 + i * 0.0002, longitude: 3.42, accuracy: 12,
          timestamp: startTime + i * 60000, recordedAt: startTime + i * 60000, intervalMs: 60000, flags: [], syncState: "pending"
        });
      }
      await storage.addMany(records);
    });
    await page.reload();

    await expect(page.locator("#stat-total")).toHaveText("300");
    await expect(entries(page)).toHaveCount(50);
    await page.getByRole("button", { name: /Show older points \(250 more\)/ }).click();
    await expect(entries(page)).toHaveCount(100);
  });
});
