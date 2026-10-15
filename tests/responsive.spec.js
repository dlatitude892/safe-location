// Phone layout checks (runs in the "mobile" project, a Pixel 7-sized touch screen).
// Phase 8: a full-screen map, the status pill at the top, SOS and Call 112 floating over the map, and the
// main controls in a sheet that peeks up from the bottom and can be expanded.
const { test, expect, openApp, entries, startButton } = require("./helpers");

test("phone layout: full-screen map, status and SOS in reach, large tap targets, expandable sheet", async ({ page }) => {
  await openApp(page);
  const viewport = page.viewportSize();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The map fills the screen.
  const map = await page.locator("#map").boundingBox();
  expect(map.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(map.height).toBeGreaterThanOrEqual(viewport.height * 0.9);

  // The status sentence is at the top, and the Start button is on screen without scrolling.
  const pill = await page.locator("#instrument").boundingBox();
  expect(pill.y).toBeLessThan(80);
  const start = await startButton(page).boundingBox();
  expect(start.height).toBeGreaterThanOrEqual(44);
  expect(start.y + start.height).toBeLessThanOrEqual(viewport.height);

  // Call 112 floats above the sheet, never underneath it.
  const call = await page.locator(".call-112").boundingBox();
  const sheet = await page.locator("#sheet").boundingBox();
  expect(call.y + call.height).toBeLessThanOrEqual(sheet.y);

  // The sheet expands from its handle (and says so to screen readers).
  const grab = page.getByRole("button", { name: "Show more" });
  await expect(grab).toHaveAttribute("aria-expanded", "false");
  await grab.tap();
  await expect(page.locator("#sheet-grab")).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => (await page.locator("#sheet").boundingBox()).y).toBeLessThan(sheet.y - 50);

  // Tapping the status pill lowers it again.
  await page.getByRole("button", { name: "Show tracker details" }).tap();
  await expect(page.locator("#sheet-grab")).toHaveAttribute("aria-expanded", "false");

  await startButton(page).tap();
  await expect(entries(page)).toHaveCount(1);
});
