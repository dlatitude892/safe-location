// Map behaviour, network loss and map loading errors.
const { test, expect, openApp, moveTo, entries, startButton } = require("./helpers");

test.describe("map", () => {
  test("draws a start marker, latest marker and one route line - not a dot per point", async ({ page, context }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    for (const step of [1, 2, 3]) {
      await moveTo(context, step);
      await page.clock.fastForward(60000);
      await expect(entries(page)).toHaveCount(step + 1);
    }

    await expect(page.locator(".marker-start")).toHaveCount(1);
    await expect(page.locator(".marker-latest")).toHaveCount(1);
    await expect(page.locator("path.leaflet-interactive, .leaflet-overlay-pane path")).not.toHaveCount(0);
    expect(await page.locator(".leaflet-marker-icon").count()).toBe(2); // no per-point markers
    await expect(page.getByRole("button", { name: "Recenter" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Fit route" })).toBeEnabled();
    await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  });

  test("dragging the map turns Follow off; the switch turns it back on", async ({ page }) => {
    await openApp(page);
    const follow = page.getByRole("switch", { name: "Follow" });
    await expect(follow).toBeChecked();

    const box = await page.locator("#map").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
    await page.mouse.up();

    await expect(follow).not.toBeChecked();
    await expect(page.locator("#message")).toContainText("Follow mode paused");
    await follow.check({ force: true });
    await expect(follow).toBeChecked();
  });

  test("map tiles failing shows an error, and tracking still works", async ({ page, context }) => {
    await context.unroute("https://tile.openstreetmap.org/**");
    await context.route("https://tile.openstreetmap.org/**", (route) => route.abort());
    await page.goto("/");

    await expect(page.locator("#map-overlay")).toBeVisible();
    await expect(page.locator("#map-overlay-text")).toContainText("could not be loaded");
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
  });
});

test.describe("network", () => {
  test("offline: header shows it and points are still saved; online again is announced", async ({ page, context }) => {
    await openApp(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);

    await context.setOffline(true);
    await expect(page.locator("#network-state")).toHaveText("Offline");
    await expect(page.locator("#message")).toContainText("You are offline");

    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2);

    await context.setOffline(false);
    await expect(page.locator("#network-state")).toHaveText("Online");
    await expect(page.locator("#message")).toContainText("Back online");
  });
});
