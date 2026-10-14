// Tracking: permission, the 60-second recording scheduler, interval changes, start/stop and duplicates.
const { test, expect, START, openApp, moveTo, entries, startButton, stopButton, savedRecords, settle } = require("./helpers");

test.describe("tracking", () => {
  test("first visit shows an empty, idle state", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("#tracking-state")).toHaveText("Not tracking");
    await expect(startButton(page)).toBeEnabled();
    await expect(page.locator("#stop-button")).toBeHidden();
    await expect(page.locator("#interval-select")).toHaveValue("60000");
    await expect(page.locator(".history-empty")).toBeVisible();
    await expect(page.locator("#stat-total")).toHaveText("0");
  });

  test("permission granted: the first point is saved straight away with all fields", async ({ page }) => {
    await openApp(page);
    await startButton(page).click();

    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator("#tracking-state")).toHaveText("Tracking active");
    await expect(startButton(page)).toBeHidden();
    await expect(stopButton(page)).toBeVisible();
    await expect(page.locator("#latitude")).toHaveText(START.latitude.toFixed(6));
    await expect(page.locator("#accuracy")).toHaveText("±15 m");

    const [record] = await savedRecords(page);
    expect(record).toMatchObject({
      latitude: START.latitude,
      longitude: START.longitude,
      accuracy: START.accuracy,
      intervalMs: 60000,
      flags: [],
      syncState: "pending"
    });
    expect(record.id).toBeTruthy();
    expect(record.sessionId).toBeTruthy();
    expect(Number.isFinite(record.timestamp)).toBe(true);
  });

  test.describe("permission denied", () => {
    test.use({ permissions: [] });

    test("shows how to fix it and does not track", async ({ page }) => {
      await openApp(page);
      await startButton(page).click();
      await expect(page.locator("#message")).toContainText("permission was denied");
      await expect(page.locator("#tracking-state")).toHaveText("Not tracking");
      await expect(startButton(page)).toBeEnabled();
      await expect(entries(page)).toHaveCount(0);
    });
  });

  test("live GPS updates never create extra records: one record per 60 seconds", async ({ page, context }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    // Several live movements inside one interval…
    for (const step of [1, 2, 3]) {
      await moveTo(context, step);
      await settle(page, 300);
    }
    await settle(page);
    await expect(entries(page)).toHaveCount(1); // …still only one saved point.

    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2);
    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(3);

    // The newest saved point is the latest live position.
    await expect(page.locator("#latitude")).toHaveText((START.latitude + 3 * 0.00025).toFixed(6));
    await expect(page.locator("#stat-trip-points")).toHaveText("3");
  });

  test("changing the interval reschedules safely and is remembered", async ({ page }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    await page.locator("#interval-select").selectOption("120000");
    await expect(page.locator("#stat-interval")).toHaveText("2 minutes");
    await expect(page.locator("#message")).toContainText("Interval changed to 2 minutes");

    await page.clock.fastForward(60000);
    await settle(page);
    await expect(entries(page)).toHaveCount(1); // not due yet

    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2); // due after 2 minutes

    const records = await savedRecords(page);
    expect(records[1].intervalMs).toBe(120000);

    await page.reload();
    await expect(page.locator("#interval-select")).toHaveValue("120000");
  });

  test("stop cleans up: no more readings, controls reset", async ({ page }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    await stopButton(page).click();
    await expect(page.locator("#tracking-state")).toHaveText("Not tracking");
    await expect(page.locator("#gps-signal-text")).toHaveText("Location: not tracking");
    await expect(page.locator("#stop-button")).toBeHidden();
    await expect(startButton(page)).toBeEnabled();

    await page.clock.fastForward(5 * 60000);
    await settle(page);
    await expect(entries(page)).toHaveCount(1);
  });

  test("double-clicking Start begins only one trip", async ({ page }) => {
    await openApp(page);
    await startButton(page).dblclick();
    await expect(entries(page)).toHaveCount(1);
    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2);
    await settle(page);

    const records = await savedRecords(page);
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.sessionId)).size).toBe(1);
  });

  test("a second tab cannot track at the same time", async ({ page, context }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    const secondTab = await context.newPage();
    await openApp(secondTab);
    await expect(entries(secondTab)).toHaveCount(1); // sees the same history
    await startButton(secondTab).click();
    await expect(secondTab.locator("#message")).toContainText("already running in another");
    await expect(secondTab.locator("#tracking-state")).toHaveText("Not tracking");
  });

  test("invalid coordinates are rejected and never saved", async ({ page, context }) => {
    await context.setGeolocation({ latitude: 0, longitude: 0, accuracy: 10 });
    await openApp(page);
    await startButton(page).click();
    await expect(page.locator("#message")).toContainText("invalid position");
    await settle(page);
    await expect(entries(page)).toHaveCount(0);
    await expect(page.locator("#tracking-state")).toHaveText("Tracking active"); // keeps trying
  });
});
