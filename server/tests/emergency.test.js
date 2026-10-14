// Emergency contacts and SOS tests (Phase 5). Notifications use the SIMULATED provider with short delays.
// Run with: npm run test:server
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { createServices } from "../services.js";
import { createDispatcher } from "../notify/dispatcher.js";
import { createTwilioSmsProvider, mapTwilioStatus } from "../notify/providers.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";
const TEST_ENV = {
  BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789",
  DATABASE_PATH: ":memory:",
  AUTH_DATABASE_PATH: ":memory:",
  MAIL_OUTBOX_DIR: "",
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",
  SIMULATED_DELIVERY_DELAY_MS: "40",
  NOTIFY_POLL_INTERVAL_MS: "20",
  NOTIFY_RETRY_BASE_MS: "20",
  LOG_LEVEL: "silent"
};
const quiet = { info: () => {}, warn: () => {} };

async function makeServer(envOverrides = {}) {
  const config = loadConfig({ ...TEST_ENV, ...envOverrides });
  return createServices({ config, log: quiet, logger: false });
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
  return { email, cookie };
}

async function addContact(server, cookie, contact) {
  const response = await call(server, "POST", "/api/v1/contacts", { cookie, payload: { notifySos: true, ...contact } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().contact;
}

function sos(server, cookie, overrides = {}) {
  const now = Date.now();
  return call(server, "POST", "/api/v1/sos", {
    cookie,
    payload: {
      id: crypto.randomUUID(),
      triggeredAt: now,
      location: { latitude: 6.4281, longitude: 3.4219, accuracy: 12, timestamp: now - 5000, source: "fresh" },
      connection: { online: true, effectiveType: "4g" },
      battery: { level: 0.42, charging: false },
      ...overrides
    }
  });
}

const getEvent = async (server, cookie, id) => (await call(server, "GET", `/api/v1/sos/${id}`, { cookie })).json().event;

async function waitFor(check, { timeout = 3000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/* ---------- contacts ---------- */

test("trusted contacts: add, edit, remove, with validation and audit entries", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const contact = await addContact(server, cookie, { name: "  Mum ", relationship: "Mother", phone: "+2348031234567", email: null });
  assert.equal(contact.name, "Mum");

  const edited = await call(server, "PUT", `/api/v1/contacts/${contact.id}`, {
    cookie, payload: { name: "Mum", relationship: null, phone: "+2348031234568", email: "mum@example.test", notifySos: false }
  });
  assert.equal(edited.statusCode, 200);
  assert.equal(edited.json().contact.notifySos, false);

  const bad = [
    { name: "No way to reach", notifySos: true },
    { name: "Local format", phone: "08031234567", notifySos: true },
    { name: "Bad email", email: "not-an-email", notifySos: true },
    { name: "Extra", phone: "+2348031234567", notifySos: true, admin: true },
    { name: "", phone: "+2348031234567", notifySos: true }
  ];
  for (const payload of bad) {
    assert.equal((await call(server, "POST", "/api/v1/contacts", { cookie, payload })).statusCode, 400, JSON.stringify(payload));
  }

  assert.equal((await call(server, "DELETE", `/api/v1/contacts/${contact.id}`, { cookie })).statusCode, 200);
  assert.deepEqual((await call(server, "GET", "/api/v1/contacts", { cookie })).json().contacts, []);

  const actions = (await call(server, "GET", "/api/v1/audit", { cookie })).json().entries.map((entry) => entry.action);
  assert.deepEqual(actions, ["contact.deleted", "contact.updated", "contact.created"]);
  await server.close();
});

test("ISOLATION: contacts, SOS events and the audit log are private to each user", async () => {
  const server = await makeServer();
  const alice = await newUser(server, "Alice");
  const bob = await newUser(server, "Bob");
  const contact = await addContact(server, alice.cookie, { name: "Alice's sister", phone: "+2348030000001" });
  const event = (await sos(server, alice.cookie)).json().event;

  assert.deepEqual((await call(server, "GET", "/api/v1/contacts", { cookie: bob.cookie })).json().contacts, []);
  assert.equal((await call(server, "PUT", `/api/v1/contacts/${contact.id}`, { cookie: bob.cookie, payload: { name: "x", phone: "+2348030000009", notifySos: true } })).statusCode, 404);
  assert.equal((await call(server, "DELETE", `/api/v1/contacts/${contact.id}`, { cookie: bob.cookie })).statusCode, 404);
  assert.equal((await call(server, "POST", `/api/v1/contacts/${contact.id}/test`, { cookie: bob.cookie })).statusCode, 404);
  assert.equal((await call(server, "GET", `/api/v1/sos/${event.id}`, { cookie: bob.cookie })).statusCode, 404);
  assert.equal((await call(server, "POST", `/api/v1/sos/${event.id}/cancel`, { cookie: bob.cookie, payload: { reason: "false-alarm" } })).statusCode, 404);
  assert.deepEqual((await call(server, "GET", "/api/v1/sos", { cookie: bob.cookie })).json().events, []);
  assert.equal((await call(server, "GET", "/api/v1/sos/active", { cookie: bob.cookie })).json().event, null);
  assert.deepEqual((await call(server, "GET", "/api/v1/audit", { cookie: bob.cookie })).json().entries, []);
  // Re-using Alice's event ID gives nothing away and creates nothing.
  assert.equal((await sos(server, bob.cookie, { id: event.id })).statusCode, 409);
  assert.equal((await getEvent(server, alice.cookie, event.id)).status, "active");

  for (const [method, url] of [["GET", "/api/v1/contacts"], ["POST", "/api/v1/sos"], ["GET", "/api/v1/sos"], ["GET", "/api/v1/audit"]]) {
    assert.equal((await call(server, method, url, { payload: method === "POST" ? {} : undefined })).statusCode, 401, url);
  }
  await server.close();
});

/* ---------- SOS and notifications ---------- */

test("successful alert: event recorded, contacts notified, simulated delivery confirmed", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server, "Ada");
  await addContact(server, cookie, { name: "Mum", phone: "+2348031234567" });
  await addContact(server, cookie, { name: "Tunde", email: "tunde@example.test" });

  const response = await sos(server, cookie);
  assert.equal(response.statusCode, 201);
  const event = response.json().event;
  assert.equal(event.status, "active");
  assert.equal(event.location.source, "fresh");
  assert.deepEqual(event.connection, { online: true, effectiveType: "4g" });
  assert.deepEqual(event.battery, { level: 0.42, charging: false });
  assert.equal(event.notifications.length, 2);
  assert.ok(event.notifications.every((item) => item.submissionStatus === "pending" && item.deliveryStatus === "unknown"));

  const done = await waitFor(async () => {
    const current = await getEvent(server, cookie, event.id);
    return current.summary.delivered === 2 ? current : null;
  });
  assert.ok(done.notifications.every((item) => item.simulated && item.provider.startsWith("simulated-")));
  const sms = server.mailer.list("+2348031234567").at(-1);
  assert.match(sms.subject, /SIMULATED SMS - NOT SENT/);
  assert.match(sms.text, /SOS from Ada/);
  assert.match(sms.text, /Location now \(±12 m\): 6\.42810, 3\.42190/);
  assert.match(sms.text, /has NOT contacted emergency services/);
  await server.close();
});

test("failed alerts: provider rejection is retried then marked failed; undeliverable is reported, never 'delivered'", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  await addContact(server, cookie, { name: "Rejected", phone: "+2348030000000" }); // ends 0000 -> provider rejects
  await addContact(server, cookie, { name: "Unreachable", phone: "+2348039999999" }); // ends 9999 -> delivery fails
  const event = (await sos(server, cookie)).json().event;

  const done = await waitFor(async () => {
    const current = await getEvent(server, cookie, event.id);
    return current.summary.failed === 2 ? current : null;
  });
  const rejected = done.notifications.find((item) => item.contactName === "Rejected");
  const unreachable = done.notifications.find((item) => item.contactName === "Unreachable");
  assert.equal(rejected.submissionStatus, "failed");
  assert.equal(rejected.attempts, 3);
  assert.match(rejected.lastError, /Simulated provider error/);
  assert.equal(unreachable.submissionStatus, "submitted");
  assert.equal(unreachable.deliveryStatus, "failed");
  assert.equal(done.summary.delivered, 0);

  const actions = (await call(server, "GET", "/api/v1/audit", { cookie })).json().entries.map((entry) => entry.action);
  assert.ok(actions.includes("notification.failed"));
  assert.ok(actions.includes("notification.undelivered"));
  await server.close();
});

test("repeated activation: the same ID or a second press while active never alerts twice", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  await addContact(server, cookie, { name: "Mum", phone: "+2348031234567" });
  const id = crypto.randomUUID();
  const first = await sos(server, cookie, { id });
  const retry = await sos(server, cookie, { id }); // e.g. the phone retried after losing signal
  const secondPress = await sos(server, cookie); // a new press while the first SOS is active

  assert.equal(first.statusCode, 201);
  assert.equal(retry.json().duplicate, true);
  assert.equal(secondPress.json().alreadyActive, true);
  assert.equal(secondPress.json().event.id, id);
  assert.equal((await call(server, "GET", "/api/v1/sos", { cookie })).json().events.length, 1);
  assert.equal((await getEvent(server, cookie, id)).notifications.length, 1);
  await server.close();
});

test("SOS triggers are rate limited per user, with advice to call 112", async () => {
  const server = await makeServer({ SOS_TRIGGERS_PER_HOUR: "2" });
  const { cookie } = await newUser(server);
  for (let i = 0; i < 2; i += 1) {
    const event = (await sos(server, cookie)).json().event;
    await call(server, "POST", `/api/v1/sos/${event.id}/cancel`, { cookie, payload: { reason: "false-alarm" } });
  }
  const third = await sos(server, cookie);
  assert.equal(third.statusCode, 429);
  assert.match(third.json().error.message, /call 112/);
  await server.close();
});

test("cancellation stops unsent alerts and tells contacts who were already alerted", async () => {
  const server = await makeServer({ NOTIFY_RETRY_BASE_MS: "5000" }); // keep the failing alert waiting between retries
  const { cookie } = await newUser(server, "Ada");
  await addContact(server, cookie, { name: "Mum", phone: "+2348031234567" });
  await addContact(server, cookie, { name: "Flaky", phone: "+2348030000000" });
  const event = (await sos(server, cookie)).json().event;
  await waitFor(async () => (await getEvent(server, cookie, event.id)).summary.delivered === 1);

  const cancelled = await call(server, "POST", `/api/v1/sos/${event.id}/cancel`, { cookie, payload: { reason: "false-alarm" } });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().event.status, "cancelled");
  const flaky = cancelled.json().event.notifications.find((item) => item.contactName === "Flaky" && item.kind === "alert");
  assert.equal(flaky.submissionStatus, "cancelled", "the alert waiting for a retry is never sent");

  const followUp = await waitFor(async () => {
    const current = await getEvent(server, cookie, event.id);
    const message = current.notifications.find((item) => item.kind === "cancellation");
    return message && message.deliveryStatus === "delivered" ? message : null;
  });
  assert.equal(followUp.contactName, "Mum");
  assert.match(server.mailer.list("+2348031234567").at(-1).text, /cancelled the SOS .*false alarm/);

  const again = await call(server, "POST", `/api/v1/sos/${event.id}/cancel`, { cookie, payload: { reason: "safe-now" } });
  assert.equal(again.statusCode, 409);
  const fresh = await sos(server, cookie);
  assert.equal(fresh.statusCode, 201, "a new SOS is possible after cancelling");
  await server.close();
});

test("unavailable, old and withheld locations are labelled honestly", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server, "Ada");
  await addContact(server, cookie, { name: "Mum", phone: "+2348031234567" });
  const now = Date.now();

  const none = (await sos(server, cookie, { location: null, connection: null, battery: null })).json().event;
  assert.equal(none.location.source, "none");
  assert.equal(none.connection, null);
  assert.equal(none.battery, null);
  await waitFor(() => server.mailer.list("+2348031234567").length >= 1);
  assert.match(server.mailer.list("+2348031234567").at(-1).text, /Location: not available\./);
  await call(server, "POST", `/api/v1/sos/${none.id}/cancel`, { cookie, payload: { reason: "false-alarm" } });

  // Claimed "fresh" but 10 minutes old: the server labels it last-known with its age.
  const old = (await sos(server, cookie, { triggeredAt: now, location: { latitude: 6.5, longitude: 3.4, accuracy: 40, timestamp: now - 10 * 60000, source: "fresh" } })).json().event;
  assert.equal(old.location.source, "last-known");
  assert.equal(old.location.ageMs, 10 * 60000);
  await waitFor(() => /Last known location, 10 min old \(±40 m\)/.test(server.mailer.list("+2348031234567").at(-1)?.text || ""));
  await call(server, "POST", `/api/v1/sos/${old.id}/cancel`, { cookie, payload: { reason: "false-alarm" } });

  await call(server, "PUT", "/api/v1/sos/preferences", { cookie, payload: { includeLocation: false, note: "Blue car" } });
  const withheld = (await sos(server, cookie)).json().event;
  assert.equal(withheld.location.shared, false);
  await waitFor(() => /not shared/.test(server.mailer.list("+2348031234567").at(-1)?.text || ""));
  assert.match(server.mailer.list("+2348031234567").at(-1).text, /Their note: Blue car/);
  await server.close();
});

test("SOS input is validated; device details are only stored when provided", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const bad = [
    { location: { latitude: 95, longitude: 3, accuracy: 10, timestamp: Date.now(), source: "fresh" } },
    { location: { latitude: 6, longitude: 3, accuracy: 10, timestamp: Date.now(), source: "guess" } },
    { battery: { level: 2, charging: false } },
    { connection: { online: true, effectiveType: "6g" } },
    { connection: { online: true, ip: "1.2.3.4" } },
    { id: "x" },
    { triggeredAt: "now" }
  ];
  for (const overrides of bad) {
    assert.equal((await sos(server, cookie, overrides)).statusCode, 400, JSON.stringify(overrides));
  }
  const noOrigin = await call(server, "POST", "/api/v1/sos", { cookie, origin: null, payload: { id: crypto.randomUUID(), triggeredAt: Date.now() } });
  assert.equal(noOrigin.statusCode, 403, "requests from other sites are refused");
  await server.close();
});

test("SOS with no trusted contacts is recorded but alerts nobody", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  const event = (await sos(server, cookie)).json().event;
  assert.equal(event.notifications.length, 0);
  assert.equal(event.summary.total, 0);
  await server.close();
});

test("test messages reach a contact and are rate limited", async () => {
  const server = await makeServer({ CONTACT_TESTS_PER_HOUR: "1" });
  const { cookie } = await newUser(server, "Ada");
  const contact = await addContact(server, cookie, { name: "Mum", phone: "+2348031234567" });
  const first = await call(server, "POST", `/api/v1/contacts/${contact.id}/test`, { cookie });
  assert.equal(first.statusCode, 202);
  await waitFor(() => /added you as a trusted contact/.test(server.mailer.list("+2348031234567").at(-1)?.text || ""));
  assert.equal((await call(server, "POST", `/api/v1/contacts/${contact.id}/test`, { cookie })).statusCode, 429);
  await server.close();
});

test("notifications left pending by a restart are sent when the server starts again", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  await addContact(server, cookie, { name: "Mum", phone: "+2348031234567" });
  server.dispatcher.stop(); // simulate the server stopping before anything was sent
  const event = (await sos(server, cookie)).json().event;
  assert.equal((await getEvent(server, cookie, event.id)).summary.pending, 1);

  const restarted = createDispatcher({ db: server.db, providers: server.providers, log: { error: () => {} }, pollIntervalMs: 20, maxPollMs: 60000, retryBaseMs: 20 });
  restarted.resume();
  await waitFor(async () => (await getEvent(server, cookie, event.id)).summary.delivered === 1);
  restarted.stop();
  await server.close();
});

test("account deletion removes contacts, SOS history, notifications and audit entries", async () => {
  const server = await makeServer();
  const { cookie } = await newUser(server);
  await addContact(server, cookie, { name: "Mum", phone: "+2348031234567" });
  await sos(server, cookie);
  const userId = (await call(server, "GET", "/api/auth/get-session", { cookie })).json().user.id;
  assert.equal((await call(server, "POST", "/api/auth/delete-user", { cookie, payload: { password: PASSWORD } })).statusCode, 200);
  assert.deepEqual(server.db.listContacts(userId), []);
  assert.deepEqual(server.db.listSosEvents(userId), []);
  assert.deepEqual(server.db.listAudit(userId), []);
  await server.close();
});

/* ---------- configuration and the real SMS provider ---------- */

test("live notifications refuse to start without Twilio credentials", () => {
  assert.throws(() => loadConfig({ ...TEST_ENV, NOTIFY_MODE: "live" }), /TWILIO_ACCOUNT_SID/);
  assert.throws(() => loadConfig({ ...TEST_ENV, NOTIFY_MODE: "loud" }), /NOTIFY_MODE/);
  assert.throws(() => loadConfig({ ...TEST_ENV, SOS_TIMEZONE: "Mars/Olympus" }), /SOS_TIMEZONE/);
});

test("Twilio adapter: request shape, error handling and delivery status mapping (mocked, no real SMS)", async () => {
  const calls = [];
  const replies = [
    { status: 201, body: { sid: "SM123", status: "queued" } },
    { status: 400, body: { code: 21211 } },
    { status: 503, body: {} },
    { status: 200, body: { sid: "SM123", status: "delivered" } }
  ];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const reply = replies.shift();
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  };
  const twilio = createTwilioSmsProvider({ accountSid: `AC${"a".repeat(32)}`, authToken: "token-1234567890abcd", fromNumber: "+15005550006", fetchImpl });

  assert.deepEqual(await twilio.submit({ to: "+2348031234567", body: "hello" }), { ok: true, providerMessageId: "SM123" });
  assert.match(calls[0].url, /\/Accounts\/AC[a]{32}\/Messages\.json$/);
  assert.equal(calls[0].init.body.get("To"), "+2348031234567");
  assert.equal(calls[0].init.body.get("From"), "+15005550006");
  assert.match(calls[0].init.headers.Authorization, /^Basic /);

  const invalid = await twilio.submit({ to: "+2340", body: "x" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.temporary, false);
  const outage = await twilio.submit({ to: "+2348031234567", body: "x" });
  assert.equal(outage.temporary, true);
  assert.deepEqual(await twilio.checkDelivery({ providerMessageId: "SM123" }), { state: "delivered" });

  assert.equal(mapTwilioStatus("sent").state, "pending", "'sent' only means handed to the network, not delivered");
  assert.equal(mapTwilioStatus("undelivered", 30003).state, "failed");
  assert.match(mapTwilioStatus("failed", 30008).error, /30008/);
});
