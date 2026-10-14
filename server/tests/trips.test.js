// Trip Mode tests (Phase 7). A "minute" in trip settings lasts 100 ms here (TRIP_TEST_MINUTE_MS),
// and the watchdog is run by hand with watchdog.tick(), so nothing depends on real 15-minute waits.
// Notifications use the SIMULATED provider. Run with: npm run test:server
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../config.js";
import { createServices } from "../services.js";
import { openDatabase } from "../db.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";
const MINUTE = 100;
const TEST_ENV = {
  BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789",
  DATABASE_PATH: ":memory:",
  AUTH_DATABASE_PATH: ":memory:",
  MAIL_OUTBOX_DIR: "",
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",
  DEV_TEST_ENDPOINTS: "true",
  TRIP_TEST_MINUTE_MS: String(MINUTE),
  SIMULATED_DELIVERY_DELAY_MS: "20",
  NOTIFY_POLL_INTERVAL_MS: "20",
  NOTIFY_RETRY_BASE_MS: "20",
  LOG_LEVEL: "silent"
};
const quiet = { info: () => {}, warn: () => {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeServer(envOverrides = {}) {
  const server = await createServices({ config: loadConfig({ ...TEST_ENV, ...envOverrides }), log: quiet, logger: false });
  server.watchdog.stop(); // the tests run it by hand
  return server;
}

function call(server, method, url, { cookie, payload, origin = ORIGIN } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  return server.app.inject({ method, url, headers, payload });
}

async function newUser(server, name = "Ada") {
  const email = `user-${crypto.randomUUID().slice(0, 8)}@example.test`;
  await call(server, "POST", "/api/auth/sign-up/email", { payload: { name, email, password: PASSWORD } });
  const url = new URL(server.mailer.list(email).at(-1).text.match(/https?:\/\/\S+/)[0]);
  const verify = await call(server, "GET", url.pathname + url.search, { origin: null });
  const cookie = [].concat(verify.headers["set-cookie"]).find((value) => value.startsWith("safe-location.session_token=")).split(";")[0];
  const id = (await call(server, "GET", "/api/auth/get-session", { cookie })).json().user.id;
  return { email, cookie, id };
}

async function contact(server, cookie, fields) {
  const response = await call(server, "POST", "/api/v1/contacts", { cookie, payload: { notifySos: true, ...fields } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().contact;
}

function startTrip(server, cookie, overrides = {}) {
  return call(server, "POST", "/api/v1/trips", {
    cookie,
    payload: {
      id: crypto.randomUUID(),
      origin: "Yaba",
      destination: "Lekki Phase 1",
      expectedArrivalInMinutes: null,
      intervalMs: 60000,
      contactIds: [],
      escalation: "checkin-then-notify",
      silenceMinutes: 10,
      graceMinutes: 5,
      notifyStartEnd: false,
      ...overrides
    }
  });
}

const getTrip = async (server, cookie, id) => (await call(server, "GET", `/api/v1/trips/${id}`, { cookie })).json().trip;
const action = (server, cookie, id, name, payload) => call(server, "POST", `/api/v1/trips/${id}/${name}`, { cookie, payload });

async function waitFor(check, timeout = 3000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error("Timed out");
    await sleep(20);
  }
}

/* ---------- starting ---------- */

test("start a trip: validation, chosen contacts only, idempotent, one open trip at a time", async () => {
  const server = await makeServer();
  const ada = await newUser(server);
  const mum = await contact(server, ada.cookie, { name: "Mum", phone: "+2348031234567" });
  await contact(server, ada.cookie, { name: "Not chosen", phone: "+2348031234568" });

  for (const bad of [{ intervalMs: 1000 }, { silenceMinutes: 7 }, { origin: "" }, { contactIds: ["missing-contact-1"] }, { extra: true }]) {
    assert.equal((await startTrip(server, ada.cookie, bad)).statusCode, 400, JSON.stringify(bad));
  }

  const id = crypto.randomUUID();
  const first = await startTrip(server, ada.cookie, { id, contactIds: [mum.id], notifyStartEnd: true, expectedArrivalInMinutes: 30 });
  assert.equal(first.statusCode, 201);
  const trip = first.json().trip;
  assert.equal(trip.state, "active");
  assert.deepEqual(trip.contacts.map((item) => item.name), ["Mum"]);
  assert.ok(trip.msUntilArrival > 0 && trip.msUntilArrival <= 30 * MINUTE);

  const again = await startTrip(server, ada.cookie, { id });
  assert.equal(again.json().duplicate, true, "repeating the same start is safe");
  const second = await startTrip(server, ada.cookie);
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().trip.id, id, "the open trip is returned");

  const started = await waitFor(async () => (await getTrip(server, ada.cookie, id)).notifications.find((item) => item.kind === "trip-started"));
  assert.equal(started.contactName, "Mum");
  assert.match(server.mailer.list("+2348031234567").at(-1).text, /started a trip from Yaba to Lekki Phase 1/);
  assert.equal(server.mailer.list("+2348031234568").length, 0, "contacts not chosen for the trip get nothing");
  await server.close();
});

test("ISOLATION: trips are private to their owner", async () => {
  const server = await makeServer();
  const alice = await newUser(server, "Alice");
  const bob = await newUser(server, "Bob");
  const aliceContact = await contact(server, alice.cookie, { name: "Sis", phone: "+2348031234567" });
  const trip = (await startTrip(server, alice.cookie)).json().trip;

  assert.equal((await call(server, "GET", `/api/v1/trips/${trip.id}`, { cookie: bob.cookie })).statusCode, 404);
  for (const name of ["pause", "resume", "checkin"]) {
    assert.equal((await action(server, bob.cookie, trip.id, name)).statusCode, 404, name);
  }
  assert.equal((await action(server, bob.cookie, trip.id, "end", { outcome: "cancelled" })).statusCode, 404);
  assert.equal((await call(server, "DELETE", `/api/v1/trips/${trip.id}`, { cookie: bob.cookie })).statusCode, 404);
  assert.deepEqual((await call(server, "GET", "/api/v1/trips", { cookie: bob.cookie })).json().trips, []);
  assert.equal((await call(server, "GET", "/api/v1/trips/active", { cookie: bob.cookie })).json().trip, null);
  assert.equal((await startTrip(server, bob.cookie, { id: trip.id })).statusCode, 409, "another user's trip ID can't be reused");
  assert.equal((await startTrip(server, bob.cookie, { contactIds: [aliceContact.id] })).statusCode, 400, "another user's contact can't be chosen");
  assert.equal((await call(server, "GET", "/api/v1/trips")).statusCode, 401, "no public access");
  assert.equal((await getTrip(server, alice.cookie, trip.id)).status, "active");
  await server.close();
});

/* ---------- pause, resume, end ---------- */

test("pause, resume and end are safe to repeat; finished trips can be deleted", async () => {
  const server = await makeServer();
  const ada = await newUser(server);
  const trip = (await startTrip(server, ada.cookie)).json().trip;

  assert.equal((await action(server, ada.cookie, trip.id, "pause")).json().trip.state, "paused");
  assert.equal((await action(server, ada.cookie, trip.id, "pause")).statusCode, 200, "pausing twice is fine");
  assert.equal((await action(server, ada.cookie, trip.id, "resume")).json().trip.state, "active");
  assert.equal((await call(server, "DELETE", `/api/v1/trips/${trip.id}`, { cookie: ada.cookie })).statusCode, 404, "an open trip can't be deleted");

  const ended = await action(server, ada.cookie, trip.id, "end", { outcome: "completed" });
  assert.equal(ended.json().trip.state, "completed");
  assert.equal((await action(server, ada.cookie, trip.id, "end", { outcome: "cancelled" })).json().trip.state, "completed", "ending twice changes nothing");
  assert.equal((await action(server, ada.cookie, trip.id, "pause")).statusCode, 409);
  assert.equal((await startTrip(server, ada.cookie)).statusCode, 201, "a new trip can start after ending");

  assert.equal((await call(server, "DELETE", `/api/v1/trips/${trip.id}`, { cookie: ada.cookie })).statusCode, 200);
  assert.equal((await call(server, "GET", `/api/v1/trips/${trip.id}`, { cookie: ada.cookie })).statusCode, 404);
  const actions = (await call(server, "GET", "/api/v1/audit", { cookie: ada.cookie })).json().entries.map((entry) => entry.action);
  for (const expected of ["trip.started", "trip.paused", "trip.resumed", "trip.completed", "trip.deleted"]) assert.ok(actions.includes(expected), expected);
  await server.close();
});

test("uploaded points become the trip's last confirmed location, with an honest age", async () => {
  const server = await makeServer();
  const ada = await newUser(server);
  const device = (await call(server, "POST", "/api/v1/devices", { cookie: ada.cookie, payload: { name: "Phone" } })).json().device;
  const trip = (await startTrip(server, ada.cookie)).json().trip;
  assert.equal(trip.lastLocation, null);

  const now = Date.now();
  const points = [0, 1, 2].map((i) => ({
    id: crypto.randomUUID(), sessionId: trip.id, latitude: 6.5 + i * 0.001, longitude: 3.37, accuracy: 10 + i,
    deviceTimestamp: now - (3 - i) * 60000, intervalMs: 60000, flags: []
  }));
  const upload = await call(server, "POST", "/api/v1/locations/batch", { cookie: ada.cookie, payload: { deviceId: device.id, accountId: ada.id, records: points.reverse() } });
  assert.equal(upload.statusCode, 200);

  const updated = await getTrip(server, ada.cookie, trip.id);
  assert.equal(updated.points, 3);
  assert.equal(updated.lastLocation.latitude, 6.502, "the newest point, whatever the upload order");
  assert.equal(updated.lastLocation.accuracy, 12);
  assert.ok(updated.lastLocation.ageMs >= 60000 && updated.lastLocation.ageMs < 70000, "age is measured from when the fix was taken");
  await server.close();
});

/* ---------- the watchdog ---------- */

test("updates stop: check-in requested, contacts told after the grace period, and told again when you check in", async () => {
  const server = await makeServer();
  const ada = await newUser(server, "Ada");
  const mum = await contact(server, ada.cookie, { name: "Mum", phone: "+2348031234567" });
  const trip = (await startTrip(server, ada.cookie, { contactIds: [mum.id], silenceMinutes: 10, graceMinutes: 5 })).json().trip;

  await sleep(4 * MINUTE);
  assert.equal((await getTrip(server, ada.cookie, trip.id)).state, "delayed", "late update, but not yet the chosen period");

  await sleep(7 * MINUTE); // past the 10 "minutes" without news
  server.watchdog.tick();
  let current = await getTrip(server, ada.cookie, trip.id);
  assert.equal(current.state, "checkin-requested");
  assert.equal(current.checkinReason, "no-updates");
  assert.equal(current.notifications.length, 0, "contacts are not told straight away");

  await sleep(6 * MINUTE); // past the 5-"minute" grace period
  server.watchdog.tick();
  server.watchdog.tick(); // repeated ticks never send twice
  const alert = await waitFor(async () => {
    current = await getTrip(server, ada.cookie, trip.id);
    return current.notifications.find((item) => item.kind === "trip-missed-checkin" && item.deliveryStatus === "delivered");
  });
  assert.equal(current.notifications.filter((item) => item.kind === "trip-missed-checkin").length, 1);
  const text = server.mailer.list("+2348031234567").at(-1).text;
  assert.match(text, /stopped sending location updates during a trip from Yaba to Lekki Phase 1/);
  assert.match(text, /doesn't necessarily mean something is wrong/);
  assert.match(text, /No location has been received for this trip/);
  assert.doesNotMatch(text, /kidnap|abduct|danger/i);
  assert.ok(alert);

  const checkedIn = (await action(server, ada.cookie, trip.id, "checkin")).json().trip;
  assert.equal(checkedIn.state, "active");
  await waitFor(() => /has checked in on their trip/.test(server.mailer.list("+2348031234567").at(-1).text));
  await server.close();
});

test("expected arrival passes: overdue check-in; 'notify immediately' tells contacts at once; failures are recorded", async () => {
  const server = await makeServer();
  const ada = await newUser(server, "Ada");
  const flaky = await contact(server, ada.cookie, { name: "Flaky", phone: "+2348030000000" }); // simulated provider rejects
  const trip = (await startTrip(server, ada.cookie, { contactIds: [flaky.id], expectedArrivalInMinutes: 1, escalation: "notify-immediately" })).json().trip;

  await sleep(2 * MINUTE);
  server.watchdog.tick();
  const current = await getTrip(server, ada.cookie, trip.id);
  assert.equal(current.checkinReason, "overdue");
  assert.equal(current.overdue, true);
  const failed = await waitFor(async () => (await getTrip(server, ada.cookie, trip.id)).notifications.find((item) => item.kind === "trip-missed-checkin" && item.submissionStatus === "failed"));
  assert.equal(failed.contactName, "Flaky");
  assert.equal(failed.deliveryStatus, "unknown", "a failed message is never reported as delivered");
  const actions = (await call(server, "GET", "/api/v1/audit", { cookie: ada.cookie })).json().entries.map((entry) => entry.action);
  assert.ok(actions.includes("trip.checkin_requested"));
  assert.ok(actions.includes("trip.contacts_alerted"));
  assert.ok(actions.includes("notification.failed"));
  await server.close();
});

test("'remind only' never messages contacts; pausing stops the no-update rule but not the arrival time", async () => {
  const server = await makeServer();
  const ada = await newUser(server);
  const mum = await contact(server, ada.cookie, { name: "Mum", phone: "+2348031234567" });
  const quiet = (await startTrip(server, ada.cookie, { contactIds: [mum.id], escalation: "remind-only" })).json().trip;
  await sleep(17 * MINUTE);
  server.watchdog.tick();
  await sleep(6 * MINUTE);
  server.watchdog.tick();
  const reminded = await getTrip(server, ada.cookie, quiet.id);
  assert.equal(reminded.state, "checkin-requested");
  assert.equal(reminded.notifications.length, 0);
  await action(server, ada.cookie, quiet.id, "end", { outcome: "cancelled" });

  const paused = (await startTrip(server, ada.cookie, { contactIds: [mum.id], expectedArrivalInMinutes: 20 })).json().trip;
  await action(server, ada.cookie, paused.id, "pause");
  await sleep(12 * MINUTE);
  server.watchdog.tick();
  assert.equal((await getTrip(server, ada.cookie, paused.id)).state, "paused", "no check-in for silence while paused");
  await sleep(10 * MINUTE);
  server.watchdog.tick();
  assert.equal((await getTrip(server, ada.cookie, paused.id)).checkinReason, "overdue", "the arrival time still counts");
  await server.close();
});

test("ending a trip after contacts were alerted always tells them", async () => {
  const server = await makeServer();
  const ada = await newUser(server, "Ada");
  const mum = await contact(server, ada.cookie, { name: "Mum", phone: "+2348031234567" });
  const trip = (await startTrip(server, ada.cookie, { contactIds: [mum.id], escalation: "notify-immediately", notifyStartEnd: false })).json().trip;
  await sleep(11 * MINUTE);
  server.watchdog.tick();
  await waitFor(async () => (await getTrip(server, ada.cookie, trip.id)).contactsAlertedAt);
  await action(server, ada.cookie, trip.id, "end", { outcome: "completed" });
  await waitFor(() => /ended their trip \(arrived\)/.test(server.mailer.list("+2348031234567").at(-1).text));
  await server.close();
});

test("account deletion removes trips and their messages", async () => {
  const server = await makeServer();
  const ada = await newUser(server);
  await startTrip(server, ada.cookie);
  assert.equal((await call(server, "POST", "/api/auth/delete-user", { cookie: ada.cookie, payload: { password: PASSWORD } })).statusCode, 200);
  assert.deepEqual(server.db.listTrips(ada.id), []);
  await server.close();
});

test("the test-only short minute is refused outside test mode", () => {
  assert.throws(() => loadConfig({ ...TEST_ENV, DEV_TEST_ENDPOINTS: "false" }), /TRIP_TEST_MINUTE_MS/);
});

test("a Phase 5 database is upgraded without losing notification history", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "safe-location-")), "app.sqlite");
  openDatabase(file).close(); // create a current database, then turn it back into the Phase 5 layout
  const raw = new DatabaseSync(file);
  raw.exec(`
    DROP TABLE notifications; DROP TABLE trip_contacts; DROP TABLE trips;
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, event_id TEXT, contact_id TEXT, contact_name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('alert', 'cancellation', 'test')), channel TEXT NOT NULL, destination TEXT NOT NULL,
      subject TEXT NOT NULL, body TEXT NOT NULL, provider TEXT, simulated INTEGER NOT NULL DEFAULT 0,
      submission_status TEXT NOT NULL, delivery_status TEXT NOT NULL DEFAULT 'unknown', provider_message_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at INTEGER NOT NULL, submitted_at INTEGER, delivery_updated_at INTEGER
    );
    INSERT INTO notifications (id, owner_id, contact_name, kind, channel, destination, subject, body, submission_status, created_at)
    VALUES ('old-message-1', 'someone', 'Mum', 'alert', 'sms', '+2348031234567', 's', 'b', 'submitted', 1);
    PRAGMA user_version = 3;
  `);
  raw.close();

  const upgraded = openDatabase(file);
  upgraded.close();
  const check = new DatabaseSync(file);
  assert.equal(check.prepare("PRAGMA user_version").get().user_version, 4);
  assert.ok(check.prepare("SELECT 1 FROM pragma_table_info('notifications') WHERE name = 'trip_id'").get());
  assert.equal(check.prepare("SELECT contact_name FROM notifications WHERE id = 'old-message-1'").get().contact_name, "Mum");
  assert.ok(check.prepare("SELECT 1 FROM sqlite_master WHERE name = 'trips'").get());
  check.close();
});
