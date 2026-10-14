// Input validation. Everything a browser sends is untrusted, including IDs and device timestamps.

export const MAX_BATCH_SIZE = 100;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const ID_SCHEMA = { type: "string", pattern: "^[A-Za-z0-9_-]{8,80}$" };
const ALLOWED_INTERVALS = new Set([60000, 120000, 300000, 600000]);
const ALLOWED_FLAGS = new Set(["low-accuracy", "implausible-jump"]);
const RECORD_FIELDS = new Set([
  "id", "sessionId", "latitude", "longitude", "accuracy", "deviceTimestamp", "deviceRecordedAt", "intervalMs", "flags"
]);

const EARLIEST_PLAUSIBLE_TIME = Date.UTC(2020, 0, 1);
const LATEST_ACCEPTED_TIME = Date.UTC(2100, 0, 1);
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Request shapes checked by Fastify before a route runs. Individual records are checked one by one
// below, so a single bad record cannot block the rest of a batch.
export const batchBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["deviceId", "accountId", "records"],
  properties: {
    deviceId: ID_SCHEMA,
    accountId: ID_SCHEMA, // the account the browser recorded these points under; must be the signed-in user
    records: { type: "array", minItems: 1, maxItems: MAX_BATCH_SIZE, items: { type: "object" } }
  }
};

export const listQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    cursor: { type: "string", maxLength: 200 },
    deviceId: ID_SCHEMA,
    sessionId: ID_SCHEMA
  }
};

export const deviceNameBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: { name: { type: "string", minLength: 1, maxLength: 60 } }
};

export const deviceParamsSchema = {
  type: "object",
  required: ["deviceId"],
  properties: { deviceId: ID_SCHEMA }
};

export const removeDeviceQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: { deleteLocations: { type: "boolean", default: false } }
};

export const tripParamsSchema = {
  type: "object",
  required: ["sessionId"],
  properties: { sessionId: ID_SCHEMA }
};

// Device names are shown back to the user: trim them and refuse control characters.
export function cleanDeviceName(name) {
  const cleaned = String(name).replace(/\s+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (!cleaned || cleaned.length > 60 || /[\u0000-\u001f\u007f]/.test(cleaned)) return null;
  return cleaned;
}

const isTime = (value) => Number.isSafeInteger(value) && value > 0 && value < LATEST_ACCEPTED_TIME;

// Returns { record } with a cleaned copy, or { error } describing the first problem found.
export function validateRecord(input, serverNow) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Record must be an object." };
  const unknown = Object.keys(input).filter((key) => !RECORD_FIELDS.has(key));
  if (unknown.length) return { error: `Unknown field(s): ${unknown.join(", ")}.` };

  const { id, sessionId, latitude, longitude, accuracy, deviceTimestamp, deviceRecordedAt, intervalMs, flags } = input;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return { error: "id must be 8–80 letters, digits, '-' or '_'." };
  if (typeof sessionId !== "string" || !ID_PATTERN.test(sessionId)) return { error: "sessionId must be 8–80 letters, digits, '-' or '_'." };
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { error: "latitude must be between -90 and 90." };
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return { error: "longitude must be between -180 and 180." };
  if (latitude === 0 && longitude === 0) return { error: "0,0 is not a valid position." };
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000000) return { error: "accuracy must be 0–1,000,000 metres." };
  if (!isTime(deviceTimestamp)) return { error: "deviceTimestamp must be a millisecond timestamp." };
  if (deviceRecordedAt !== undefined && deviceRecordedAt !== null && !isTime(deviceRecordedAt)) return { error: "deviceRecordedAt must be a millisecond timestamp or null." };
  if (intervalMs !== undefined && intervalMs !== null && !ALLOWED_INTERVALS.has(intervalMs)) return { error: "intervalMs must be 60000, 120000, 300000, 600000 or null." };
  if (flags !== undefined && (!Array.isArray(flags) || flags.length > ALLOWED_FLAGS.size || !flags.every((flag) => ALLOWED_FLAGS.has(flag)) || new Set(flags).size !== flags.length)) {
    return { error: "flags may only contain 'low-accuracy' and 'implausible-jump'." };
  }

  // Device clocks can be wrong or manipulated. Keep the record, but mark times we cannot believe.
  const deviceTimeSuspect = deviceTimestamp < EARLIEST_PLAUSIBLE_TIME || deviceTimestamp > serverNow + FUTURE_TOLERANCE_MS;

  return {
    record: {
      id, sessionId, latitude, longitude, accuracy, deviceTimestamp,
      deviceRecordedAt: deviceRecordedAt ?? null,
      intervalMs: intervalMs ?? null,
      flags: flags ?? [],
      deviceTimeSuspect
    }
  };
}

// The list cursor is an opaque string: base64url("<serverReceivedAt>.<id>").
export function encodeCursor(record) {
  return Buffer.from(`${record.serverReceivedAt}.${record.id}`).toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor) return { receivedAt: -1, id: "" };
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const match = /^(\d{1,16})\.([A-Za-z0-9_-]{8,80})$/.exec(decoded);
  if (!match) return null;
  return { receivedAt: Number(match[1]), id: match[2] };
}

/* ---------- Emergency contacts and SOS (Phase 5) ---------- */

export const PHONE_PATTERN = "^[+][1-9][0-9]{7,14}$"; // international (E.164) format, e.g. +2348031234567
const EMAIL_PATTERN = "^[^@ ]{1,64}@[^@ ]{1,190}[.][^@ ]{2,63}$";

const contactProperties = {
  name: { type: "string", minLength: 1, maxLength: 80 },
  relationship: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
  phone: { anyOf: [{ type: "string", pattern: PHONE_PATTERN }, { type: "null" }] },
  email: { anyOf: [{ type: "string", maxLength: 254, pattern: EMAIL_PATTERN }, { type: "null" }] },
  notifySos: { type: "boolean" }
};

export const contactBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "notifySos"],
  properties: contactProperties
};

export const contactParamsSchema = { type: "object", required: ["contactId"], properties: { contactId: ID_SCHEMA } };
export const sosParamsSchema = { type: "object", required: ["eventId"], properties: { eventId: ID_SCHEMA } };

export const preferencesBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["includeLocation"],
  properties: {
    includeLocation: { type: "boolean" },
    note: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] }
  }
};

const LATEST_TIME = Date.UTC(2100, 0, 1);

export const sosBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "triggeredAt"],
  properties: {
    id: ID_SCHEMA,
    deviceId: { anyOf: [ID_SCHEMA, { type: "null" }] },
    triggeredAt: { type: "integer", minimum: 1, maximum: LATEST_TIME }, // untrusted device time
    location: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["latitude", "longitude", "accuracy", "timestamp", "source"],
          properties: {
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            accuracy: { type: "number", minimum: 0, maximum: 1000000 },
            timestamp: { type: "integer", minimum: 1, maximum: LATEST_TIME },
            source: { type: "string", enum: ["fresh", "last-known"] }
          }
        }
      ]
    },
    // Only what the browser actually reported; anything missing stays missing.
    connection: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["online"],
          properties: {
            online: { type: "boolean" },
            effectiveType: { type: "string", enum: ["slow-2g", "2g", "3g", "4g"] },
            downlinkMbps: { type: "number", minimum: 0, maximum: 100000 },
            rttMs: { type: "integer", minimum: 0, maximum: 600000 },
            saveData: { type: "boolean" }
          }
        }
      ]
    },
    battery: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["level", "charging"],
          properties: { level: { type: "number", minimum: 0, maximum: 1 }, charging: { type: "boolean" } }
        }
      ]
    }
  }
};

export const cancelBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["reason"],
  properties: { reason: { type: "string", enum: ["false-alarm", "safe-now"] } }
};

// Cleans contact input after the schema check. Returns { contact } or { error }.
export function cleanContact(input) {
  const name = String(input.name).replace(/\s+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (!name || /[\u0000-\u001f\u007f]/.test(name)) return { error: "Give the contact a name." };
  const relationship = input.relationship ? String(input.relationship).replace(/\s+/g, " ").trim() || null : null;
  const phone = input.phone || null;
  const email = input.email ? input.email.trim().toLowerCase() : null;
  if (email && /\s/.test(email)) return { error: "That email address is not valid." };
  if (!phone && !email) return { error: "Add a phone number or an email address." };
  return { contact: { name, relationship, phone, email, notifySos: input.notifySos } };
}

/* ---------- Trips (Phase 7) ---------- */

export const TRIP_SILENCE_MINUTES = [10, 15, 30, 60];
export const TRIP_GRACE_MINUTES = [5, 10, 15];

const placeName = { type: "string", minLength: 1, maxLength: 100 };

export const tripStartSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "origin", "destination", "intervalMs", "contactIds", "escalation", "silenceMinutes", "graceMinutes", "notifyStartEnd"],
  properties: {
    id: ID_SCHEMA,
    deviceId: { anyOf: [ID_SCHEMA, { type: "null" }] },
    origin: placeName,
    destination: placeName,
    // Sent as "in N minutes" so a wrong phone clock can't make a trip overdue early or late.
    expectedArrivalInMinutes: { anyOf: [{ type: "integer", minimum: 1, maximum: 1440 }, { type: "null" }] },
    intervalMs: { type: "integer", enum: [60000, 120000, 300000, 600000] },
    contactIds: { type: "array", maxItems: 10, uniqueItems: true, items: ID_SCHEMA },
    escalation: { type: "string", enum: ["remind-only", "checkin-then-notify", "notify-immediately"] },
    silenceMinutes: { type: "integer", enum: TRIP_SILENCE_MINUTES },
    graceMinutes: { type: "integer", enum: TRIP_GRACE_MINUTES },
    notifyStartEnd: { type: "boolean" }
  }
};

export const tripIdParamsSchema = { type: "object", required: ["tripId"], properties: { tripId: ID_SCHEMA } };

export const tripEndSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome"],
  properties: { outcome: { type: "string", enum: ["completed", "cancelled"] } }
};

// Trims a place name; refuses control characters.
export function cleanPlaceName(value) {
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  return cleaned && !/[\u0000-\u001f\u007f]/.test(cleaned) ? cleaned : null;
}
