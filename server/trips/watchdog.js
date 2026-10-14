// The trip watchdog (Phase 7): a timer on the server that looks at every open trip.
//
// Why on the server? A phone that is switched off, out of battery or without signal can't raise an
// alarm by itself, so the server notices the silence instead.
//
// For each open trip, every TRIP_WATCH_INTERVAL_MS:
//   1. Expected arrival passed            -> ask the person to check in (reason "overdue").
//   2. No update for the chosen period    -> ask the person to check in (reason "no-updates").
//      (Not while paused: pausing is a deliberate stop.)
//   3. Check-in requested and unanswered  -> follow the person's own choice:
//        remind-only          never message contacts;
//        checkin-then-notify  message the chosen contacts after the grace period;
//        notify-immediately   message them straight away.
// Messages state facts only and never claim the person is in danger.
import { notificationsFor } from "../notify/compose.js";
import { tripMissedCheckinMessage } from "../notify/messages.js";

// The most recent sign of life: start, resume, a received location, or a check-in.
export function lastActivity(trip) {
  return Math.max(trip.startedAt, trip.resumedAt || 0, trip.lastReceivedAt || 0, trip.lastCheckinAt || 0);
}

// What the trip looks like right now, for the screens. "offline" is added by the phone itself.
export function tripState(trip, now, minuteMs) {
  if (trip.status === "completed" || trip.status === "cancelled") return trip.status;
  if (trip.checkinRequestedAt) return "checkin-requested";
  if (trip.status === "paused") return "paused";
  const expectedGap = Math.max(3 * (trip.intervalMs / 60000) * minuteMs, 2 * minuteMs);
  return now - lastActivity(trip) > expectedGap ? "delayed" : "active";
}

export function createTripWatchdog({ db, dispatcher, config, log }) {
  let timer = null;

  function audit(trip, action, details) {
    db.addAudit({ ownerId: trip.ownerId, actor: "system", action, targetId: trip.id, details });
  }

  function requestCheckIn(trip, reason, now) {
    if (db.requestTripCheckIn(trip.id, reason, now)) audit(trip, "trip.checkin_requested", { reason });
  }

  function alertContacts(trip, now) {
    const contacts = db.tripContactsForWatchdog(trip);
    const message = tripMissedCheckinMessage({ userName: trip.ownerName, trip, now, timeZone: config.sosTimeZone });
    const notifications = notificationsFor({ ownerId: trip.ownerId, contacts, kind: "trip-missed-checkin", message, tripId: trip.id });
    db.insertNotifications(trip.ownerId, notifications, now);
    dispatcher.enqueue(notifications.map((item) => item.id));
    audit(trip, "trip.contacts_alerted", { reason: trip.checkinReason, messages: notifications.length });
  }

  function checkTrip(trip, now) {
    if (trip.expectedArrivalAt && now > trip.expectedArrivalAt && !trip.overdueFlaggedAt) {
      db.flagTripOverdue(trip.id, now);
      requestCheckIn(trip, "overdue", now);
    } else if (trip.status === "active" && !trip.checkinRequestedAt && now - lastActivity(trip) > trip.silenceMs) {
      requestCheckIn(trip, "no-updates", now);
    }

    const current = db.getTrip(trip.ownerId, trip.id);
    if (!current || !current.checkinRequestedAt || current.contactsAlertedAt) return;
    const due =
      current.escalation === "notify-immediately" ||
      (current.escalation === "checkin-then-notify" && now - current.checkinRequestedAt >= current.graceMs);
    if (due && db.markTripContactsAlerted(current.id, now)) alertContacts(current, now);
  }

  function tick(now = Date.now()) {
    for (const trip of db.openTripsForWatchdog()) {
      try {
        checkTrip(trip, now);
      } catch (error) {
        log.error({ err: error }, "Trip watchdog failed for one trip");
      }
    }
  }

  return {
    tick,
    start() {
      if (!timer) timer = setInterval(() => tick(), config.tripWatchIntervalMs);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    }
  };
}
