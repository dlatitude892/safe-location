// Trip data (Phase 7). A trip is a monitored journey. Its ID is also the "session ID" of the
// location points recorded during it, so the trip's route is simply its points.
// Like the rest of the database code, every function a route calls takes the signed-in user's ID
// (`ownerId`) and filters by it. Functions marked "watchdog only" are used by the server's timer.
import { toNotification } from "./emergency-store.js";

export const TRIP_SCHEMA = `
  CREATE TABLE IF NOT EXISTS trips (
    id                    TEXT PRIMARY KEY,       -- created on the phone; also the session_id of the trip's points
    owner_id              TEXT NOT NULL,
    owner_name            TEXT NOT NULL,          -- the name used in messages (the watchdog has no session)
    device_id             TEXT,
    origin                TEXT NOT NULL,
    destination           TEXT NOT NULL,
    interval_ms           INTEGER NOT NULL,
    expected_arrival_at   INTEGER,                -- server time; NULL = no expected arrival
    silence_ms            INTEGER NOT NULL,       -- "updates stopped" after this long without news
    grace_ms              INTEGER NOT NULL,       -- time to answer a check-in before contacts are told
    escalation            TEXT NOT NULL CHECK (escalation IN ('remind-only', 'checkin-then-notify', 'notify-immediately')),
    notify_start_end      INTEGER NOT NULL DEFAULT 0 CHECK (notify_start_end IN (0, 1)),
    status                TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    started_at            INTEGER NOT NULL,
    paused_at             INTEGER,
    resumed_at            INTEGER,
    ended_at              INTEGER,
    last_checkin_at       INTEGER,
    checkin_requested_at  INTEGER,
    checkin_reason        TEXT CHECK (checkin_reason IN ('overdue', 'no-updates')),
    overdue_flagged_at    INTEGER,
    contacts_alerted_at   INTEGER,
    last_received_at      INTEGER,                -- server time the newest point arrived
    last_fix_at           INTEGER,                -- device time of the newest point (untrusted)
    last_latitude         REAL,
    last_longitude        REAL,
    last_accuracy_m       REAL
  );
  CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips (owner_id, started_at);
  -- At most one open (active or paused) trip per person, guaranteed by the database.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_one_open ON trips (owner_id) WHERE status IN ('active', 'paused');

  CREATE TABLE IF NOT EXISTS trip_contacts (
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (trip_id, contact_id)
  );
`;

// Phase 5 databases: rebuild the notifications table so it can hold trip messages too.
// SQLite cannot change a CHECK rule in place, so the table is copied into a new one.
export function upgradeNotificationsForTrips(db, notificationsSchema) {
  const hasTripColumn = db.prepare("SELECT 1 FROM pragma_table_info('notifications') WHERE name = 'trip_id'").get();
  if (hasTripColumn) return;
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE notifications RENAME TO notifications_phase5;");
    db.exec("DROP INDEX IF EXISTS idx_notifications_event; DROP INDEX IF EXISTS idx_notifications_owner; DROP INDEX IF EXISTS idx_notifications_open;");
    db.exec(notificationsSchema);
    db.exec(`
      INSERT INTO notifications (id, owner_id, event_id, contact_id, contact_name, kind, channel, destination, subject, body,
        provider, simulated, submission_status, delivery_status, provider_message_id, attempts, last_error, created_at,
        submitted_at, delivery_updated_at)
      SELECT id, owner_id, event_id, contact_id, contact_name, kind, channel, destination, subject, body,
        provider, simulated, submission_status, delivery_status, provider_message_id, attempts, last_error, created_at,
        submitted_at, delivery_updated_at
      FROM notifications_phase5;
      DROP TABLE notifications_phase5;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

const toTrip = (row) => ({
  id: row.id,
  deviceId: row.device_id,
  origin: row.origin,
  destination: row.destination,
  intervalMs: row.interval_ms,
  expectedArrivalAt: row.expected_arrival_at,
  silenceMs: row.silence_ms,
  graceMs: row.grace_ms,
  escalation: row.escalation,
  notifyStartEnd: row.notify_start_end === 1,
  status: row.status,
  startedAt: row.started_at,
  pausedAt: row.paused_at,
  resumedAt: row.resumed_at,
  endedAt: row.ended_at,
  lastCheckinAt: row.last_checkin_at,
  checkinRequestedAt: row.checkin_requested_at,
  checkinReason: row.checkin_reason,
  overdueFlaggedAt: row.overdue_flagged_at,
  contactsAlertedAt: row.contacts_alerted_at,
  lastReceivedAt: row.last_received_at,
  lastFixAt: row.last_fix_at,
  lastLatitude: row.last_latitude,
  lastLongitude: row.last_longitude,
  lastAccuracy: row.last_accuracy_m,
  ownerId: row.owner_id,
  ownerName: row.owner_name
});

function inTransaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createTripStore(db) {
  const sql = {
    tripOwner: db.prepare("SELECT owner_id FROM trips WHERE id = ?"),
    getTrip: db.prepare("SELECT * FROM trips WHERE id = ? AND owner_id = ?"),
    openTrip: db.prepare("SELECT * FROM trips WHERE owner_id = ? AND status IN ('active', 'paused')"),
    listTrips: db.prepare("SELECT * FROM trips WHERE owner_id = ? ORDER BY started_at DESC LIMIT ?"),
    insertTrip: db.prepare(`
      INSERT INTO trips (id, owner_id, owner_name, device_id, origin, destination, interval_ms, expected_arrival_at, silence_ms,
        grace_ms, escalation, notify_start_end, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `),
    insertTripContact: db.prepare("INSERT INTO trip_contacts (trip_id, contact_id) VALUES (?, ?)"),
    tripContacts: db.prepare(`
      SELECT c.* FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id
      WHERE tc.trip_id = ? AND c.owner_id = ? ORDER BY c.name
    `),
    tripNotifications: db.prepare("SELECT * FROM notifications WHERE trip_id = ? AND owner_id = ? ORDER BY created_at, contact_name"),
    tripPointCount: db.prepare("SELECT COUNT(*) AS n FROM locations WHERE owner_id = ? AND session_id = ?"),

    pause: db.prepare("UPDATE trips SET status = 'paused', paused_at = ? WHERE id = ? AND owner_id = ? AND status = 'active'"),
    resume: db.prepare("UPDATE trips SET status = 'active', resumed_at = ?, paused_at = NULL WHERE id = ? AND owner_id = ? AND status = 'paused'"),
    end: db.prepare(`
      UPDATE trips SET status = ?, ended_at = ?, checkin_requested_at = NULL, checkin_reason = NULL
      WHERE id = ? AND owner_id = ? AND status IN ('active', 'paused')
    `),
    checkIn: db.prepare(`
      UPDATE trips SET last_checkin_at = ?, checkin_requested_at = NULL, checkin_reason = NULL, contacts_alerted_at = NULL
      WHERE id = ? AND owner_id = ? AND status IN ('active', 'paused')
    `),
    noteLocation: db.prepare(`
      UPDATE trips SET last_received_at = ?,
        last_fix_at = CASE WHEN last_fix_at IS NULL OR ? > last_fix_at THEN ? ELSE last_fix_at END,
        last_latitude = CASE WHEN last_fix_at IS NULL OR ? > last_fix_at THEN ? ELSE last_latitude END,
        last_longitude = CASE WHEN last_fix_at IS NULL OR ? > last_fix_at THEN ? ELSE last_longitude END,
        last_accuracy_m = CASE WHEN last_fix_at IS NULL OR ? > last_fix_at THEN ? ELSE last_accuracy_m END
      WHERE id = ? AND owner_id = ?
    `),

    // Watchdog only
    openTrips: db.prepare("SELECT * FROM trips WHERE status IN ('active', 'paused')"),
    requestCheckIn: db.prepare(`
      UPDATE trips SET checkin_requested_at = ?, checkin_reason = ?
      WHERE id = ? AND status IN ('active', 'paused') AND checkin_requested_at IS NULL
    `),
    flagOverdue: db.prepare("UPDATE trips SET overdue_flagged_at = ? WHERE id = ? AND overdue_flagged_at IS NULL"),
    markAlerted: db.prepare("UPDATE trips SET contacts_alerted_at = ? WHERE id = ? AND contacts_alerted_at IS NULL"),

    deleteTripLocations: db.prepare("DELETE FROM locations WHERE owner_id = ? AND session_id = ?"),
    deleteTrip: db.prepare("DELETE FROM trips WHERE id = ? AND owner_id = ? AND status IN ('completed', 'cancelled')"),
    deleteOwnerTripContacts: db.prepare("DELETE FROM trip_contacts WHERE trip_id IN (SELECT id FROM trips WHERE owner_id = ?)"),
    deleteOwnerTrips: db.prepare("DELETE FROM trips WHERE owner_id = ?")
  };

  const contactsFor = (row) =>
    sql.tripContacts.all(row.id, row.owner_id).map((contact) => ({ id: contact.id, name: contact.name, phone: contact.phone, email: contact.email }));

  return {
    tripIdOwner: (id) => sql.tripOwner.get(id)?.owner_id ?? null,

    getTrip(ownerId, id) {
      const row = sql.getTrip.get(id, ownerId);
      if (!row) return null;
      return {
        ...toTrip(row),
        contacts: contactsFor(row),
        points: sql.tripPointCount.get(ownerId, id).n,
        notifications: sql.tripNotifications.all(id, ownerId).map(toNotification)
      };
    },
    getOpenTrip(ownerId) {
      const row = sql.openTrip.get(ownerId);
      return row ? this.getTrip(ownerId, row.id) : null;
    },
    listTrips(ownerId, limit = 50) {
      return sql.listTrips.all(ownerId, limit).map((row) => ({
        ...toTrip(row),
        contacts: contactsFor(row),
        points: sql.tripPointCount.get(ownerId, row.id).n
      }));
    },

    // Creates the trip and its chosen contacts together; throws if another trip is already open.
    createTrip(ownerId, trip, contactIds, now) {
      inTransaction(db, () => {
        sql.insertTrip.run(
          trip.id, ownerId, trip.ownerName, trip.deviceId ?? null, trip.origin, trip.destination, trip.intervalMs, trip.expectedArrivalAt ?? null,
          trip.silenceMs, trip.graceMs, trip.escalation, trip.notifyStartEnd ? 1 : 0, now
        );
        contactIds.forEach((contactId) => sql.insertTripContact.run(trip.id, contactId));
      });
      return this.getTrip(ownerId, trip.id);
    },

    pauseTrip: (ownerId, id, now) => sql.pause.run(now, id, ownerId).changes === 1,
    resumeTrip: (ownerId, id, now) => sql.resume.run(now, id, ownerId).changes === 1,
    endTrip: (ownerId, id, outcome, now) => sql.end.run(outcome, now, id, ownerId).changes === 1,
    checkInTrip: (ownerId, id, now) => sql.checkIn.run(now, id, ownerId).changes === 1,

    // Called after an upload: the newest point of the trip becomes its "last confirmed location".
    noteTripLocation(ownerId, tripId, point, now) {
      const t = point.deviceTimestamp;
      sql.noteLocation.run(now, t, t, t, point.latitude, t, point.longitude, t, point.accuracy, tripId, ownerId);
    },

    // Watchdog only
    openTripsForWatchdog: () => sql.openTrips.all().map(toTrip),
    requestTripCheckIn: (id, reason, now) => sql.requestCheckIn.run(now, reason, id).changes === 1,
    flagTripOverdue: (id, now) => sql.flagOverdue.run(now, id).changes === 1,
    markTripContactsAlerted: (id, now) => sql.markAlerted.run(now, id).changes === 1,
    tripContactsForWatchdog: (trip) => contactsFor({ id: trip.id, owner_id: trip.ownerId }),

    // Deletes a finished trip with its route and messages.
    deleteTrip(ownerId, id) {
      return inTransaction(db, () => {
        const row = sql.getTrip.get(id, ownerId);
        if (!row || !["completed", "cancelled"].includes(row.status)) return false;
        sql.deleteTripLocations.run(ownerId, id);
        return sql.deleteTrip.run(id, ownerId).changes === 1;
      });
    },

    deleteTripsForOwner(ownerId) {
      sql.deleteOwnerTripContacts.run(ownerId);
      sql.deleteOwnerTrips.run(ownerId);
    }
  };
}
