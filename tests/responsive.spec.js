// Phone layout checks (runs in the "mobile" project, a Pixel 7-sized touch screen).
const { test, expect, openApp, entries, startButton } = require("./helpers");

test("phone layout: no sideways scrolling, controls first, large tap targets", async ({ page }) => {
  await openApp(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The live status panel (with Start/Stop) and SOS come before the map.
  const controls = await page.locator(".instrument").boundingBox();
  const sos = await page.locator("#sos-card").boundingBox();
  const map = await page.locator(".map-card").boundingBox();
  expect(controls.y).toBeLessThan(map.y);
  expect(sos.y).toBeLessThan(map.y);

  const start = await startButton(page).boundingBox();
  expect(start.height).toBeGreaterThanOrEqual(44);

  await startButton(page).tap();
  await expect(entries(page)).toHaveCount(1);
});
