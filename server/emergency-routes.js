// Emergency contacts and SOS API (Phase 5).
//
// Every route requires a signed-in, email-verified user and only touches that user's own data.
// Sensitive actions are rate limited per user and written to the audit log.
// This code never contacts emergency services: it only notifies the person's own trusted contacts.
import crypto from "node:crypto";
import {
  contactBodySchema, contactParamsSchema, sosParamsSchema, preferencesBodySchema, sosBodySchema, cancelBodySchema, cleanContact
} from "./validation.js";
import { alertMessage, cancellationMessage, testMessage } from "./notify/messages.js";

const MAX_CONTACTS = 10;
const FRESH_LOCATION_MAX_AGE_MS = 2 * 60 * 1000; // older than this is "last known", whatever the device says

function channelsFor(contact) {
  const list = [];
  if (contact.phone) list.push({ channel: "sms", destination: contact.phone });
  if (contact.email) list.push({ channel: "email", destination: contact.email });
  return list;
}

export function registerEmergencyRoutes(app, { db, config, providers, dispatcher, requireUser, createRateLimiter, apiError }) {
  const HOUR = 60 * 60 * 1000;
  const sosLimiter = createRateLimiter(config.sosTriggersPerHour, HOUR);
  const contactLimiter = createRateLimiter(config.contactChangesPerHour, HOUR);
  const testLimiter = createRateLimiter(config.contactTestsPerHour, HOUR);
  app.addHook("onClose", async () => [sosLimiter, contactLimiter, testLimiter].forEach((limiter) => limiter.stop()));

  function audit(request, action, targetId, details) {
    db.addAudit({
      ownerId: request.user.id,
      actor: "user",
      action,
      targetId,
      details,
      ip: request.ip,
      userAgent: String(request.headers["user-agent"] || "").slice(0, 200)
    });
  }

  function limited(reply, limiter, key, message) {
    const verdict = limiter.take(key);
    if (verdict.allowed) return false;
    reply.header("Retry-After", String(verdict.retryAfterSeconds));
    apiError(reply, 429, "rate_limited", message);
    return true;
  }

  function buildNotifications({ ownerId, eventId, contacts, kind, message }) {
    return contacts.flatMap((contact) =>
      channelsFor(contact).map(({ channel, destination }) => ({
        id: crypto.randomUUID(),
        ownerId,
        eventId,
        contactId: contact.id,
        contactName: contact.name,
        kind,
        channel,
        destination,
        subject: message.subject,
        body: message.body
      }))
    );
  }

  /* ---------- Notification setup (what the person should know about delivery) ---------- */

  app.get("/api/v1/notify/status", { onRequest: requireUser }, async () => ({
    mode: providers.mode,
    channels: {
      sms: { provider: providers.sms.name, simulated: providers.sms.simulated },
      email: { provider: providers.email.name, simulated: providers.email.simulated }
    },
    contactsEmergencyServices: false
  }));

  /* ---------- Trusted contacts ---------- */

  app.get("/api/v1/contacts", { onRequest: requireUser }, async (request) => ({ contacts: db.listContacts(request.user.id) }));

  app.post("/api/v1/contacts", { onRequest: requireUser, schema: { body: contactBodySchema } }, async (request, reply) => {
    if (limited(reply, contactLimiter, request.user.id, "Too many contact changes. Try again later.")) return reply;
    const { contact, error } = cleanContact(request.body);
    if (error) return apiError(reply, 400, "invalid_request", error);
    if (db.listContacts(request.user.id).length >= MAX_CONTACTS) {
      return apiError(reply, 409, "too_many_contacts", `You can have up to ${MAX_CONTACTS} trusted contacts.`);
    }
    const created = db.createContact(request.user.id, { id: crypto.randomUUID(), ...contact }, Date.now());
    audit(request, "contact.created", created.id, { channels: channelsFor(created).map((item) => item.channel), notifySos: created.notifySos });
    return reply.code(201).send({ contact: created });
  });

  app.put(
    "/api/v1/contacts/:contactId",
    { onRequest: requireUser, schema: { params: contactParamsSchema, body: contactBodySchema } },
    async (request, reply) => {
      if (limited(reply, contactLimiter, request.user.id, "Too many contact changes. Try again later.")) return reply;
      const { contact, error } = cleanContact(request.body);
      if (error) return apiError(reply, 400, "invalid_request", error);
      const updated = db.updateContact(request.user.id, request.params.contactId, contact, Date.now());
      if (!updated) return apiError(reply, 404, "contact_not_found", "Contact not found.");
      audit(request, "contact.updated", updated.id, { channels: channelsFor(updated).map((item) => item.channel), notifySos: updated.notifySos });
      return { contact: updated };
    }
  );

  app.delete("/api/v1/contacts/:contactId", { onRequest: requireUser, schema: { params: contactParamsSchema } }, async (request, reply) => {
    if (limited(reply, contactLimiter, request.user.id, "Too many contact changes. Try again later.")) return reply;
    if (!db.deleteContact(request.user.id, request.params.contactId)) return apiError(reply, 404, "contact_not_found", "Contact not found.");
    audit(request, "contact.deleted", request.params.contactId);
    return { deleted: true };
  });

  // Sends a harmless test message so the person can check a contact's details work.
  app.post("/api/v1/contacts/:contactId/test", { onRequest: requireUser, schema: { params: contactParamsSchema } }, async (request, reply) => {
    const contact = db.getContact(request.user.id, request.params.contactId);
    if (!contact) return apiError(reply, 404, "contact_not_found", "Contact not found.");
    if (limited(reply, testLimiter, request.user.id, "Too many test messages. Try again later.")) return reply;
    const notifications = buildNotifications({
      ownerId: request.user.id, eventId: null, contacts: [contact], kind: "test", message: testMessage({ userName: request.user.name })
    });
    db.insertNotifications(request.user.id, notifications, Date.now());
    dispatcher.enqueue(notifications.map((item) => item.id));
    audit(request, "contact.test_sent", contact.id, { channels: notifications.map((item) => item.channel) });
    return reply.code(202).send({ notifications: notifications.map((item) => db.getOwnerNotification(request.user.id, item.id)) });
  });

  app.get("/api/v1/notifications/:notificationId", { onRequest: requireUser, schema: { params: { type: "object", properties: { notificationId: { type: "string", maxLength: 80 } } } } }, async (request, reply) => {
    const notification = db.getOwnerNotification(request.user.id, request.params.notificationId);
    if (!notification) return apiError(reply, 404, "notification_not_found", "Not found.");
    return { notification };
  });

  /* ---------- SOS settings ---------- */

  app.get("/api/v1/sos/preferences", { onRequest: requireUser }, async (request) => ({ preferences: db.getPreferences(request.user.id) }));

  app.put("/api/v1/sos/preferences", { onRequest: requireUser, schema: { body: preferencesBodySchema } }, async (request) => {
    const note = request.body.note ? request.body.note.replace(/\s+/g, " ").trim() || null : null;
    const preferences = db.savePreferences(request.user.id, { includeLocation: request.body.includeLocation, note }, Date.now());
    audit(request, "sos.preferences_updated", null, { includeLocation: preferences.includeLocation, hasNote: Boolean(preferences.note) });
    return { preferences };
  });

  // Shows exactly what contacts would receive (with an example location), so the person can review it.
  app.get("/api/v1/sos/preview", { onRequest: requireUser }, async (request) => {
    const preferences = db.getPreferences(request.user.id);
    const example = { source: "fresh", latitude: 6.45407, longitude: 3.39467, accuracy: 15, ageMs: 0 };
    return {
      message: alertMessage({
        userName: request.user.name, createdAt: Date.now(), location: example, locationShared: preferences.includeLocation,
        note: preferences.note, timeZone: config.sosTimeZone
      }).body,
      exampleLocation: true
    };
  });

  /* ---------- SOS events ---------- */

  app.post("/api/v1/sos", { onRequest: requireUser, schema: { body: sosBodySchema } }, async (request, reply) => {
    const user = request.user;
    const body = request.body;

    // The same event ID again (e.g. a retry after a dropped connection) returns the same event.
    const ownerOfId = db.sosIdOwner(body.id);
    if (ownerOfId === user.id) return { event: db.getSosEvent(user.id, body.id), duplicate: true };
    if (ownerOfId) return apiError(reply, 409, "id_conflict", "This event ID cannot be used. Try again.");

    // Repeated activation while an SOS is active does not alert anyone twice.
    const active = db.getActiveSosEvent(user.id);
    if (active) {
      audit(request, "sos.repeat_while_active", active.id);
      return { event: active, alreadyActive: true };
    }

    if (limited(reply, sosLimiter, user.id, "Too many SOS alerts in the last hour. If you are in danger, call 112 now.")) {
      audit(request, "sos.rate_limited", body.id);
      return reply;
    }

    const now = Date.now();
    const preferences = db.getPreferences(user.id);
    const device = body.deviceId ? db.findActiveDevice(user.id, body.deviceId) : null;

    // Location: trust nothing blindly. A "fresh" fix older than 2 minutes is labelled last-known.
    let location = null;
    if (body.location) {
      const ageMs = Math.max(0, body.triggeredAt - body.location.timestamp);
      location = {
        ...body.location,
        ageMs,
        source: body.location.source === "fresh" && ageMs <= FRESH_LOCATION_MAX_AGE_MS ? "fresh" : "last-known"
      };
    }

    const contacts = db.listContacts(user.id).filter((contact) => contact.notifySos);
    const message = alertMessage({
      userName: user.name, createdAt: now, location, locationShared: preferences.includeLocation, note: preferences.note, timeZone: config.sosTimeZone
    });
    const notifications = buildNotifications({ ownerId: user.id, eventId: body.id, contacts, kind: "alert", message });

    let event;
    try {
      event = db.createSosEvent(
        user.id,
        {
          id: body.id,
          deviceId: device ? device.id : null,
          deviceTriggeredAt: body.triggeredAt,
          location,
          locationShared: preferences.includeLocation,
          connection: body.connection ?? null,
          battery: body.battery ?? null,
          note: preferences.note
        },
        notifications,
        now
      );
    } catch (error) {
      // Two simultaneous presses: the database allows only one active SOS.
      const nowActive = db.getActiveSosEvent(user.id);
      if (nowActive) return { event: nowActive, alreadyActive: true };
      throw error;
    }

    audit(request, "sos.triggered", event.id, {
      contactsNotified: contacts.length,
      messages: notifications.length,
      locationSource: event.location.source,
      locationShared: event.location.shared
    });
    dispatcher.enqueue(notifications.map((item) => item.id));
    return reply.code(201).send({ event });
  });

  app.get("/api/v1/sos", { onRequest: requireUser }, async (request) => ({ events: db.listSosEvents(request.user.id, 50) }));

  app.get("/api/v1/sos/active", { onRequest: requireUser }, async (request) => ({ event: db.getActiveSosEvent(request.user.id) }));

  app.get("/api/v1/sos/:eventId", { onRequest: requireUser, schema: { params: sosParamsSchema } }, async (request, reply) => {
    const event = db.getSosEvent(request.user.id, request.params.eventId);
    if (!event) return apiError(reply, 404, "sos_not_found", "SOS event not found.");
    return { event };
  });

  // "I'm safe": stops any alert not yet sent and tells contacts who were already alerted.
  app.post(
    "/api/v1/sos/:eventId/cancel",
    { onRequest: requireUser, schema: { params: sosParamsSchema, body: cancelBodySchema } },
    async (request, reply) => {
      const user = request.user;
      const existing = db.getSosEvent(user.id, request.params.eventId);
      if (!existing) return apiError(reply, 404, "sos_not_found", "SOS event not found.");
      if (existing.status !== "active") return apiError(reply, 409, "sos_not_active", "This SOS is no longer active.");

      const alreadyAlerted = db.cancelSosEvent(user.id, existing.id, request.body.reason, Date.now());
      if (!alreadyAlerted) return apiError(reply, 409, "sos_not_active", "This SOS is no longer active.");

      const contacts = alreadyAlerted.map((item) => ({ id: item.contactId, name: item.contactName, phone: item.channel === "sms" ? item.destination : null, email: item.channel === "email" ? item.destination : null }));
      const message = cancellationMessage({ userName: user.name, createdAt: existing.createdAt, reason: request.body.reason, timeZone: config.sosTimeZone });
      const notifications = buildNotifications({ ownerId: user.id, eventId: existing.id, contacts, kind: "cancellation", message });
      db.insertNotifications(user.id, notifications, Date.now());
      dispatcher.enqueue(notifications.map((item) => item.id));

      audit(request, "sos.cancelled", existing.id, { reason: request.body.reason, cancellationMessages: notifications.length });
      return { event: db.getSosEvent(user.id, existing.id) };
    }
  );

  /* ---------- Audit log (the person's own entries) ---------- */

  app.get("/api/v1/audit", { onRequest: requireUser }, async (request) => ({ entries: db.listAudit(request.user.id, 100) }));

  // Used by the dispatcher when an alert went out at the same moment the SOS was cancelled.
  return {
    sendLateCancellation(notificationRow) {
      const event = db.getSosEvent(notificationRow.owner_id, notificationRow.event_id);
      if (!event || event.status !== "cancelled") return;
      const contact = {
        id: notificationRow.contact_id,
        name: notificationRow.contact_name,
        phone: notificationRow.channel === "sms" ? notificationRow.destination : null,
        email: notificationRow.channel === "email" ? notificationRow.destination : null
      };
      const userName = notificationRow.subject.replace(/^SOS from /, "");
      const message = cancellationMessage({ userName, createdAt: event.createdAt, reason: event.cancelReason, timeZone: config.sosTimeZone });
      const notifications = buildNotifications({ ownerId: notificationRow.owner_id, eventId: event.id, contacts: [contact], kind: "cancellation", message });
      db.insertNotifications(notificationRow.owner_id, notifications, Date.now());
      dispatcher.enqueue(notifications.map((item) => item.id));
    }
  };
}
