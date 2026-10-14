// Emergency data (Phase 5): trusted contacts, SOS settings, SOS events, notifications and the audit log.
// Shares the location database connection. Every function a route can call takes the signed-in user's
// ID (`ownerId`) and filters by it. The functions marked "dispatcher only" are used by the background
// sender, never with IDs taken from a request.

export const EMERGENCY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS contacts (
    id            TEXT PRIMARY KEY,
    owner_id      TEXT NOT NULL,
    name          TEXT NOT NULL,
    relationship  TEXT,
    phone         TEXT,                       -- international format, e.g. +2348031234567
    email         TEXT,
    notify_sos    INTEGER NOT NULL DEFAULT 1 CHECK (notify_sos IN (0, 1)),
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts (owner_id);

  CREATE TABLE IF NOT EXISTS sos_preferences (
    owner_id          TEXT PRIMARY KEY,
    include_location  INTEGER NOT NULL DEFAULT 1 CHECK (include_location IN (0, 1)),
    note              TEXT,
    updated_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sos_events (
    id                  TEXT PRIMARY KEY,     -- created on the device, so a retried request can't create a second event
    owner_id            TEXT NOT NULL,
    device_id           TEXT,
    status              TEXT NOT NULL CHECK (status IN ('active', 'cancelled')),
    created_at          INTEGER NOT NULL,     -- TRUSTED: server time the event was recorded
    device_triggered_at INTEGER,              -- UNTRUSTED: device time the button was pressed
    location_source     TEXT NOT NULL CHECK (location_source IN ('fresh', 'last-known', 'none')),
    location_shared     INTEGER NOT NULL DEFAULT 1 CHECK (location_shared IN (0, 1)),
    latitude            REAL CHECK (latitude BETWEEN -90 AND 90),
    longitude           REAL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m          REAL CHECK (accuracy_m >= 0),
    location_timestamp  INTEGER,
    location_age_ms     INTEGER,
    connection          TEXT,                 -- JSON, only what the browser actually reported
    battery             TEXT,                 -- JSON, only what the browser actually reported
    note                TEXT,
    cancelled_at        INTEGER,
    cancel_reason       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sos_owner ON sos_events (owner_id, created_at);
  -- The database itself guarantees at most one active SOS per person.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sos_one_active ON sos_events (owner_id) WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS notifications (
    id                  TEXT PRIMARY KEY,
    owner_id            TEXT NOT NULL,
    event_id            TEXT REFERENCES sos_events(id) ON DELETE CASCADE,
    trip_id             TEXT REFERENCES trips(id) ON DELETE CASCADE,  -- Phase 7: trip messages
    contact_id          TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    contact_name        TEXT NOT NULL,        -- kept so history still makes sense after a contact is removed
    kind                TEXT NOT NULL CHECK (kind IN (
                          'alert', 'cancellation', 'test',
                          'trip-started', 'trip-missed-checkin', 'trip-checked-in', 'trip-ended')),
    channel             TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    destination         TEXT NOT NULL,
    subject             TEXT NOT NULL,
    body                TEXT NOT NULL,
    provider            TEXT,
    simulated           INTEGER NOT NULL DEFAULT 0 CHECK (simulated IN (0, 1)),
    submission_status   TEXT NOT NULL CHECK (submission_status IN ('pending', 'submitted', 'failed', 'cancelled')),
    delivery_status     TEXT NOT NULL DEFAULT 'unknown' CHECK (delivery_status IN ('unknown', 'delivered', 'failed', 'unconfirmed')),
    provider_message_id TEXT,
    attempts            INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT,
    created_at          INTEGER NOT NULL,
    submitted_at        INTEGER,
    delivery_updated_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications (event_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_trip ON notifications (trip_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications (owner_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_open ON notifications (submission_status, delivery_status);

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    TEXT NOT NULL,
    actor       TEXT NOT NULL,                -- "user" or "system"
    action      TEXT NOT NULL,
    target_id   TEXT,
    details     TEXT,                         -- small JSON summary; never coordinates or message text
    ip          TEXT,
    user_agent  TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_owner ON audit_log (owner_id, created_at);
`;

const parse = (text) => (text ? JSON.parse(text) : null);

const toContact = (row) => ({
  id: row.id,
  name: row.name,
  relationship: row.relationship,
  phone: row.phone,
  email: row.email,
  notifySos: row.notify_sos === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const toNotification = (row) => ({
  id: row.id,
  eventId: row.event_id,
  tripId: row.trip_id,
  contactId: row.contact_id,
  contactName: row.contact_name,
  kind: row.kind,
  channel: row.channel,
  destination: row.destination,
  provider: row.provider,
  simulated: row.simulated === 1,
  submissionStatus: row.submission_status,
  deliveryStatus: row.delivery_status,
  attempts: row.attempts,
  lastError: row.last_error,
  createdAt: row.created_at,
  submittedAt: row.submitted_at,
  deliveryUpdatedAt: row.delivery_updated_at
});

function toEvent(row, notifications) {
  const hasLocation = row.location_source !== "none";
  const summary = { total: 0, pending: 0, submitted: 0, delivered: 0, failed: 0, cancelled: 0 };
  notifications
    .filter((item) => item.kind === "alert")
    .forEach((item) => {
      summary.total += 1;
      if (item.submissionStatus === "cancelled") summary.cancelled += 1;
      else if (item.submissionStatus === "pending") summary.pending += 1;
      else if (item.submissionStatus === "failed" || item.deliveryStatus === "failed") summary.failed += 1;
      else if (item.deliveryStatus === "delivered") summary.delivered += 1;
      else summary.submitted += 1;
    });
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    deviceTriggeredAt: row.device_triggered_at,
    deviceId: row.device_id,
    location: {
      source: row.location_source,
      shared: row.location_shared === 1,
      latitude: hasLocation ? row.latitude : null,
      longitude: hasLocation ? row.longitude : null,
      accuracy: hasLocation ? row.accuracy_m : null,
      timestamp: hasLocation ? row.location_timestamp : null,
      ageMs: hasLocation ? row.location_age_ms : null
    },
    connection: parse(row.connection),
    battery: parse(row.battery),
    note: row.note,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    notifications,
    summary
  };
}

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

export function createEmergencyStore(db) {
  const sql = {
    listContacts: db.prepare("SELECT * FROM contacts WHERE owner_id = ? ORDER BY created_at"),
    getContact: db.prepare("SELECT * FROM contacts WHERE id = ? AND owner_id = ?"),
    insertContact: db.prepare(`
      INSERT INTO contacts (id, owner_id, name, relationship, phone, email, notify_sos, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateContact: db.prepare(`
      UPDATE contacts SET name = ?, relationship = ?, phone = ?, email = ?, notify_sos = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `),
    deleteContact: db.prepare("DELETE FROM contacts WHERE id = ? AND owner_id = ?"),

    getPreferences: db.prepare("SELECT * FROM sos_preferences WHERE owner_id = ?"),
    savePreferences: db.prepare(`
      INSERT INTO sos_preferences (owner_id, include_location, note, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (owner_id) DO UPDATE SET include_location = excluded.include_location, note = excluded.note, updated_at = excluded.updated_at
    `),

    eventOwner: db.prepare("SELECT owner_id FROM sos_events WHERE id = ?"),
    getEvent: db.prepare("SELECT * FROM sos_events WHERE id = ? AND owner_id = ?"),
    activeEvent: db.prepare("SELECT * FROM sos_events WHERE owner_id = ? AND status = 'active'"),
    listEvents: db.prepare("SELECT * FROM sos_events WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?"),
    insertEvent: db.prepare(`
      INSERT INTO sos_events (
        id, owner_id, device_id, status, created_at, device_triggered_at, location_source, location_shared,
        latitude, longitude, accuracy_m, location_timestamp, location_age_ms, connection, battery, note
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    cancelEvent: db.prepare(`
      UPDATE sos_events SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?
      WHERE id = ? AND owner_id = ? AND status = 'active'
    `),

    eventNotifications: db.prepare("SELECT * FROM notifications WHERE event_id = ? AND owner_id = ? ORDER BY created_at, contact_name"),
    insertNotification: db.prepare(`
      INSERT INTO notifications (
        id, owner_id, event_id, trip_id, contact_id, contact_name, kind, channel, destination, subject, body,
        submission_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `),
    cancelPendingAlerts: db.prepare(`
      UPDATE notifications SET submission_status = 'cancelled', last_error = 'Not sent: the SOS was cancelled first.'
      WHERE event_id = ? AND owner_id = ? AND kind = 'alert' AND submission_status = 'pending'
    `),
    sentAlerts: db.prepare(`
      SELECT * FROM notifications
      WHERE event_id = ? AND owner_id = ? AND kind = 'alert' AND submission_status = 'submitted'
    `),
    ownerNotification: db.prepare("SELECT * FROM notifications WHERE id = ? AND owner_id = ?"),

    // Dispatcher only
    notification: db.prepare("SELECT * FROM notifications WHERE id = ?"),
    recordAttempt: db.prepare("UPDATE notifications SET attempts = attempts + 1, last_error = ? WHERE id = ?"),
    // Also applies to a row cancelled while the provider was accepting it: the record must say it was sent.
    markSubmitted: db.prepare(`
      UPDATE notifications SET submission_status = 'submitted', provider = ?, simulated = ?, provider_message_id = ?,
        submitted_at = ?, last_error = NULL
      WHERE id = ? AND submission_status IN ('pending', 'cancelled')
    `),
    markSubmissionFailed: db.prepare(`
      UPDATE notifications SET submission_status = 'failed', provider = ?, simulated = ?, last_error = ?
      WHERE id = ? AND submission_status = 'pending'
    `),
    markDelivery: db.prepare(`
      UPDATE notifications SET delivery_status = ?, last_error = COALESCE(?, last_error), delivery_updated_at = ?
      WHERE id = ? AND submission_status = 'submitted' AND delivery_status = 'unknown'
    `),
    openNotifications: db.prepare(`
      SELECT * FROM notifications
      WHERE submission_status = 'pending' OR (submission_status = 'submitted' AND delivery_status = 'unknown')
    `),

    insertAudit: db.prepare(`
      INSERT INTO audit_log (owner_id, actor, action, target_id, details, ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    listAudit: db.prepare("SELECT * FROM audit_log WHERE owner_id = ? ORDER BY id DESC LIMIT ?"),

    deleteOwnerNotifications: db.prepare("DELETE FROM notifications WHERE owner_id = ?"),
    deleteOwnerEvents: db.prepare("DELETE FROM sos_events WHERE owner_id = ?"),
    deleteOwnerContacts: db.prepare("DELETE FROM contacts WHERE owner_id = ?"),
    deleteOwnerPreferences: db.prepare("DELETE FROM sos_preferences WHERE owner_id = ?"),
    deleteOwnerAudit: db.prepare("DELETE FROM audit_log WHERE owner_id = ?")
  };

  const eventWithNotifications = (row) =>
    toEvent(row, sql.eventNotifications.all(row.id, row.owner_id).map(toNotification));

  return {
    /* ---------- contacts ---------- */
    listContacts: (ownerId) => sql.listContacts.all(ownerId).map(toContact),
    getContact: (ownerId, id) => {
      const row = sql.getContact.get(id, ownerId);
      return row ? toContact(row) : null;
    },
    createContact(ownerId, contact, now) {
      sql.insertContact.run(contact.id, ownerId, contact.name, contact.relationship, contact.phone, contact.email, contact.notifySos ? 1 : 0, now, now);
      return this.getContact(ownerId, contact.id);
    },
    updateContact(ownerId, id, contact, now) {
      const changed = sql.updateContact.run(contact.name, contact.relationship, contact.phone, contact.email, contact.notifySos ? 1 : 0, now, id, ownerId).changes;
      return changed ? this.getContact(ownerId, id) : null;
    },
    deleteContact: (ownerId, id) => sql.deleteContact.run(id, ownerId).changes === 1,

    /* ---------- preferences ---------- */
    getPreferences(ownerId) {
      const row = sql.getPreferences.get(ownerId);
      return { includeLocation: row ? row.include_location === 1 : true, note: row ? row.note : null, updatedAt: row ? row.updated_at : null };
    },
    savePreferences(ownerId, { includeLocation, note }, now) {
      sql.savePreferences.run(ownerId, includeLocation ? 1 : 0, note, now);
      return this.getPreferences(ownerId);
    },

    /* ---------- SOS events ---------- */
    sosIdOwner: (id) => sql.eventOwner.get(id)?.owner_id ?? null,
    getSosEvent(ownerId, id) {
      const row = sql.getEvent.get(id, ownerId);
      return row ? eventWithNotifications(row) : null;
    },
    getActiveSosEvent(ownerId) {
      const row = sql.activeEvent.get(ownerId);
      return row ? eventWithNotifications(row) : null;
    },
    listSosEvents: (ownerId, limit = 50) => sql.listEvents.all(ownerId, limit).map(eventWithNotifications),

    // Creates the event and its pending notifications together. Throws on a second active event
    // (unique index), which the route turns into "already active".
    createSosEvent(ownerId, event, notifications, now) {
      inTransaction(db, () => {
        const location = event.location;
        sql.insertEvent.run(
          event.id, ownerId, event.deviceId ?? null, now, event.deviceTriggeredAt ?? null,
          location ? location.source : "none", event.locationShared ? 1 : 0,
          location ? location.latitude : null, location ? location.longitude : null, location ? location.accuracy : null,
          location ? location.timestamp : null, location ? location.ageMs : null,
          event.connection ? JSON.stringify(event.connection) : null, event.battery ? JSON.stringify(event.battery) : null,
          event.note ?? null
        );
        notifications.forEach((item) => this._insertNotification(ownerId, item, now));
      });
      return this.getSosEvent(ownerId, event.id);
    },

    // Cancels an active event: unsent alerts are stopped; returns the alerts that already went out.
    cancelSosEvent(ownerId, id, reason, now) {
      return inTransaction(db, () => {
        const cancelled = sql.cancelEvent.run(now, reason, id, ownerId).changes === 1;
        if (!cancelled) return null;
        sql.cancelPendingAlerts.run(id, ownerId);
        return sql.sentAlerts.all(id, ownerId).map(toNotification);
      });
    },

    _insertNotification(ownerId, item, now) {
      sql.insertNotification.run(
        item.id, ownerId, item.eventId ?? null, item.tripId ?? null, item.contactId ?? null, item.contactName, item.kind,
        item.channel, item.destination, item.subject, item.body, now
      );
    },
    insertNotifications(ownerId, items, now) {
      inTransaction(db, () => items.forEach((item) => this._insertNotification(ownerId, item, now)));
    },
    getOwnerNotification(ownerId, id) {
      const row = sql.ownerNotification.get(id, ownerId);
      return row ? toNotification(row) : null;
    },

    /* ---------- dispatcher only ---------- */
    notificationForSending: (id) => sql.notification.get(id) ?? null,
    recordAttempt: (id, error) => sql.recordAttempt.run(error ?? null, id),
    markSubmitted: (id, { provider, simulated, providerMessageId, now }) =>
      sql.markSubmitted.run(provider, simulated ? 1 : 0, providerMessageId ?? null, now, id).changes === 1,
    markSubmissionFailed: (id, { provider, simulated, error }) =>
      sql.markSubmissionFailed.run(provider ?? null, simulated ? 1 : 0, error, id).changes === 1,
    markDelivery: (id, status, error, now) => sql.markDelivery.run(status, error ?? null, now, id).changes === 1,
    openNotifications: () => sql.openNotifications.all(),

    /* ---------- audit log ---------- */
    addAudit({ ownerId, actor = "user", action, targetId = null, details = null, ip = null, userAgent = null, now = Date.now() }) {
      sql.insertAudit.run(ownerId, actor, action, targetId, details ? JSON.stringify(details) : null, ip, userAgent, now);
    },
    listAudit: (ownerId, limit = 100) =>
      sql.listAudit.all(ownerId, limit).map((row) => ({
        id: row.id, actor: row.actor, action: row.action, targetId: row.target_id, details: parse(row.details),
        ip: row.ip, userAgent: row.user_agent, createdAt: row.created_at
      })),

    /* ---------- account deletion ---------- */
    deleteEmergencyDataForOwner(ownerId) {
      sql.deleteOwnerNotifications.run(ownerId);
      sql.deleteOwnerEvents.run(ownerId);
      sql.deleteOwnerContacts.run(ownerId);
      sql.deleteOwnerPreferences.run(ownerId);
      sql.deleteOwnerAudit.run(ownerId);
    }
  };
}
