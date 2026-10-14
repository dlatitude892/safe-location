// API tests using Node's built-in test runner and Fastify's in-memory requests (no network, no browser).
// Each test gets its own server with in-memory databases. Run with: npm run test:server
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { createServices } from "../services.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";
const TEST_ENV = {
  BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789",
  DATABASE_PATH: ":memory:",
  AUTH_DATABASE_PATH: ":memory:",
  MAIL_OUTBOX_DIR: "",
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",
  LOG_LEVEL: "silent"
};
const quiet = { info: () => {}, warn: () => {} };

async function makeServer(envOverrides = {}) {
  const config = loadConfig({ ...TEST_ENV, ...envOverrides });
  return createServices({ config, log: quiet, logger: false });
}

const sessionCookie = (response) => {
  const cookies = [].concat(response.headers["set-cookie"] || []);
  const session = cookies.find((cookie) => cookie.startsWith("safe-location.session_token="));
  return session ? session.split(";")[0] : null;
};

function call(server, method, url, { cookie, payload, origin = ORIGIN } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  return server.app.inject({ method, url, headers, payload });
}

function latestLink(server, email) {
  const message = server.mailer.list(email).at(-1);
  assert.ok(message, `no email for ${email}`);
  const url = new URL(message.text.match(/https?:\/\/\S+/)[0]);
  return url.pathname + url.search;
}

// Registers, verifies by following the emailed link (which signs in), and returns the session cookie.
async function newUser(server, email = `user-${crypto.randomUUID().slice(0, 8)}@example.test`) {
  const signUp = await call(server, "POST", "/api/auth/sign-up/email", { payload: { name: "Test", email, password: PASSWORD } });
  assert.equal(signUp.statusCode, 200);
  const verify = await call(server, "GET", latestLink(server, email), { origin: null });
  assert.equal(verify.statusCode, 302);
  const cookie = sessionCookie(verify);
  assert.ok(cookie, "verification should sign the user in");
  return { email, cookie };
}

async function newDevice(server, cookie, name = "Test phone") {
  const response = await call(server, "POST", "/api/v1/devices", { cookie, payload: { name } });
  assert.equal(response.statusCode, 201);
  return response.json().device;
}

function record(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    sessionId: "trip-0001-abcd",
    latitude: 6.4281,
    longitude: 3.4219,
    accuracy: 15,
    deviceTimestamp: Date.now() - 60000,
    deviceRecordedAt: Date.now() - 59000,
    intervalMs: 60000,
    flags: [],
    ...overrides
  };
}

const userIds = new Map(); // cookie -> user ID, so uploads can say which account the points belong to
async function upload(server, cookie, deviceId, records, accountId) {
  if (!accountId) {
    if (!userIds.has(cookie)) userIds.set(cookie, (await call(server, "GET", "/api/auth/get-session", { cookie })).json().user.id);
    accountId = userIds.get(cookie);
  }
  return call(server, "POST", "/api/v1/locations/batch", { cookie, payload: { deviceId, accountId, records } });
}
const listLocations = async (server, cookie, query = "") => (await call(server, "GET", `/api/v1/locations${query}`, { cookie })).json();

/* ---------- configuration and basics ---------- */

test("configuration refuses unsafe or missing settings", () => {
  assert.throws(() => loadConfig({ ...TEST_ENV, BETTER_AUTH_SECRET: "short" }), /BETTER_AUTH_SECRET/);
  assert.throws(() => loadConfig({ ...TEST_ENV, HOST: "0.0.0.0" }), /HOST/);
  assert.throws(() => loadConfig({ ...TEST_ENV, PUBLIC_URL: "https://example.com" }), /PUBLIC_URL/);
  assert.doesNotThrow(() => loadConfig(TEST_ENV));
});

test("health check works without signing in", async () => {
  const server = await makeServer();
  const response = await call(server, "GET", "/api/v1/health");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "ok");
  await server.close();
});

test("every data endpoint refuses requests without a session", async () => {
  const server = await makeServer();
  const requests = [
    ["GET", "/api/v1/devices"],
    ["POST", "/api/v1/devices", { name: "x" }],
    ["PATCH", "/api/v1/devices/abcdefgh-1234", { name: "x" }],
    ["DELETE", "/api/v1/devices/abcdefgh-1234"],
    ["POST", "/api/v1/locations/batch", { deviceId: "abcdefgh-1234", records: [record()] }],
    ["GET", "/api/v1/locations"],
    ["GET", "/api/v1/recordings"],
    ["DELETE", "/api/v1/recordings/trip-0001-abcd"],
    ["GET", "/api/v1/trips"],
    ["POST", "/api/v1/trips", {}],
    ["GET", "/api/v1/account/summary"]
  ];
  for (const [method, url, payload] of requests) {
    const response = await call(server, method, url, { payload });
    assert.equal(response.statusCode, 401, `${method} ${url}`);
  }
  const forged = await call(server, "GET", "/api/v1/devices", { cookie: "safe-location.session_token=forged.value" });
  assert.equal(forged.statusCode, 401);
  await server.close();
});

/* ---------- registration, verification, sign-in ---------- */

test("sign-up requires email verification and never stores the plain password", async () => {
  const server = await makeServer();
  const email = "verify-me@example.test";
  await call(server, "POST", "/api/auth/sign-up/email", { payload: { name: "V", email, password: PASSWORD } });

  const early = await call(server, "POST", "/api/auth/sign-in/email", { payload: { email, password: PASSWORD } });
  assert.equal(early.statusCode, 403);
  assert.equal(early.json().code, "EMAIL_NOT_VERIFIED");

  const stored = server.authService.database.prepare("SELECT password FROM account").get().password;
  assert.notEqual(stored, PASSWORD);
  assert.ok(!stored.includes(PASSWORD));
  assert.ok(stored.length > 60, "password should be a salted hash");

  const shortPassword = await call(server, "POST", "/api/auth/sign-up/email", { payload: { name: "S", email: "s@example.test", password: "short" } });
  assert.equal(shortPassword.statusCode, 400);
  await server.close();
});

test("sign-in errors do not reveal whether an email has an account", async () => {
  const server = await makeServer();
  const { email } = await newUser(server);
  const wrongPassword = await call(server, "POST", "/api/auth/sign-in/email", { payload: { email, password: "wrong password 123" } });
  const unknownEmail = await call(server, "POST", "/api/auth/sign-in/email", { payload: { email: "nobody@example.test", password: "wrong password 123" } });
  assert.equal(wrongPassword.statusCode, 401);
  assert.equal(unknownEmail.statusCode, 401);
  assert.equal(wrongPassword.json().message, unknownEmail.json().message);
  await server.close();
});

test("sign-in and sign-out", async () => {
  const server = await makeServer();
  const { email } = await newUser(server);
  const signIn = await call(server, "POST", "/api/auth/sign-in/email", { payload: { email, password: PASSWORD } });
  assert.equal(signIn.statusCode, 200);
  const cookie = sessionCookie(signIn);
  const cookieHeader = [].concat(signIn.headers["set-cookie"]).find((value) => value.startsWith("safe-location.session_token="));
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Lax/i);

  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie })).statusCode, 200);
  assert.equal((await call(server, "POST", "/api/auth/sign-out", { cookie, payload: {} })).statusCode, 200);
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie })).statusCode, 401);
  await server.close();
});

test("expired sessions are refused", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie })).statusCode, 200);
  const { id } = server.authService.database.prepare("SELECT id FROM session").get();
  server.authService.expireSession(id);
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie })).statusCode, 401);
  await server.close();
});

test("changes from another website are refused (CSRF protection)", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const foreign = await call(server, "POST", "/api/v1/devices", { cookie, payload: { name: "x" }, origin: "https://evil.example" });
  assert.equal(foreign.statusCode, 403);
  const noOrigin = await call(server, "POST", "/api/v1/devices", { cookie, payload: { name: "x" }, origin: null });
  assert.equal(noOrigin.statusCode, 403);
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie })).json().devices.length, 0);
  await server.close();
});

/* ---------- account recovery ---------- */

test("password reset: same answer for unknown emails, signs out old sessions, token works once", async () => {
  const server = await makeServer();
  const { email, cookie } = await newUser(server);

  const unknown = await call(server, "POST", "/api/auth/request-password-reset", { payload: { email: "nobody@example.test", redirectTo: "/reset-password" } });
  const known = await call(server, "POST", "/api/auth/request-password-reset", { payload: { email, redirectTo: "/reset-password" } });
  assert.equal(unknown.statusCode, 200);
  assert.deepEqual(unknown.json(), known.json());

  const linkResponse = await call(server, "GET", latestLink(server, email), { origin: null });
  assert.equal(linkResponse.statusCode, 302);
  const token = new URL(linkResponse.headers.location, ORIGIN).searchParams.get("token");
  assert.ok(token);

  const newPassword = "a completely new passphrase";
  assert.equal((await call(server, "POST", "/api/auth/reset-password", { payload: { token, newPassword } })).statusCode, 200);
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie })).statusCode, 401, "old session signed out");
  assert.equal((await call(server, "POST", "/api/auth/reset-password", { payload: { token, newPassword: "yet another passphrase" } })).statusCode, 400, "token single use");

  const oldLogin = await call(server, "POST", "/api/auth/sign-in/email", { payload: { email, password: PASSWORD } });
  const newLogin = await call(server, "POST", "/api/auth/sign-in/email", { payload: { email, password: newPassword } });
  assert.equal(oldLogin.statusCode, 401);
  assert.equal(newLogin.statusCode, 200);
  await server.close();
});

/* ---------- devices ---------- */

test("devices: register, list, rename, validate names, remove", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie, "  My   phone ");
  assert.equal(device.name, "My phone");

  const renamed = await call(server, "PATCH", `/api/v1/devices/${device.id}`, { cookie, payload: { name: "Work phone" } });
  assert.equal(renamed.statusCode, 200);
  const bad = await call(server, "PATCH", `/api/v1/devices/${device.id}`, { cookie, payload: { name: "bad\u0007name" } });
  assert.equal(bad.statusCode, 400);
  const long = await call(server, "POST", "/api/v1/devices", { cookie, payload: { name: "x".repeat(61) } });
  assert.equal(long.statusCode, 400);

  const listed = (await call(server, "GET", "/api/v1/devices", { cookie })).json().devices;
  assert.deepEqual(listed.map((item) => item.name), ["Work phone"]);

  assert.equal((await call(server, "DELETE", `/api/v1/devices/${device.id}`, { cookie })).statusCode, 200);
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie })).json().devices.length, 0);
  assert.equal((await upload(server, cookie, device.id, [record()])).statusCode, 404, "removed device cannot upload");
  await server.close();
});

test("removing a device can keep or delete what it uploaded", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const keep = await newDevice(server, cookie, "Keep");
  const wipe = await newDevice(server, cookie, "Wipe");
  await upload(server, cookie, keep.id, [record({ sessionId: "trip-keep-0001" })]);
  await upload(server, cookie, wipe.id, [record({ sessionId: "trip-wipe-0001" }), record({ sessionId: "trip-wipe-0001" })]);

  await call(server, "DELETE", `/api/v1/devices/${keep.id}?deleteLocations=false`, { cookie });
  const wiped = (await call(server, "DELETE", `/api/v1/devices/${wipe.id}?deleteLocations=true`, { cookie })).json();
  assert.equal(wiped.deletedLocations, 2);
  const remaining = (await listLocations(server, cookie)).records;
  assert.deepEqual(remaining.map((item) => item.sessionId), ["trip-keep-0001"]);
  await server.close();
});

/* ---------- uploads and history ---------- */

test("uploads are stored with both timestamps, and re-sending creates no duplicates", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie);
  const batch = [record(), record()];
  const before = Date.now();
  assert.equal((await upload(server, cookie, device.id, batch)).json().accepted.length, 2);
  const again = (await upload(server, cookie, device.id, batch)).json();
  assert.deepEqual(again.accepted, []);
  assert.equal(again.duplicates.length, 2);

  const stored = (await listLocations(server, cookie)).records;
  assert.equal(stored.length, 2);
  assert.equal(stored[0].deviceId, device.id);
  assert.ok(stored[0].serverReceivedAt >= before);
  assert.equal(stored[0].deviceTimestamp, batch.find((item) => item.id === stored[0].id).deviceTimestamp);
  await server.close();
});

test("ISOLATION: one user cannot read, use, rename, remove or delete another user's data", async () => {
  const server = await makeServer();
  const alice = await newUser(server);
  const bob = await newUser(server);
  const aliceDevice = await newDevice(server, alice.cookie, "Alice phone");
  const secret = record({ sessionId: "alice-trip-0001" });
  await upload(server, alice.cookie, aliceDevice.id, [secret]);

  // Bob sees nothing of Alice's.
  assert.deepEqual((await call(server, "GET", "/api/v1/devices", { cookie: bob.cookie })).json().devices, []);
  assert.deepEqual((await listLocations(server, bob.cookie)).records, []);
  assert.deepEqual((await listLocations(server, bob.cookie, `?deviceId=${aliceDevice.id}`)).records, []);
  assert.deepEqual((await listLocations(server, bob.cookie, "?sessionId=alice-trip-0001")).records, []);
  assert.deepEqual((await call(server, "GET", "/api/v1/recordings", { cookie: bob.cookie })).json().recordings, []);
  assert.deepEqual((await call(server, "GET", "/api/v1/account/summary", { cookie: bob.cookie })).json(), { devices: 0, locations: 0 });

  // Putting Alice's device ID in Bob's requests grants nothing.
  assert.equal((await upload(server, bob.cookie, aliceDevice.id, [record()])).statusCode, 404);
  assert.equal((await call(server, "PATCH", `/api/v1/devices/${aliceDevice.id}`, { cookie: bob.cookie, payload: { name: "Mine now" } })).statusCode, 404);
  assert.equal((await call(server, "DELETE", `/api/v1/devices/${aliceDevice.id}?deleteLocations=true`, { cookie: bob.cookie })).statusCode, 404);
  assert.equal((await call(server, "DELETE", "/api/v1/recordings/alice-trip-0001", { cookie: bob.cookie })).statusCode, 404);

  // Re-using Alice's record ID from Bob's own device is rejected and changes nothing.
  const bobDevice = await newDevice(server, bob.cookie);
  const hijack = (await upload(server, bob.cookie, bobDevice.id, [record({ id: secret.id, latitude: 9 })])).json();
  assert.deepEqual(hijack.accepted, []);
  assert.deepEqual(hijack.duplicates, []);
  assert.equal(hijack.rejected[0].id, secret.id);

  // Alice's data is untouched.
  const aliceView = (await listLocations(server, alice.cookie)).records;
  assert.equal(aliceView.length, 1);
  assert.equal(aliceView[0].latitude, secret.latitude);
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie: alice.cookie })).json().devices[0].name, "Alice phone");
  await server.close();
});

test("ISOLATION: points stamped with another account are refused, even with a valid session and device", async () => {
  const server = await makeServer();
  const alice = await newUser(server);
  const bob = await newUser(server);
  const aliceId = (await call(server, "GET", "/api/auth/get-session", { cookie: alice.cookie })).json().user.id;
  const bobDevice = await newDevice(server, bob.cookie);
  // Bob's cookie, Bob's device, but the browser says the points were recorded for Alice.
  const mixed = await upload(server, bob.cookie, bobDevice.id, [record()], aliceId);
  assert.equal(mixed.statusCode, 409);
  assert.equal(mixed.json().error.code, "account_mismatch");
  assert.deepEqual((await listLocations(server, bob.cookie)).records, []);
  await server.close();
});

test("recordings are listed per user and can be deleted", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie);
  await upload(server, cookie, device.id, [record({ sessionId: "trip-one-0001" }), record({ sessionId: "trip-one-0001" }), record({ sessionId: "trip-two-0002" })]);
  const trips = (await call(server, "GET", "/api/v1/recordings", { cookie })).json().recordings;
  assert.equal(trips.length, 2);
  assert.equal(trips.find((trip) => trip.sessionId === "trip-one-0001").points, 2);

  const removed = await call(server, "DELETE", "/api/v1/recordings/trip-one-0001", { cookie });
  assert.equal(removed.json().deletedLocations, 2);
  assert.deepEqual((await call(server, "GET", "/api/v1/recordings", { cookie })).json().recordings.map((trip) => trip.sessionId), ["trip-two-0002"]);
  await server.close();
});

/* ---------- account deletion ---------- */

test("account deletion needs the password and removes the account, devices and locations", async () => {
  const server = await makeServer();
  const alice = await newUser(server);
  const bob = await newUser(server);
  const aliceDevice = await newDevice(server, alice.cookie);
  const bobDevice = await newDevice(server, bob.cookie);
  await upload(server, alice.cookie, aliceDevice.id, [record(), record()]);
  await upload(server, bob.cookie, bobDevice.id, [record()]);

  const wrong = await call(server, "POST", "/api/auth/delete-user", { cookie: alice.cookie, payload: { password: "not the password" } });
  assert.notEqual(wrong.statusCode, 200);
  const aliceId = await whoAmI(server, alice.cookie);
  assert.deepEqual(server.db.countForOwner(aliceId), { devices: 1, locations: 2 }, "nothing deleted with a wrong password");

  const deleted = await call(server, "POST", "/api/auth/delete-user", { cookie: alice.cookie, payload: { password: PASSWORD } });
  assert.equal(deleted.statusCode, 200);

  assert.deepEqual(server.db.countForOwner(aliceId), { devices: 0, locations: 0 });
  assert.equal((await call(server, "GET", "/api/v1/devices", { cookie: alice.cookie })).statusCode, 401);
  const signIn = await call(server, "POST", "/api/auth/sign-in/email", { payload: { email: alice.email, password: PASSWORD } });
  assert.equal(signIn.statusCode, 401);
  assert.equal((await listLocations(server, bob.cookie)).records.length, 1, "other users are unaffected");
  await server.close();
});

async function whoAmI(server, cookie) {
  const response = await call(server, "GET", "/api/auth/get-session", { cookie });
  return response.json().user.id;
}

/* ---------- validation and errors ---------- */

test("invalid records are rejected one by one; valid ones in the same batch are kept", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie);
  const good = record();
  const bad = [
    record({ latitude: 95 }), record({ longitude: "3.42" }), record({ latitude: 0, longitude: 0 }), record({ accuracy: -1 }),
    record({ id: "x" }), record({ deviceTimestamp: "yesterday" }), record({ intervalMs: 1000 }), record({ flags: ["made-up"] }),
    { ...record(), extra: "field" }
  ];
  const result = (await upload(server, cookie, device.id, [good, ...bad])).json();
  assert.deepEqual(result.accepted, [good.id]);
  assert.equal(result.rejected.length, bad.length);
  await server.close();
});

test("untrusted device timestamps are kept but marked suspect", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie);
  await upload(server, cookie, device.id, [record({ deviceTimestamp: Date.now() + 86400000 }), record({ deviceTimestamp: Date.UTC(2001, 0, 1) })]);
  assert.ok((await listLocations(server, cookie)).records.every((item) => item.deviceTimeSuspect));
  await server.close();
});

test("malformed requests get clear 4xx errors", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie);
  assert.equal((await upload(server, cookie, device.id, Array.from({ length: 101 }, () => record()))).statusCode, 400);
  assert.equal((await upload(server, cookie, device.id, [])).statusCode, 400);
  assert.equal((await upload(server, cookie, "bad id!", [record()])).statusCode, 400);
  const accountId = (await call(server, "GET", "/api/auth/get-session", { cookie })).json().user.id;
  const extra = await call(server, "POST", "/api/v1/locations/batch", { cookie, payload: { deviceId: device.id, accountId, records: [record()], admin: true } });
  assert.equal(extra.statusCode, 400);
  const plain = await server.app.inject({ method: "POST", url: "/api/v1/locations/batch", headers: { cookie, origin: ORIGIN, "content-type": "text/plain" }, payload: "hello" });
  assert.equal(plain.statusCode, 415);
  const huge = await server.app.inject({ method: "POST", url: "/api/v1/locations/batch", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, payload: JSON.stringify({ deviceId: device.id, records: [{ id: "a".repeat(300 * 1024) }] }) });
  assert.equal(huge.statusCode, 413);
  assert.equal((await call(server, "GET", "/api/v1/locations?cursor=@@@", { cookie })).statusCode, 400);
  assert.equal((await call(server, "GET", "/api/v1/secrets")).statusCode, 404);
  await server.close();
});

test("database failures return a generic 500 without internal details", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie);
  server.db.insertLocations = () => { throw new Error("SQLITE_IOERR: secret internal path C:/data"); };
  const response = await upload(server, cookie, device.id, [record()]);
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, "server_error");
  assert.ok(!response.body.includes("SQLITE"));
  await server.close();
});

test("history is returned in pages with a cursor", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const device = await newDevice(server, cookie);
  await upload(server, cookie, device.id, Array.from({ length: 5 }, () => record()));
  const first = await listLocations(server, cookie, "?limit=2");
  const second = await listLocations(server, cookie, `?limit=2&cursor=${first.nextCursor}`);
  const third = await listLocations(server, cookie, `?limit=2&cursor=${second.nextCursor}`);
  assert.equal(third.records.length, 1);
  assert.equal(third.nextCursor, null);
  assert.equal(new Set([...first.records, ...second.records, ...third.records].map((item) => item.id)).size, 5);
  await server.close();
});

/* ---------- pages, files, limits ---------- */

test("the account page needs a session; only whitelisted files are served", async () => {
  const server = await makeServer();
  const signedOut = await call(server, "GET", "/account");
  assert.equal(signedOut.statusCode, 302);
  assert.equal(signedOut.headers.location, "/signin?next=%2Faccount");
  const { cookie } = await newUser(server);
  assert.equal((await call(server, "GET", "/account", { cookie })).statusCode, 200);

  for (const url of ["/", "/signin", "/signup", "/forgot-password", "/reset-password", "/app.js", "/account.js", "/auth-pages.js"]) {
    assert.equal((await call(server, "GET", url)).statusCode, 200, url);
  }
  for (const url of ["/.env", "/server/config.js", "/data/auth.sqlite", "/package.json", "/dev/outbox", "/../.env"]) {
    assert.equal((await call(server, "GET", url)).statusCode, 404, url);
  }
  await server.close();
});

test("rate limits: repeated sign-in attempts and API floods get 429", async () => {
  const server = await makeServer({ AUTH_RATE_LIMIT_PER_MINUTE: "3", API_RATE_LIMIT_PER_MINUTE: "50" });
  const statuses = [];
  for (let i = 0; i < 5; i += 1) {
    statuses.push((await call(server, "POST", "/api/auth/sign-in/email", { payload: { email: "x@example.test", password: "wrong password 123" } })).statusCode);
  }
  assert.ok(statuses.includes(429), `sign-in statuses: ${statuses}`);
  let limited;
  for (let i = 0; i < 60 && !limited; i += 1) {
    const response = await call(server, "GET", "/api/v1/health");
    if (response.statusCode === 429) limited = response;
  }
  assert.ok(limited && Number(limited.headers["retry-after"]) > 0);
  await server.close();
});
