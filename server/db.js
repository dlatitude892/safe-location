// Location data: SQLite through Node's built-in node:sqlite module (no extra package).
// Every query that reads or changes data takes the signed-in user's ID (`ownerId`) and filters by it,
// so one person can never reach another person's devices, trips or locations, whatever IDs they send.
// All SQL lives in this file, so moving to PostgreSQL later only changes this file.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EMERGENCY_SCHEMA, createEmergencyStore } from "./emergency-store.js";
import { TRIP_SCHEMA, createTripStore, upgradeNotificationsForTrips } from "./trip-store.js";

const SCHEMA_VERSION = 4; // 2: accounts (Phase 4), 3: emergency contacts and SOS (Phase 5), 4: trips (Phase 7)

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,         -- random ID created by the server
    owner_id      TEXT NOT NULL,            -- the user account that registered it
    name          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER,
    removed_at    INTEGER                   -- set when the owner removes the device; it can no longer upload
  );
  CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices (owner_id);

  CREATE TABLE IF NOT EXISTS locations (
    id                  TEXT PRIMARY KEY,   -- created on the device; the PRIMARY KEY makes duplicates impossible
    device_id           TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    owner_id            TEXT NOT NULL,
    session_id          TEXT NOT NULL,      -- the trip
    latitude            REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude           REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m          REAL NOT NULL CHECK (accuracy_m >= 0),
    device_timestamp    INTEGER NOT NULL,   -- UNTRUSTED: when the device says the fix was taken
    device_recorded_at  INTEGER,            -- UNTRUSTED: when the device says it saved the point
    device_time_suspect INTEGER NOT NULL DEFAULT 0 CHECK (device_time_suspect IN (0, 1)),
    interval_ms         INTEGER,
    flags               TEXT NOT NULL DEFAULT '[]',
    server_received_at  INTEGER NOT NULL    -- TRUSTED: set by this server when it accepted the record
  );
  CREATE INDEX IF NOT EXISTS idx_locations_owner_received ON locations (owner_id, server_received_at, id);
  CREATE INDEX IF NOT EXISTS idx_locations_owner_trip ON locations (owner_id, session_id, device_timestamp);
  CREATE INDEX IF NOT EXISTS idx_locations_device ON locations (device_id);
`;

function migrate(db, log) {
  const version = db.prepare("PRAGMA user_version").get().user_version;
  if (version >= SCHEMA_VERSION) return;
  if (version === 2 || version === 3) {
    db.exec(TRIP_SCHEMA); // Phase 7 tables
    if (version === 3) upgradeNotificationsForTrips(db, EMERGENCY_SCHEMA); // let notifications belong to trips
    db.exec(EMERGENCY_SCHEMA); // Phase 4 -> 5 adds these tables; for Phase 5 databases this only adds new indexes
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    return;
  }
  const hasPhase3Devices = db.prepare("SELECT 1 FROM pragma_table_info('devices') WHERE name = 'token_hash'").get();
  if (hasPhase3Devices) {
    // Phase 3 test uploads belonged to anonymous devices with no account, so they cannot be given to
    // anyone safely. Browsers still hold their own copies and can upload them to an account.
    db.exec("DROP TABLE IF EXISTS locations; DROP TABLE IF EXISTS devices;");
    log?.warn("Removed Phase 3 test uploads (anonymous devices). Browsers keep their own copies.");
  }
  db.exec(SCHEMA);
  db.exec(TRIP_SCHEMA);
  db.exec(EMERGENCY_SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
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

const toLocation = (row) => ({
  id: row.id,
  deviceId: row.device_id,
  sessionId: row.session_id,
  latitude: row.latitude,
  longitude: row.longitude,
  accuracy: row.accuracy_m,
  deviceTimestamp: row.device_timestamp,
  deviceRecordedAt: row.device_recorded_at,
  deviceTimeSuspect: row.device_time_suspect === 1,
  intervalMs: row.interval_ms,
  flags: JSON.parse(row.flags),
  serverReceivedAt: row.server_received_at
});

export function openDatabase(databasePath, { log } = {}) {
  if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (databasePath !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  migrate(db, log);

  const sql = {
    ping: db.prepare("SELECT 1 AS ok"),
    insertDevice: db.prepare("INSERT INTO devices (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)"),
    activeDevice: db.prepare("SELECT id, owner_id, name FROM devices WHERE id = ? AND owner_id = ? AND removed_at IS NULL"),
    listDevices: db.prepare(`
      SELECT d.id, d.name, d.created_at, d.last_seen_at, COUNT(l.id) AS points, MAX(l.server_received_at) AS last_upload_at
      FROM devices d LEFT JOIN locations l ON l.device_id = d.id
      WHERE d.owner_id = ? AND d.removed_at IS NULL
      GROUP BY d.id ORDER BY d.created_at
    `),
    renameDevice: db.prepare("UPDATE devices SET name = ? WHERE id = ? AND owner_id = ? AND removed_at IS NULL"),
    removeDevice: db.prepare("UPDATE devices SET removed_at = ? WHERE id = ? AND owner_id = ? AND removed_at IS NULL"),
    deleteDeviceLocations: db.prepare("DELETE FROM locations WHERE device_id = ? AND owner_id = ?"),
    touchDevice: db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?"),
    insertLocation: db.prepare(`
      INSERT INTO locations (
        id, device_id, owner_id, session_id, latitude, longitude, accuracy_m,
        device_timestamp, device_recorded_at, device_time_suspect, interval_ms, flags, server_received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `),
    locationOwner: db.prepare("SELECT owner_id FROM locations WHERE id = ?"),
    listLocations: db.prepare(`
      SELECT * FROM locations
      WHERE owner_id = ?
        AND (? IS NULL OR device_id = ?)
        AND (? IS NULL OR session_id = ?)
        AND (server_received_at > ? OR (server_received_at = ? AND id > ?))
      ORDER BY server_received_at, id
      LIMIT ?
    `),
    listRecordings: db.prepare(`
      SELECT l.session_id, l.device_id, d.name AS device_name, d.removed_at,
             COUNT(*) AS points, MIN(l.device_timestamp) AS started_at, MAX(l.device_timestamp) AS ended_at,
             MAX(l.server_received_at) AS last_upload_at
      FROM locations l JOIN devices d ON d.id = l.device_id
      WHERE l.owner_id = ?
      GROUP BY l.session_id, l.device_id
      ORDER BY ended_at DESC
      LIMIT 200
    `),
    deleteRecording: db.prepare("DELETE FROM locations WHERE owner_id = ? AND session_id = ?"),
    deleteOwnerLocations: db.prepare("DELETE FROM locations WHERE owner_id = ?"),
    deleteOwnerDevices: db.prepare("DELETE FROM devices WHERE owner_id = ?"),
    countOwner: db.prepare(`
      SELECT (SELECT COUNT(*) FROM devices WHERE owner_id = ?) AS devices,
             (SELECT COUNT(*) FROM locations WHERE owner_id = ?) AS locations
    `)
  };

  const emergency = createEmergencyStore(db);
  const trips = createTripStore(db);

  const api = {
    ping: () => sql.ping.get().ok === 1,

    createDevice({ id, ownerId, name, now }) {
      sql.insertDevice.run(id, ownerId, name, now);
      return { id, name, createdAt: now };
    },

    // The one gate for uploads: a device counts only if it belongs to this user and is not removed.
    findActiveDevice(ownerId, deviceId) {
      const row = sql.activeDevice.get(deviceId, ownerId);
      return row ? { id: row.id, ownerId: row.owner_id, name: row.name } : null;
    },

    listDevices(ownerId) {
      return sql.listDevices.all(ownerId).map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        points: row.points,
        lastUploadAt: row.last_upload_at
      }));
    },

    renameDevice: (ownerId, deviceId, name) => sql.renameDevice.run(name, deviceId, ownerId).changes === 1,

    // Removes a device so it can no longer upload. Optionally deletes everything it uploaded.
    removeDevice(ownerId, deviceId, { deleteLocations }) {
      return inTransaction(db, () => {
        const removed = sql.removeDevice.run(Date.now(), deviceId, ownerId).changes === 1;
        const deleted = removed && deleteLocations ? sql.deleteDeviceLocations.run(deviceId, ownerId).changes : 0;
        return { removed, deletedLocations: deleted };
      });
    },

    touchDevice: (deviceId, now) => sql.touchDevice.run(now, deviceId),

    // Inserts a batch in one transaction. IDs this user already stored (from any of their devices) are
    // duplicates, safe to treat as accepted; IDs that belong to anyone else are conflicts.
    insertLocations({ device, records, now }) {
      return inTransaction(db, () => {
        const result = { accepted: [], duplicates: [], conflicts: [] };
        for (const record of records) {
          const { changes } = sql.insertLocation.run(
            record.id, device.id, device.ownerId, record.sessionId, record.latitude, record.longitude, record.accuracy,
            record.deviceTimestamp, record.deviceRecordedAt ?? null, record.deviceTimeSuspect ? 1 : 0,
            record.intervalMs ?? null, JSON.stringify(record.flags ?? []), now
          );
          if (changes === 1) result.accepted.push(record.id);
          else if (sql.locationOwner.get(record.id)?.owner_id === device.ownerId) result.duplicates.push(record.id);
          else result.conflicts.push(record.id);
        }
        return result;
      });
    },

    listLocations({ ownerId, deviceId = null, sessionId = null, after, limit }) {
      return sql.listLocations
        .all(ownerId, deviceId, deviceId, sessionId, sessionId, after.receivedAt, after.receivedAt, after.id, limit)
        .map(toLocation);
    },

    // A "recording" is one Start-to-Stop run of points (a trip's points are one recording too).
    listRecordings(ownerId) {
      return sql.listRecordings.all(ownerId).map((row) => ({
        sessionId: row.session_id,
        deviceId: row.device_id,
        deviceName: row.device_name,
        deviceRemoved: row.removed_at !== null,
        points: row.points,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        lastUploadAt: row.last_upload_at
      }));
    },

    deleteRecording: (ownerId, sessionId) => sql.deleteRecording.run(ownerId, sessionId).changes,

    // Account deletion: removes everything the user owns (locations, devices, contacts, SOS history, audit log).
    deleteAllForOwner(ownerId) {
      return inTransaction(db, () => {
        emergency.deleteEmergencyDataForOwner(ownerId);
        trips.deleteTripsForOwner(ownerId);
        return {
          locations: sql.deleteOwnerLocations.run(ownerId).changes,
          devices: sql.deleteOwnerDevices.run(ownerId).changes
        };
      });
    },

    countForOwner(ownerId) {
      const row = sql.countOwner.get(ownerId, ownerId);
      return { devices: row.devices, locations: row.locations };
    },

    close: () => db.close()
  };
  // Emergency and trip functions share this connection (see emergency-store.js and trip-store.js).
  return Object.assign(api, emergency, trips);
}
