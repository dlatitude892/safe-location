// Trip Mode API (Phase 7). Every route needs a signed-in, email-verified user and only touches that
// user's own trips. There are no public trip links. Actions are idempotent (safe to repeat) so a phone
// can queue them while offline and send them later.
import {
  tripStartSchema, tripIdParamsSchema, tripEndSchema, cleanPlaceName
} from "./validation.js";
import { notificationsFor } from "./notify/compose.js";
import { tripStartedMessage, tripCheckedInMessage, tripEndedMessage, tripLocationTime } from "./notify/messages.js";
import { tripState } from "./trips/watchdog.js";

export function registerTripRoutes(app, { db, config, dispatcher, requireUser, createRateLimiter, apiError }) {
  const minuteMs = config.tripMinuteMs; // 60 000 normally; shorter only in automated tests
  const startLimiter = createRateLimiter(config.tripStartsPerHour, 60 * 60 * 1000);
  app.addHook("onClose", async () => startLimiter.stop());

  function audit(request, action, targetId, details) {
    db.addAudit({
      ownerId: request.user.id, actor: "user", action, targetId, details,
      ip: request.ip, userAgent: String(request.headers["user-agent"] || "").slice(0, 200)
    });
  }

  // Adds what the screens need: the current state, time to arrival, and the last location's age.
  // Times are sent as "how long ago / from now", so a phone with a wrong clock still shows them right.
  function present(trip) {
    if (!trip) return null;
    const now = Date.now();
    const lastLocation = trip.lastLatitude === null
      ? null
      : {
          latitude: trip.lastLatitude,
          longitude: trip.lastLongitude,
          accuracy: trip.lastAccuracy,
          ageMs: Math.max(0, now - tripLocationTime(trip)),
          receivedAgoMs: Math.max(0, now - trip.lastReceivedAt)
        };
    const { ownerId, ownerName, ...visible } = trip;
    return {
      ...visible,
      state: tripState(trip, now, minuteMs),
      silenceMinutes: Math.round(trip.silenceMs / minuteMs), // as the person chose them
      graceMinutes: Math.round(trip.graceMs / minuteMs),
      overdue: Boolean(trip.expectedArrivalAt && now > trip.expectedArrivalAt && ["active", "paused"].includes(trip.status)),
      msUntilArrival: trip.expectedArrivalAt ? trip.expectedArrivalAt - now : null,
      checkinRequestedAgoMs: trip.checkinRequestedAt ? now - trip.checkinRequestedAt : null,
      msUntilContactsAlerted:
        trip.checkinRequestedAt && !trip.contactsAlertedAt && trip.escalation === "checkin-then-notify"
          ? Math.max(0, trip.checkinRequestedAt + trip.graceMs - now)
          : null,
      lastLocation,
      serverNow: now
    };
  }

  function messageContacts(trip, ownerId, kind, message) {
    const notifications = notificationsFor({ ownerId, contacts: trip.contacts, kind, message, tripId: trip.id });
    if (!notifications.length) return 0;
    db.insertNotifications(ownerId, notifications, Date.now());
    dispatcher.enqueue(notifications.map((item) => item.id));
    return notifications.length;
  }

  /* ---------- Start ---------- */
  app.post("/api/v1/trips", { onRequest: requireUser, schema: { body: tripStartSchema } }, async (request, reply) => {
    const user = request.user;
    const body = request.body;

    // Repeating a start (e.g. a queued action sent again) returns the same trip.
    const ownerOfId = db.tripIdOwner(body.id);
    if (ownerOfId === user.id) return { trip: present(db.getTrip(user.id, body.id)), duplicate: true };
    if (ownerOfId) return apiError(reply, 409, "id_conflict", "This trip ID cannot be used. Try again.");

    const open = db.getOpenTrip(user.id);
    if (open) return reply.code(409).send({ error: { code: "trip_already_open", message: "You already have a trip in progress. End it before starting another." }, trip: present(open) });

    const origin = cleanPlaceName(body.origin);
    const destination = cleanPlaceName(body.destination);
    if (!origin || !destination) return apiError(reply, 400, "invalid_request", "Enter where you're starting from and where you're going.");
    for (const contactId of body.contactIds) {
      if (!db.getContact(user.id, contactId)) return apiError(reply, 400, "invalid_request", "One of the chosen contacts doesn't exist.");
    }
    const device = body.deviceId ? db.findActiveDevice(user.id, body.deviceId) : null;

    const verdict = startLimiter.take(user.id);
    if (!verdict.allowed) {
      reply.header("Retry-After", String(verdict.retryAfterSeconds));
      return apiError(reply, 429, "rate_limited", "Too many trips started in the last hour. Try again later.");
    }

    const now = Date.now();
    let trip;
    try {
      trip = db.createTrip(
        user.id,
        {
          id: body.id,
          ownerName: user.name,
          deviceId: device ? device.id : null,
          origin,
          destination,
          intervalMs: body.intervalMs,
          expectedArrivalAt: body.expectedArrivalInMinutes ? now + body.expectedArrivalInMinutes * minuteMs : null,
          silenceMs: body.silenceMinutes * minuteMs,
          graceMs: body.graceMinutes * minuteMs,
          escalation: body.escalation,
          notifyStartEnd: body.notifyStartEnd
        },
        body.contactIds,
        now
      );
    } catch (error) {
      const nowOpen = db.getOpenTrip(user.id); // two starts at once: the database allows one open trip
      if (nowOpen) return reply.code(409).send({ error: { code: "trip_already_open", message: "You already have a trip in progress." }, trip: present(nowOpen) });
      throw error;
    }

    const messages = trip.notifyStartEnd ? messageContacts(trip, user.id, "trip-started", tripStartedMessage({ userName: user.name, trip, timeZone: config.sosTimeZone })) : 0;
    audit(request, "trip.started", trip.id, { contacts: trip.contacts.length, escalation: trip.escalation, hasExpectedArrival: Boolean(trip.expectedArrivalAt), messages });
    return reply.code(201).send({ trip: present(db.getTrip(user.id, trip.id)) });
  });

  /* ---------- Read ---------- */
  app.get("/api/v1/trips", { onRequest: requireUser }, async (request) => ({ trips: db.listTrips(request.user.id, 50).map(present) }));
  app.get("/api/v1/trips/active", { onRequest: requireUser }, async (request) => ({ trip: present(db.getOpenTrip(request.user.id)) }));
  app.get("/api/v1/trips/:tripId", { onRequest: requireUser, schema: { params: tripIdParamsSchema } }, async (request, reply) => {
    const trip = db.getTrip(request.user.id, request.params.tripId);
    if (!trip) return apiError(reply, 404, "trip_not_found", "Trip not found.");
    return { trip: present(trip) };
  });

  /* ---------- Pause, resume, check in, end ---------- */
  // Each action is safe to repeat: doing it twice changes nothing and still answers with the trip.
  function tripAction(path, run) {
    app.post(`/api/v1/trips/:tripId/${path}`, { onRequest: requireUser, schema: { params: tripIdParamsSchema, ...(path === "end" ? { body: tripEndSchema } : {}) } }, async (request, reply) => {
      const trip = db.getTrip(request.user.id, request.params.tripId);
      if (!trip) return apiError(reply, 404, "trip_not_found", "Trip not found.");
      const result = run(request, trip);
      if (result && result.error) return apiError(reply, 409, "trip_not_open", result.error);
      return { trip: present(db.getTrip(request.user.id, trip.id)) };
    });
  }

  tripAction("pause", (request, trip) => {
    if (trip.status === "paused") return null;
    if (trip.status !== "active") return { error: "This trip has already ended." };
    db.pauseTrip(request.user.id, trip.id, Date.now());
    audit(request, "trip.paused", trip.id);
    return null;
  });

  tripAction("resume", (request, trip) => {
    if (trip.status === "active") return null;
    if (trip.status !== "paused") return { error: "This trip has already ended." };
    db.resumeTrip(request.user.id, trip.id, Date.now());
    audit(request, "trip.resumed", trip.id);
    return null;
  });

  tripAction("checkin", (request, trip) => {
    if (!["active", "paused"].includes(trip.status)) return { error: "This trip has already ended." };
    const contactsWereAlerted = Boolean(trip.contactsAlertedAt);
    db.checkInTrip(request.user.id, trip.id, Date.now());
    const messages = contactsWereAlerted ? messageContacts(trip, request.user.id, "trip-checked-in", tripCheckedInMessage({ userName: request.user.name, trip })) : 0;
    audit(request, "trip.checked_in", trip.id, { messages });
    return null;
  });

  tripAction("end", (request, trip) => {
    if (["completed", "cancelled"].includes(trip.status)) return null; // already ended: nothing to do
    const outcome = request.body.outcome;
    const now = Date.now();
    db.endTrip(request.user.id, trip.id, outcome, now);
    // Tell contacts if they asked to hear about start/end, or if they were alerted and are waiting for news.
    const tell = trip.notifyStartEnd || Boolean(trip.contactsAlertedAt);
    const messages = tell ? messageContacts(trip, request.user.id, "trip-ended", tripEndedMessage({ userName: request.user.name, trip, outcome, now, timeZone: config.sosTimeZone })) : 0;
    audit(request, outcome === "completed" ? "trip.completed" : "trip.cancelled", trip.id, { messages });
    return null;
  });

  /* ---------- Delete a finished trip (route and messages) ---------- */
  app.delete("/api/v1/trips/:tripId", { onRequest: requireUser, schema: { params: tripIdParamsSchema } }, async (request, reply) => {
    if (!db.deleteTrip(request.user.id, request.params.tripId)) {
      return apiError(reply, 404, "trip_not_found", "Trip not found, or still in progress (end it first).");
    }
    audit(request, "trip.deleted", request.params.tripId);
    return { deleted: true };
  });

  return { present };
}
