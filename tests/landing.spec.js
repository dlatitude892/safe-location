// The public landing page (/welcome): it loads on its own, leads to the tracker, says what the product
// never does, and keeps working when motion is turned off.
const { test, expect } = require("@playwright/test");

test("landing page explains the product and links to the tracker and sign-up", async ({ page }) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });

  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every journey");
  await expect(page.getByRole("link", { name: "Open the tracker" }).first()).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Create an account" }).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("heading", { name: "What Safe Location will never do" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");
  // The animated preview runs: its condition sentence changes on its own.
  await expect(page.locator(".mock-band-text")).not.toHaveText("Trip to Lekki: recording every 1 minute", { timeout: 8000 });
  expect(failures).toEqual([]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("everything is visible and nothing animates", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("html")).not.toHaveClass(/motion/);
    await page.getByRole("heading", { name: "What Safe Location will never do" }).scrollIntoViewIfNeeded();
    await expect(page.getByText("Track anyone without their consent.")).toBeVisible();
    const animating = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(animating).toBe(0);
  });
});

test("the tracker links to the landing page", async ({ page }) => {
  // Only the page itself is needed here, not the internet map tiles it starts loading.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/welcome");
});
