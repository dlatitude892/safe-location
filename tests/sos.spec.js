// Emergency contacts and SOS (Phase 5) in the browser.
// TEST MODE: notifications are SIMULATED (playwright.config.js forces NOTIFY_MODE=simulated); nothing is sent.
// Test phone numbers choose the simulated outcome: ending 0000 = provider rejects, ending 9999 = undeliverable.
const { test, expect, openApp, entries, startButton, BASE_URL, createVerifiedUser } = require("./helpers");

test.use({ appConfig: {} }); // accounts on

async function addContact(page, contact) {
  const response = await page.request.post("/api/v1/contacts", { headers: { origin: BASE_URL }, data: { notifySos: true, relationship: null, email: null, phone: null, ...contact } });
  expect(response.status()).toBe(201);
  return (await response.json()).contact;
}

async function events(page) {
  return (await (await page.request.get("/api/v1/sos")).json()).events;
}

async function sendSosNow(page) {
  await page.getByRole("button", { name: "Send SOS" }).click();
  await expect(page.getByText(/Sending SOS in/)).toBeVisible();
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page.locator("#sos-active")).toBeVisible();
}

async function readyForSos(page, contacts = [{ name: "Mum", phone: "+2348031234567" }]) {
  await createVerifiedUser(page, { name: "Ada" });
  for (const contact of contacts) await addContact(page, contact);
  await openApp(page);
  await expect(page.getByRole("button", { name: "Send SOS" })).toBeVisible();
}

test.describe("emergency contacts page", () => {
  test("is only for signed-in users", async ({ page }) => {
    await page.goto("/emergency");
    await expect(page).toHaveURL(/\/signin\?next=%2Femergency/);
  });

  test("add, edit, test and remove a trusted contact", async ({ page }) => {
    await createVerifiedUser(page, { name: "Ada" });
    await page.goto("/emergency");
    await expect(page.locator("#mode-banner")).toContainText("SIMULATED");
    await expect(page.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");

    await page.getByRole("button", { name: "Add contact" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Mum");
    await page.getByLabel("Mobile number for SMS").fill("0803 123 4567");
    await page.getByRole("button", { name: "Save contact" }).click();
    await expect(page.locator("#contact-list")).toContainText("SMS +2348031234567"); // local number converted

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Mother");
    await page.getByRole("button", { name: "Save contact" }).click();
    await expect(page.locator("#contact-list")).toContainText("Mother");

    await page.getByRole("button", { name: "Send test" }).click();
    await page.clock.fastForward(3500);
    await expect(page.locator("#contact-list")).toContainText("Delivery confirmed (simulated", { timeout: 10000 });

    await expect(page.locator("#preview")).toContainText("SOS from Ada");
    await expect(page.locator("#audit-list")).toContainText("Contact added");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("#contact-list")).toContainText("No trusted contacts yet");
  });

  test("an invalid phone number is explained, not saved", async ({ page }) => {
    await createVerifiedUser(page);
    await page.goto("/emergency");
    await page.getByRole("button", { name: "Add contact" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Typo");
    await page.getByLabel("Mobile number for SMS").fill("12345");
    await page.getByRole("button", { name: "Save contact" }).click();
    await expect(page.locator("#contact-error")).toContainText("doesn't look right");
  });
});

test.describe("SOS", () => {
  test("without trusted contacts the SOS button is not offered, but Call 112 is", async ({ page }) => {
    await createVerifiedUser(page);
    await openApp(page);
    await expect(page.locator("#sos-unavailable-text")).toContainText("Add at least one trusted contact");
    await expect(page.getByRole("button", { name: "Send SOS" })).toBeHidden();
    await expect(page.locator(".call-112")).toHaveAttribute("href", "tel:112");
  });

  test("the countdown can be cancelled and nothing is sent", async ({ page }) => {
    await readyForSos(page);
    await page.getByRole("button", { name: "Send SOS" }).click();
    await expect(page.getByText(/Sending SOS in/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator("#sos-message")).toHaveText("SOS not sent.");
    await page.clock.fastForward(10000);
    expect(await events(page)).toHaveLength(0);
  });

  test("an active SOS can be hidden to look at the map, keeps a button on the map, and opens again", async ({ page }) => {
    await readyForSos(page);
    await sendSosNow(page);

    await page.getByRole("button", { name: "Hide" }).click();
    await expect(page.locator("#sos-active")).toBeHidden();
    const show = page.getByRole("button", { name: "SOS active: show details" });
    await expect(show).toBeVisible();
    await expect(page.getByRole("button", { name: "Send SOS" })).toBeHidden(); // still active: no second SOS
    await expect(page.locator(".call-112")).toBeVisible();

    await show.click();
    await expect(page.getByRole("button", { name: "I'm safe: cancel SOS" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(show).toBeVisible();
    expect((await events(page))[0].status).toBe("active"); // hiding it never cancels it
  });

  test("without trusted contacts, the map's SOS button explains what's needed and keeps Call 112 in reach", async ({ page }) => {
    await createVerifiedUser(page, { name: "Ada" });
    await openApp(page);
    await page.getByRole("button", { name: "Emergency: SOS and Call 112" }).click();
    await expect(page.locator("#sos-unavailable-text")).toBeVisible();
    await expect(page.locator("#sos-unavailable-text")).toContainText("Add at least one trusted contact");
    await expect(page.locator(".call-112")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("#sos-unavailable-text")).toBeHidden();
  });

  test("successful alert: fresh location sent, simulated delivery confirmed, shown honestly", async ({ page }) => {
    await readyForSos(page);
    await sendSosNow(page);
    await expect(page.locator("#sos-active-location")).toContainText("Current location sent (±15 m)");
    await expect(page.locator("#sos-active-list")).toContainText("Mum (SMS):");

    await page.clock.fastForward(4500); // next status check
    await expect(page.locator("#sos-active-list")).toContainText("delivery confirmed (simulated)");
    await expect(page.locator("#sos-active-list")).not.toContainText("delivered (confirmed by provider)");

    const [event] = await events(page);
    expect(event.status).toBe("active");
    expect(event.location.source).toBe("fresh");
    expect(event.connection.online).toBe(true); // reported by the browser
    const outbox = await (await page.request.get("/dev/outbox?to=%2B2348031234567")).json();
    expect(outbox.messages.at(-1).subject).toContain("SIMULATED SMS - NOT SENT");
    expect(outbox.messages.at(-1).text).toContain("SOS from Ada");
  });

  test("failed alerts are shown as failed, never as delivered", async ({ page }) => {
    await readyForSos(page, [
      { name: "Rejected", phone: "+2348030000000" },
      { name: "Unreachable", phone: "+2348039999999" }
    ]);
    await sendSosNow(page);
    await page.clock.fastForward(4500);
    await expect(page.locator("#sos-active-list")).toContainText("Rejected (SMS): failed to send", { timeout: 10000 });
    await page.clock.fastForward(4500);
    await expect(page.locator("#sos-active-list")).toContainText("Unreachable (SMS): not delivered", { timeout: 10000 });
    await expect(page.locator("#sos-active-list")).not.toContainText("confirmed");
  });

  test("repeated activation while active does not alert anyone twice", async ({ page }) => {
    await readyForSos(page);
    await sendSosNow(page);
    await expect(page.getByRole("button", { name: "Send SOS" })).toBeHidden(); // the card now shows the active SOS

    const again = await page.request.post("/api/v1/sos", {
      headers: { origin: BASE_URL },
      data: { id: "second-press-0001", triggeredAt: Date.now(), location: null, connection: null, battery: null }
    });
    expect((await again.json()).alreadyActive).toBe(true);
    const list = await events(page);
    expect(list).toHaveLength(1);
    expect(list[0].notifications.filter((item) => item.kind === "alert")).toHaveLength(1);
  });

  test("cancelling tells already-alerted contacts that you're safe", async ({ page }) => {
    await readyForSos(page);
    await sendSosNow(page);
    await page.clock.fastForward(4500);
    await expect(page.locator("#sos-active-list")).toContainText("delivery confirmed (simulated)");

    await page.getByRole("button", { name: "I'm safe: cancel SOS" }).click();
    await page.getByLabel("It was a false alarm").check();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel SOS" }).click();
    await expect(page.locator("#sos-message")).toContainText("SOS cancelled");
    await expect(page.getByRole("button", { name: "Send SOS" })).toBeVisible();

    const [event] = await events(page);
    expect(event.status).toBe("cancelled");
    expect(event.cancelReason).toBe("false-alarm");
    expect(event.notifications.some((item) => item.kind === "cancellation")).toBe(true);
  });

  test("last known location is used, with its age, when a fresh fix fails", async ({ page, context }) => {
    await readyForSos(page);
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Stop tracking" }).click();

    await page.clock.fastForward(10 * 60000); // ten minutes later…
    await context.clearPermissions(); // …the GPS can no longer be read
    await sendSosNow(page);
    await expect(page.locator("#sos-active-location")).toContainText("Last known location sent: 10 min old, ±15 m");
    const [event] = await events(page);
    expect(event.location.source).toBe("last-known");
  });

  test.describe("with location permission denied", () => {
    test.use({ permissions: [] });

    test("no location at all is reported as unavailable, not guessed", async ({ page }) => {
      await readyForSos(page);
      await sendSosNow(page);
      await expect(page.locator("#sos-active-location")).toHaveText("No location was available to send.");
      const [event] = await events(page);
      expect(event.location.source).toBe("none");
      expect(event.location.latitude).toBeNull();
    });
  });

  test("an SOS made offline waits on the device and is sent when the connection returns", async ({ page, context }) => {
    await readyForSos(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Send SOS" }).click();
    await page.getByRole("button", { name: "Send now" }).click();
    await expect(page.locator("#sos-queued")).toBeVisible();
    await expect(page.locator("#sos-message")).toContainText("no connection");
    await expect(page.locator("#sos-message")).toContainText("call 112");

    await context.setOffline(false);
    await expect(page.locator("#sos-active")).toBeVisible({ timeout: 10000 });
    expect(await events(page)).toHaveLength(1);
  });
});
