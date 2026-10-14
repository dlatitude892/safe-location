// Accounts and access control (Phase 4): registration, verification, sign-in/out, protected pages,
// device registration, isolation between accounts, expired sessions, recovery and deletion.
// TEST MODE: throwaway accounts on the in-memory test server; emails are read from /dev/outbox.
const {
  test, expect, openApp, entries, startButton, savedRecords, syncStates, serverRecords, settle,
  BASE_URL, TEST_PASSWORD, uniqueEmail, latestEmailLink, createVerifiedUser, signInWithForm, registerThisBrowser
} = require("./helpers");

test.use({ appConfig: {} }); // accounts and backup on

test.describe("accounts", () => {
  test("create an account, confirm the email, then sign out", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Ada Test");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`We sent a confirmation link to ${email}`)).toBeVisible();

    // Not confirmed yet: signing in is refused with a helpful message.
    await page.goto("/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#notice")).toContainText("Please confirm your email first");

    // Following the emailed link confirms the address and opens the dashboard.
    await page.goto(await latestEmailLink(page, email));
    await expect(page).toHaveURL(/\/account\?welcome=1/);
    await expect(page.locator("#notice")).toContainText("Email confirmed");
    await expect(page.locator("#profile-email")).toContainText(email);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/signin\?signedOut=1/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/signin\?next=%2Faccount/);
  });

  test("wrong password gets a generic message", async ({ page }) => {
    const user = await createVerifiedUser(page);
    await page.context().clearCookies();
    await page.goto("/signin");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("not the right password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#notice")).toHaveText("Email or password is incorrect.");
  });

  test("the account page and data API refuse visitors who are not signed in", async ({ page, request }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/signin\?next=%2Faccount/);
    for (const url of ["/api/v1/devices", "/api/v1/locations", "/api/v1/trips", "/api/v1/account/summary"]) {
      expect((await request.get(url)).status(), url).toBe(401);
    }
  });

  test("register this browser, record, and see the device and trip on the dashboard", async ({ page }) => {
    await createVerifiedUser(page);
    await openApp(page);
    await expect(page.locator("#account-link")).toHaveText("Test user");
    await registerThisBrowser(page, "Kitchen laptop");
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);

    await page.goto("/account");
    await expect(page.locator("#device-list")).toContainText("Kitchen laptop");
    await expect(page.locator("#device-list")).toContainText("This browser");
    await expect(page.locator("#trip-list")).toContainText("1 point");
    await expect(page.locator("#this-browser")).toContainText('registered as "Kitchen laptop"');
  });

  test("the session lives in an HttpOnly cookie; localStorage holds no secrets", async ({ page, context }) => {
    await createVerifiedUser(page);
    await openApp(page);
    await registerThisBrowser(page);

    const cookie = (await context.cookies()).find((item) => item.name === "safe-location.session_token");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");

    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    const secretPart = decodeURIComponent(cookie.value).split(".")[0];
    expect(stored).not.toContain(secretPart);
    expect(stored).not.toContain("sl_dev_"); // the Phase 3 device token is gone
  });

  test("points recorded while signed out are uploaded only when the person chooses", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("#backup-signed-out")).toBeVisible();
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Stop tracking" }).click();

    await createVerifiedUser(page);
    await openApp(page);
    await expect(page.locator("#claim-local-label")).toContainText("1 point already saved");
    await registerThisBrowser(page, "Phone"); // claim box left unticked
    await settle(page);
    expect(await serverRecords(page)).toHaveLength(0);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Back up 1 point recorded while signed out/ }).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
    expect(await serverRecords(page)).toHaveLength(1);
  });

  test("ISOLATION: a second account on the same browser never receives the first account's points", async ({ page, context }) => {
    await createVerifiedUser(page, { name: "Alice" });
    await openApp(page);
    await registerThisBrowser(page, "Shared laptop");
    await context.route("**/api/v1/locations/batch", (route) => route.abort("connectionrefused")); // keep Alice's point pending
    await startButton(page).click();
    await expect(entries(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Stop tracking" }).click();
    await context.unroute("**/api/v1/locations/batch");

    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/signedOut=1/);

    await createVerifiedUser(page, { name: "Bob" });
    await openApp(page);
    await expect(page.locator("#claim-row")).toBeHidden(); // Alice's point is not offered to Bob
    await registerThisBrowser(page, "Shared laptop (Bob)");
    await expect(page.locator("#others-note")).toContainText("1 point in this browser belongs to another account");
    await settle(page);
    expect(await serverRecords(page)).toHaveLength(0);
    const [local] = await savedRecords(page);
    expect(local.syncState).toBe("pending");
  });

  test("an expired session pauses backup, recording continues, and signing in resumes it", async ({ page }) => {
    const user = await createVerifiedUser(page);
    await openApp(page);
    await registerThisBrowser(page);
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);

    const expire = await page.request.post("/dev/expire-my-session", { headers: { origin: BASE_URL } });
    expect(expire.ok()).toBeTruthy();
    await page.clock.fastForward(60000);
    await expect(entries(page)).toHaveCount(2);
    await expect(page.locator("#backup-signed-out-text")).toContainText("Your session has ended");
    await expect(page.locator("#sync-state")).toHaveText("Signed out");
    expect(await syncStates(page)).toEqual(["synced", "pending"]);

    await page.getByRole("button", { name: "Stop tracking" }).click();
    await signInWithForm(page, user, "/");
    await expect.poll(() => syncStates(page)).toEqual(["synced", "synced"]);
  });

  test("password reset through the pages signs out every other session", async ({ page, browser }) => {
    const user = await createVerifiedUser(page);
    expect((await page.request.get("/api/v1/devices")).status()).toBe(200);

    const other = await browser.newContext();
    const helper = await other.newPage();
    await helper.goto("/forgot-password");
    await helper.getByLabel("Email").fill(user.email);
    await helper.getByRole("button", { name: "Send reset link" }).click();
    await expect(helper.locator("#notice")).toContainText("If that email has an account");

    await helper.goto(await latestEmailLink(helper, user.email));
    await expect(helper).toHaveURL(/\/reset-password\?token=/);
    const newPassword = "a brand new e2e passphrase";
    await helper.getByLabel("New password", { exact: true }).fill(newPassword);
    await helper.getByLabel("Type it again").fill(newPassword);
    await helper.getByRole("button", { name: "Save new password" }).click();
    await expect(helper).toHaveURL(/\/signin\?reset=1/);

    expect((await page.request.get("/api/v1/devices")).status()).toBe(401); // old session ended
    await signInWithForm(helper, { email: user.email, password: newPassword }, "/account");
    await expect(helper.locator("#profile-email")).toContainText(user.email);
    await other.close();
  });

  test("removing this browser's device from the dashboard asks the tracker to register again", async ({ page }) => {
    await createVerifiedUser(page);
    await openApp(page);
    await registerThisBrowser(page, "Old phone");
    await page.goto("/account");
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove device" }).click();
    await expect(page.locator("#notice")).toContainText('"Old phone" was removed');
    await expect(page.locator("#device-list")).toContainText("No devices yet");

    await openApp(page);
    await expect(page.locator("#backup-register")).toBeVisible();
  });

  test("deleting the account removes uploaded data and this browser's copy", async ({ page }) => {
    const user = await createVerifiedUser(page);
    await openApp(page);
    await registerThisBrowser(page);
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
    await page.getByRole("button", { name: "Stop tracking" }).click();

    await page.goto("/account");
    await page.getByLabel("Your password").fill("wrong password here");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.locator("#notice")).toContainText("Nothing was deleted");

    await page.getByLabel("Your password").fill(user.password);
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/signin\?deleted=1/);
    await expect(page.locator("#notice")).toContainText("were deleted");

    await openApp(page);
    await expect(entries(page)).toHaveCount(0); // this browser's copy removed too
    const signIn = await page.request.post("/api/auth/sign-in/email", { headers: { origin: BASE_URL }, data: { email: user.email, password: user.password } });
    expect(signIn.status()).toBe(401);
  });

  test("ISOLATION: another user's device ID grants nothing through the API", async ({ page, browser }) => {
    await createVerifiedUser(page, { name: "Alice" });
    await openApp(page);
    await registerThisBrowser(page, "Alice phone");
    await startButton(page).click();
    await expect.poll(() => syncStates(page)).toEqual(["synced"]);
    const aliceDeviceId = await page.evaluate(() => account.device.id);

    const bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await createVerifiedUser(bob, { name: "Bob" });
    const headers = { origin: BASE_URL };
    const steal = await bob.request.post("/api/v1/locations/batch", {
      headers,
      data: {
        deviceId: aliceDeviceId,
        accountId: (await (await bob.request.get("/api/auth/get-session")).json()).user.id,
        records: [{ id: "bob-record-0001", sessionId: "bob-trip-0001", latitude: 6.5, longitude: 3.4, accuracy: 10, deviceTimestamp: Date.now() }]
      }
    });
    expect(steal.status()).toBe(404);
    expect((await bob.request.get(`/api/v1/locations?deviceId=${aliceDeviceId}`)).ok()).toBeTruthy();
    expect((await (await bob.request.get(`/api/v1/locations?deviceId=${aliceDeviceId}`)).json()).records).toEqual([]);
    expect((await bob.request.delete(`/api/v1/devices/${aliceDeviceId}?deleteLocations=true`, { headers })).status()).toBe(404);
    expect(await serverRecords(page)).toHaveLength(1); // Alice's data untouched
    await bobContext.close();
  });
});
