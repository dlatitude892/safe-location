// Safe Location — Phase 2
// Everything runs in the browser. There is no account or server yet.
//
// How the pieces fit together:
//   1. Settings            – constants you may want to tune.
//   2. Small helpers       – formatting, distance maths, ID creation.
//   3. Storage             – IndexedDB history (with a migration from the Phase 1 localStorage history).
//   4. Location records    – validation and quality flags for each saved point.
//   5. Route building      – splits history into trips and segments, and finds gaps.
//   6. Tracking            – live GPS feed + ONE recording scheduler that saves a point per interval.
//   7. Map                 – Leaflet map, route drawing, markers, follow mode.
//   8. Rendering           – status, statistics and the history list.
//   9. Account and backup  – sign-in state, device registration, batch upload with retries (Phases 3–4).
//  10. Emergency SOS       – trusted-contact alerts with countdown, location and offline retry (Phase 5).
//  11. Trip Mode           – monitored journeys: start, pause, end, check-ins, offline action queue (Phase 7).
//  12. Start-up            – wiring buttons and restoring state after a refresh.
"use strict";

/* ===================================================================
   1. Settings
   =================================================================== */
const INTERVAL_OPTIONS_MS = [60000, 120000, 300000, 600000];
const DEFAULT_INTERVAL_MS = 60000; // 60 seconds

const FRESH_FIX_MAX_AGE_MS = 20000; // a live GPS fix older than this is too old to save
const ON_DEMAND_REQUEST_TIMEOUT_MS = 20000; // how long to wait when we have to ask the GPS for a new fix
const LOW_ACCURACY_METERS = 100; // points less accurate than this are flagged and left off the route
const IMPLAUSIBLE_SPEED_MPS = 70;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // GPS times further than this from the device clock are not trusted // about 250 km/h; faster movement between points is flagged as a GPS jump
const GAP_MULTIPLIER = 3; // no saved point for 3 × the interval counts as a gap in the data
const RESUME_WINDOW_MS = 10 * 60 * 1000; // only auto-resume after a refresh, not days later
const HISTORY_PAGE_SIZE = 50;
const LOCATION_NAME_MOVEMENT_THRESHOLD_METERS = 50;

const DB_NAME = "safe-location";
const DB_VERSION = 1;
const LOCATION_STORE = "locations";
const LEGACY_STORAGE_KEY = "safe-location-history"; // Phase 1 history in localStorage
const SETTINGS_KEY = "safe-location-settings";
const ACTIVE_SESSION_KEY = "safe-location-active-session";
const TRACKING_LOCK_NAME = "safe-location-tracking";
const CHANNEL_NAME = "safe-location";

// Optional private settings from config.js (see config.example.js). Missing file = empty settings.
const CONFIG = window.SAFE_LOCATION_CONFIG || {};
const CARTO_API_KEY = typeof CONFIG.cartoApiKey === "string" ? CONFIG.cartoApiKey.trim() : "";

// Accounts and backup use the same address as the page (npm run dev serves both), because the sign-in
// cookie only works there. config.js may set `sync: false` to keep history on this device only.
const API_BASE_URL = CONFIG.sync === false ? null : "/api/v1";
const AUTH_BASE_URL = "/api/auth";
const SYNC_BATCH_SIZE = 50;
const SYNC_RETRY_BASE_MS = 2000;
const SYNC_RETRY_MAX_MS = 5 * 60 * 1000;
const SYNC_REQUEST_TIMEOUT_MS = 15000;
const DEVICE_KEY_PREFIX = "safe-location-device:"; // + user ID -> { id, name } of this browser (not a secret)
const ACCOUNT_CACHE_KEY = "safe-location-account"; // { id, name } of the signed-in user (not a secret)
const LEGACY_DEVICE_TOKEN_KEY = "safe-location-device"; // Phase 3 device token, removed on start-up
const SYNC_LOCK_NAME = "safe-location-sync";
const LAST_SYNC_KEY_PREFIX = "safe-location-last-sync:"; // + user ID -> time of the last upload the server confirmed
const NO_RECENT_FIX_MS = 2 * 60 * 1000; // while tracking, a fix older than this counts as "no recent GPS fix"
const STORAGE_WARNING_RATIO = 0.9; // warn when this site's storage is 90% used
const SERVER_PROBE_MS = 30000; // while the server is unreachable, check it again this often

// "Street" uses OpenStreetMap's standard tiles: street names, roads, places and landmarks.
// Usage policy: https://operations.osmfoundation.org/policies/tiles/ (fine for personal/testing use,
// not for heavy or commercial traffic).
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION}, &copy; <a href="https://carto.com/attributions">CARTO</a>`;

const MAP_STYLES = {
  street: { url: OSM_TILE_URL, options: { maxZoom: 19, attribution: OSM_ATTRIBUTION } },
  // "Dark" uses CARTO Dark Matter when a key is configured. Without a key CARTO returns tiles stamped
  // "API KEY REQUIRED", so we fall back to OpenStreetMap tiles recoloured in the browser (CSS filter).
  dark: CARTO_API_KEY
    ? {
        url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_API_KEY)}`,
        options: { maxZoom: 20, attribution: CARTO_ATTRIBUTION }
      }
    : { url: OSM_TILE_URL, options: { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: "tiles-dark" } }
};

const elements = {
  start: document.querySelector("#start-button"),
  stop: document.querySelector("#stop-button"),
  clear: document.querySelector("#clear-button"),
  intervalSelect: document.querySelector("#interval-select"),
  nextReading: document.querySelector("#next-reading"),
  gpsSignal: document.querySelector("#gps-signal"),
  gpsSignalText: document.querySelector("#gps-signal-text"),
  message: document.querySelector("#message"),
  trackingPill: document.querySelector("#tracking-pill"),
  trackingState: document.querySelector("#tracking-state"),
  networkPill: document.querySelector("#network-pill"),
  networkState: document.querySelector("#network-state"),
  layout: document.querySelector(".layout"),
  instrument: document.querySelector("#instrument"),
  conditionText: document.querySelector("#condition-text"),
  extraLabel: document.querySelector("#extra-readout-label"),
  extraValue: document.querySelector("#extra-readout-value"),
  storageNotice: document.querySelector("#storage-notice"),
  latitude: document.querySelector("#latitude"),
  longitude: document.querySelector("#longitude"),
  accuracy: document.querySelector("#accuracy"),
  lastUpdate: document.querySelector("#last-update"),
  locationName: document.querySelector("#location-name"),
  locationFlag: document.querySelector("#location-flag"),
  statStatus: document.querySelector("#stat-status"),
  statInterval: document.querySelector("#stat-interval"),
  statTotal: document.querySelector("#stat-total"),
  statTripPoints: document.querySelector("#stat-trip-points"),
  statDistance: document.querySelector("#stat-distance"),
  syncOverview: {
    list: document.querySelector("#sync-overview"),
    connection: document.querySelector("#status-connection"),
    sync: document.querySelector("#status-sync"),
    lastSync: document.querySelector("#status-last-sync"),
    storageRow: document.querySelector("#status-storage-row"),
    storage: document.querySelector("#status-storage"),
    syncNow: document.querySelector("#sync-now")
  },
  statSync: document.querySelector("#stat-sync"),
  syncPill: document.querySelector("#sync-pill"),
  syncState: document.querySelector("#sync-state"),
  accountLink: document.querySelector("#account-link"),
  backup: {
    off: document.querySelector("#backup-off"),
    checking: document.querySelector("#backup-checking"),
    signedOut: document.querySelector("#backup-signed-out"),
    signedOutText: document.querySelector("#backup-signed-out-text"),
    register: document.querySelector("#backup-register"),
    form: document.querySelector("#backup-register"),
    nameInput: document.querySelector("#device-name"),
    claimRow: document.querySelector("#claim-row"),
    claimCheckbox: document.querySelector("#claim-local"),
    claimLabel: document.querySelector("#claim-local-label"),
    formMessage: document.querySelector("#register-message"),
    active: document.querySelector("#backup-active"),
    deviceName: document.querySelector("#backup-device-name"),
    claimButton: document.querySelector("#claim-button"),
    othersNote: document.querySelector("#others-note")
  },
  historyList: document.querySelector("#history-list"),
  historyCount: document.querySelector("#history-count"),
  historyMore: document.querySelector("#history-more"),
  mapOverlay: document.querySelector("#map-overlay"),
  mapOverlayText: document.querySelector("#map-overlay-text"),
  mapAlert: document.querySelector("#map-alert"),
  followToggle: document.querySelector("#follow-toggle"),
  recenter: document.querySelector("#recenter-button"),
  fit: document.querySelector("#fit-button"),
  styleRadios: document.querySelectorAll('input[name="map-style"]')
};

// Everything the page knows lives here.
const app = {
  history: [], // all saved records, oldest first
  storageReady: false, // false = IndexedDB unavailable, history only kept in memory
  settings: loadSettings(),
  historyShown: HISTORY_PAGE_SIZE,
  unsavedIds: new Set(), // points that could not be written to IndexedDB (kept in memory, still uploaded)
  savesSinceEstimate: 0,
  storageWarning: null, // text when this site's storage is nearly full
  locationPermission: "unknown", // "granted" | "denied" | "prompt" | "unknown"
  server: "unknown", // "ok" | "unavailable" | "unknown": could the Safe Location server be reached last time?
  lastNamedPoint: null,
  locationNameText: null, // name shown for the latest reliable point
  locationNameRequest: null,
  channel: "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null
};

/* ===================================================================
   2. Small helpers
   =================================================================== */
function formatCoordinate(value) { return Number(value).toFixed(6); }
function formatAccuracy(value) { return `±${Math.round(value)} m`; }
function formatTime(timestamp) { return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function formatDate(timestamp) { return new Date(timestamp).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); }
function formatDateTime(timestamp) { return `${formatDate(timestamp)}, ${formatTime(timestamp)}`; }

function formatInterval(ms) {
  const minutes = Math.round(ms / 60000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;
}

function distanceInMeters(pointA, pointB) {
  const earthRadius = 6371000;
  const latitudeDifference = ((pointB.latitude - pointA.latitude) * Math.PI) / 180;
  const longitudeDifference = ((pointB.longitude - pointA.longitude) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos((pointA.latitude * Math.PI) / 180) *
      Math.cos((pointB.latitude * Math.PI) / 180) *
      Math.sin(longitudeDifference / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createId() {
  if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function setMessage(text, type = "") {
  elements.message.textContent = text;
  elements.message.className = `message${type ? ` is-${type}` : ""}`;
}

function loadSettings() {
  const defaults = { intervalMs: DEFAULT_INTERVAL_MS, follow: true, mapStyle: "street" };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      intervalMs: INTERVAL_OPTIONS_MS.includes(saved.intervalMs) ? saved.intervalMs : defaults.intervalMs,
      follow: typeof saved.follow === "boolean" ? saved.follow : defaults.follow,
      mapStyle: saved.mapStyle in MAP_STYLES ? saved.mapStyle : defaults.mapStyle
    };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings));
  } catch {
    // Settings are a convenience; failing to save them is not worth interrupting the user.
  }
}

/* ===================================================================
   3. Storage (IndexedDB)
   Each record: { id, sessionId, latitude, longitude, accuracy, timestamp,
                  recordedAt, intervalMs, flags, syncState }
   syncState is "pending" for every record: nothing is uploaded yet because
   there is no server. A later phase will mark records "synced".
   =================================================================== */
const storage = {
  db: null,

  open() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not supported in this browser."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(LOCATION_STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("sessionId", "sessionId");
      };
      request.onsuccess = () => {
        this.db = request.result;
        // If a future version of the page upgrades the database, close this old connection.
        this.db.onversionchange = () => this.db.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Another Safe Location tab is blocking the database. Close it and reload."));
    });
  },

  // Runs one transaction and resolves when it has fully completed (so data is really written).
  run(mode, work) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(LOCATION_STORE, mode);
      const store = transaction.objectStore(LOCATION_STORE);
      let result;
      Promise.resolve(work(store, (value) => { result = value; })).catch(reject);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Storage transaction was aborted."));
    });
  },

  getAll() {
    return this.run("readonly", (store, setResult) => {
      const request = store.index("timestamp").getAll();
      request.onsuccess = () => setResult(request.result);
    });
  },

  // Updates only the account and sync fields of records that still exist (never brings back cleared history).
  updateRecordState(records) {
    return this.run("readwrite", (store) => {
      records.forEach((record) => {
        const request = store.get(record.id);
        request.onsuccess = () => {
          if (!request.result) return;
          store.put({
            ...request.result,
            accountId: record.accountId ?? null,
            syncState: record.syncState,
            syncedAt: record.syncedAt ?? null,
            syncError: record.syncError ?? null
          });
        };
      });
    });
  },

  addMany(records) {
    return this.run("readwrite", (store) => {
      records.forEach((record) => store.put(record));
    });
  },

  clear() {
    return this.run("readwrite", (store) => store.clear());
  }
};

// Moves Phase 1 history (localStorage, newest first, no IDs) into IndexedDB once.
async function migrateLegacyHistory() {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
  } catch {
    return;
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return;

  const sessionId = `imported-${createId()}`;
  const records = legacy
    .filter(isValidCoordinateSet)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((point) => ({
      id: createId(),
      sessionId,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      timestamp: point.timestamp,
      recordedAt: point.timestamp,
      intervalMs: null, // Phase 1 had no fixed interval
      flags: point.accuracy > LOW_ACCURACY_METERS ? ["low-accuracy"] : [],
      syncState: "pending"
    }));

  await storage.addMany(records);
  localStorage.removeItem(LEGACY_STORAGE_KEY); // only removed after the copy succeeded
}

async function initStorage() {
  try {
    await storage.open();
    await migrateLegacyHistory();
    app.history = await storage.getAll();
    app.storageReady = true;
  } catch (error) {
    app.storageReady = false;
    app.history = [];
    showStorageNotice(
      `Location history cannot be saved in this browser (${error.message}). ` +
        "Tracking still works, but points will be lost when you close or reload this page."
    );
  }
}

async function reloadHistoryFromStorage() {
  if (!app.storageReady) return;
  try {
    const stored = await storage.getAll();
    // Keep points that exist only in this page's memory (storage was full when they were recorded).
    const storedIds = new Set(stored.map((record) => record.id));
    const memoryOnly = app.history.filter((record) => app.unsavedIds.has(record.id) && !storedIds.has(record.id));
    app.history = [...stored, ...memoryOnly].sort((a, b) => a.timestamp - b.timestamp);
    renderAll();
  } catch {
    // Keep showing what we already have.
  }
}

// Storage problems are never silent. A point that cannot be written stays in memory, still uploads when
// possible, is marked "Not saved on device", and the page warns before it is closed.
function reportStorageProblem(error) {
  const full = Boolean(error) && (error.name === "QuotaExceededError" || /quota/i.test(error.message || ""));
  const count = app.unsavedIds.size;
  const reason = full ? "This device's storage is full" : `Points could not be saved on this device (${error ? error.message : "storage unavailable"})`;
  showStorageNotice(
    `${reason}. ${count.toLocaleString()} point${count === 1 ? " is" : "s are"} kept only in this page's memory: they still upload if you're signed in ` +
      "and online, but are lost if this page is closed or reloaded first. Free up space on the device and keep this page open."
  );
}

// Tries again to write points that were kept only in memory. Returns true when nothing is left unsaved.
async function persistUnsavedRecords() {
  if (!app.storageReady || app.unsavedIds.size === 0) return app.unsavedIds.size === 0;
  const records = app.history.filter((record) => app.unsavedIds.has(record.id));
  try {
    await storage.addMany(records);
    app.unsavedIds.clear();
    elements.storageNotice.hidden = true;
    announceHistoryChange();
    renderAll();
    return true;
  } catch (error) {
    reportStorageProblem(error);
    return false;
  }
}

async function checkStorageEstimate() {
  if (!navigator.storage || typeof navigator.storage.estimate !== "function") return;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const ratio = quota ? usage / quota : 0;
    app.storageWarning = ratio >= STORAGE_WARNING_RATIO
      ? `Storage for this site is ${Math.round(ratio * 100)}% full. Make sure your points are backed up and free up space on the device.`
      : null;
    renderSyncStatus();
  } catch {
    /* estimate not available */
  }
}

// Asks the browser not to clear this site's data when the device runs low on space (it may say no).
async function requestPersistentStorage() {
  if (!navigator.storage || typeof navigator.storage.persist !== "function") return;
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

function showStorageNotice(text) {
  elements.storageNotice.textContent = text;
  elements.storageNotice.hidden = false;
}

function announceHistoryChange() {
  // Lets other open Safe Location tabs refresh their history view.
  if (app.channel) app.channel.postMessage({ type: "history-changed" });
}

/* ===================================================================
   4. Location records: validation and quality flags
   =================================================================== */
function isValidCoordinateSet(point) {
  return (
    point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Number.isFinite(point.accuracy) &&
    Number.isFinite(point.timestamp) &&
    point.latitude >= -90 && point.latitude <= 90 &&
    point.longitude >= -180 && point.longitude <= 180 &&
    point.accuracy >= 0 &&
    // 0,0 is in the Atlantic Ocean and is a common "no data" value from broken GPS chips.
    !(point.latitude === 0 && point.longitude === 0)
  );
}

function positionToFix(position) {
  const now = Date.now();
  // Some devices report GPS times that are badly wrong (for example after a GPS week-number rollover).
  // Use the device clock in that case, so gaps, speeds and history order stay correct.
  const reported = position.timestamp;
  const timestamp = Number.isFinite(reported) && Math.abs(reported - now) <= MAX_CLOCK_SKEW_MS ? reported : now;
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp,
    receivedAt: now
  };
}

function isReliable(record) {
  return record.flags.length === 0;
}

function previousReliableRecord(sessionId) {
  for (let index = app.history.length - 1; index >= 0; index -= 1) {
    const record = app.history[index];
    if (record.sessionId === sessionId && isReliable(record)) return record;
  }
  return null;
}

// True when getting from point A to point B would need an unrealistic speed.
function isImplausibleMove(pointA, pointB) {
  const seconds = (pointB.timestamp - pointA.timestamp) / 1000;
  // Allow for each point's own uncertainty before deciding the movement is impossible.
  const meters = Math.max(0, distanceInMeters(pointA, pointB) - pointA.accuracy - pointB.accuracy);
  return seconds > 0 && meters / seconds > IMPLAUSIBLE_SPEED_MPS;
}

function buildRecord(fix, sessionId) {
  const flags = [];
  if (fix.accuracy > LOW_ACCURACY_METERS) flags.push("low-accuracy");

  const previousReliable = previousReliableRecord(sessionId);
  if (previousReliable && flags.length === 0 && isImplausibleMove(previousReliable, fix)) {
    // If the previous point was also flagged as a jump and this one agrees with it, the jump was
    // probably real (or the older point was wrong), so accept this point instead of flagging forever.
    const previous = app.history[app.history.length - 1];
    const confirmsPreviousJump =
      previous && previous.sessionId === sessionId && previous.flags.includes("implausible-jump") && !isImplausibleMove(previous, fix);
    if (!confirmsPreviousJump) flags.push("implausible-jump");
  }

  return {
    id: createId(),
    sessionId,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    timestamp: fix.timestamp,
    recordedAt: Date.now(),
    intervalMs: app.settings.intervalMs,
    flags,
    accountId: recordOwner(), // uploaded only to this account (null = recorded while signed out)
    syncState: "pending"
  };
}

function describeFlags(record) {
  if (record.flags.includes("implausible-jump")) {
    return "This position jumped further than is realistic since the previous point, so it is probably a GPS error. It is kept in history but left off the route.";
  }
  if (record.flags.includes("low-accuracy")) {
    return `Low accuracy (${formatAccuracy(record.accuracy)}). The real position could be anywhere in the shaded circle. It is kept in history but left off the route.`;
  }
  return "";
}

/* ===================================================================
   5. Route building
   Splits records into trips (sessions). Within a trip, consecutive reliable
   points are joined into one line until there is a gap in the data.
   Different trips are never joined.
   =================================================================== */
function gapThresholdMs(recordA, recordB) {
  const interval = Math.max(recordA.intervalMs || DEFAULT_INTERVAL_MS, recordB.intervalMs || DEFAULT_INTERVAL_MS);
  return interval * GAP_MULTIPLIER;
}

function buildTrips(records) {
  const trips = new Map();
  records.forEach((record) => {
    if (!trips.has(record.sessionId)) {
      trips.set(record.sessionId, { sessionId: record.sessionId, records: [], lines: [], gaps: [], distanceMeters: 0 });
    }
    trips.get(record.sessionId).records.push(record);
  });

  trips.forEach((trip) => {
    let line = [];
    let previous = null;
    trip.records.filter(isReliable).forEach((record) => {
      // Break the line on a time gap, or where two reliable points cannot be connected realistically.
      const timeGap = previous && record.timestamp - previous.timestamp > gapThresholdMs(previous, record);
      if (previous && (timeGap || isImplausibleMove(previous, record))) {
        trip.gaps.push({ from: previous, to: record, durationMs: record.timestamp - previous.timestamp, reason: timeGap ? "time" : "jump" });
        trip.lines.push(line);
        line = [];
      } else if (previous) {
        trip.distanceMeters += distanceInMeters(previous, record);
      }
      line.push(record);
      previous = record;
    });
    if (line.length) trip.lines.push(line);
  });

  return [...trips.values()];
}

/* ===================================================================
   6. Tracking
   - The live GPS feed (watchPosition) only updates `tracker.latestFix`
     and the signal indicator. It never saves anything by itself.
   - One scheduler (a single setTimeout chain) saves one point per interval.
     The next reading is only scheduled after the current one has finished,
     so readings can never overlap.
   - `runId` changes on every start/stop, so late GPS callbacks from an old
     run are ignored.
   =================================================================== */
const tracker = {
  status: "idle", // "idle" | "starting" | "active"
  runId: 0,
  sessionId: null,
  watchId: null,
  timerId: null,
  uiTimerId: null,
  tickRunning: false,
  requestInFlight: false,
  latestFix: null,
  lastLiveError: null,
  lastTickAt: 0,
  nextDueAt: 0,
  lastSavedFixTimestamp: null,
  resumed: false, // true until the first reading after an automatic resume
  releaseLock: null
};

// Prevents two tabs tracking at once. Uses the Web Locks API when available.
function acquireTrackingLock() {
  if (!navigator.locks) return Promise.resolve(() => {}); // older browsers: no cross-tab protection
  return new Promise((resolve, reject) => {
    navigator.locks
      .request(TRACKING_LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        // Hold the lock until the returned promise resolves (when tracking stops or the tab closes).
        return new Promise((release) => resolve(release));
      })
      .catch(reject);
  });
}

// sessionId: record under this ID (Trip Mode uses the trip's ID). resumeSessionId: continue after a refresh.
async function startTracking({ resumeSessionId = null, sessionId = null } = {}) {
  if (tracker.status !== "idle") return; // already starting or tracking in this tab

  if (!navigator.geolocation) {
    setMessage("This browser does not support location tracking.", "error");
    return;
  }
  if (!window.isSecureContext) {
    setMessage("Location only works on a secure page (https:// or http://localhost). See README.md for how to run the site.", "error");
    return;
  }

  tracker.status = "starting";
  renderTrackingState();
  requestPersistentStorage();

  let release;
  try {
    release = await acquireTrackingLock();
  } catch {
    release = () => {};
  }
  if (tracker.status !== "starting") {
    // Stop was pressed while we were waiting for the lock.
    if (release) release();
    return;
  }
  if (!release) {
    tracker.status = "idle";
    renderTrackingState();
    setMessage("Tracking is already running in another Safe Location tab or window. Stop it there first.", "error");
    return;
  }

  tracker.releaseLock = release;
  tracker.runId += 1;
  const runId = tracker.runId;
  tracker.status = "active";
  tracker.sessionId = resumeSessionId || sessionId || createId();
  tracker.latestFix = null;
  tracker.lastLiveError = null;
  tracker.lastSavedFixTimestamp = null;
  tracker.resumed = Boolean(resumeSessionId);
  tracker.lastTickAt = 0;
  tracker.nextDueAt = Date.now(); // take the first reading straight away
  saveActiveSession();

  tracker.watchId = navigator.geolocation.watchPosition(
    (position) => { if (runId === tracker.runId) handleLiveFix(position); },
    (error) => { if (runId === tracker.runId) handleLocationError(error); },
    { enableHighAccuracy: true, maximumAge: 0 }
  );

  clearInterval(tracker.uiTimerId);
  tracker.uiTimerId = setInterval(renderLiveStatus, 1000);

  setMessage(resumeSessionId ? "Tracking resumed after the page reloaded." : "Requesting location…");
  renderAll();
  scheduleNextReading();
}

function stopTracking(message = "Tracking stopped. Your saved history is still on this device.", type = "") {
  if (tracker.status === "idle") return;

  tracker.runId += 1; // ignore any GPS callbacks still on their way
  if (tracker.watchId !== null) navigator.geolocation.clearWatch(tracker.watchId);
  clearTimeout(tracker.timerId);
  clearInterval(tracker.uiTimerId);
  if (tracker.releaseLock) tracker.releaseLock();

  Object.assign(tracker, {
    status: "idle",
    sessionId: null,
    watchId: null,
    timerId: null,
    uiTimerId: null,
    tickRunning: false,
    requestInFlight: false,
    latestFix: null,
    releaseLock: null
  });
  clearActiveSession();

  setMessage(message, type);
  renderAll();
}

function scheduleNextReading() {
  clearTimeout(tracker.timerId);
  tracker.timerId = null;
  // A reading in progress schedules the next one itself when it finishes.
  if (tracker.status !== "active" || tracker.tickRunning) return;
  const delay = Math.max(0, tracker.nextDueAt - Date.now());
  tracker.timerId = setTimeout(takeScheduledReading, delay);
}

async function takeScheduledReading() {
  tracker.timerId = null;
  if (tracker.status !== "active" || tracker.tickRunning) return;

  const runId = tracker.runId;
  tracker.tickRunning = true;
  tracker.lastTickAt = Date.now();
  tracker.nextDueAt = tracker.lastTickAt + app.settings.intervalMs;
  saveActiveSession();

  try {
    const fix = await getFixForReading(runId);
    if (runId !== tracker.runId) return;
    if (fix) await saveReading(fix);
  } finally {
    if (runId === tracker.runId) {
      tracker.tickRunning = false;
      scheduleNextReading();
      renderLiveStatus();
    }
  }
}

// Uses the live GPS fix if it is fresh; otherwise makes ONE on-demand request.
async function getFixForReading(runId) {
  const fix = tracker.latestFix;
  const isFresh = fix && Date.now() - fix.receivedAt <= FRESH_FIX_MAX_AGE_MS;
  if (isFresh && fix.timestamp !== tracker.lastSavedFixTimestamp) return fix;

  if (tracker.requestInFlight) return null;
  tracker.requestInFlight = true;
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: FRESH_FIX_MAX_AGE_MS,
        timeout: ON_DEMAND_REQUEST_TIMEOUT_MS
      });
    });
    if (runId !== tracker.runId) return null;
    const requested = positionToFix(position);
    if (!isValidCoordinateSet(requested)) {
      setMessage("The GPS returned an invalid position, so it was not saved.", "warning");
      return null;
    }
    tracker.latestFix = requested;
    tracker.lastLiveError = null;
    return requested;
  } catch (error) {
    if (runId === tracker.runId) handleLocationError(error, { missedReading: true });
    return null;
  } finally {
    if (runId === tracker.runId) tracker.requestInFlight = false;
  }
}

async function saveReading(fix) {
  if (fix.timestamp === tracker.lastSavedFixTimestamp) return; // never save the same GPS fix twice

  const record = buildRecord(fix, tracker.sessionId);
  tracker.lastSavedFixTimestamp = fix.timestamp;
  app.history.push(record);

  let saved = false;
  if (app.storageReady) {
    try {
      await storage.addMany([record]);
      saved = true;
      announceHistoryChange();
      await persistUnsavedRecords(); // storage works (again): write anything that was kept only in memory
    } catch (error) {
      app.unsavedIds.add(record.id);
      reportStorageProblem(error);
    }
  } else {
    app.unsavedIds.add(record.id); // no IndexedDB at all in this browser
  }
  app.savesSinceEstimate += 1;
  if (app.savesSinceEstimate >= 20) {
    app.savesSinceEstimate = 0;
    checkStorageEstimate();
  }

  renderAll();
  followLatest();
  requestSync();

  if (record.flags.includes("implausible-jump")) {
    setMessage("Saved, but flagged: the position jumped unrealistically far. It is left off the route.", "warning");
  } else if (record.flags.includes("low-accuracy")) {
    setMessage(`Saved, but flagged: low accuracy (${formatAccuracy(record.accuracy)}). Move outdoors or near a window for a better fix.`, "warning");
  } else {
    const prefix = tracker.resumed ? "Tracking resumed after the page reloaded. " : "";
    setMessage(
      saved ? `${prefix}Location saved at ${formatTime(record.timestamp)}.` : `${prefix}Location recorded at ${formatTime(record.timestamp)} (not saved to storage).`,
      saved ? "success" : "warning"
    );
    tracker.resumed = false;
    updateLocationName(record);
  }
}

function handleLiveFix(position) {
  const fix = positionToFix(position);
  if (!isValidCoordinateSet(fix)) {
    tracker.lastLiveError = "invalid";
    renderLiveStatus();
    return;
  }
  tracker.latestFix = fix;
  tracker.lastLiveError = null;
  app.locationPermission = "granted";
  renderLiveStatus();
}

function handleLocationError(error, { missedReading = false } = {}) {
  if (error.code === error.PERMISSION_DENIED) {
    app.locationPermission = "denied";
    stopTracking("Location permission was denied. Allow location for this site in your browser settings, then press Start Tracking.", "error");
    return;
  }

  // Temporary problems: keep tracking and try again at the next reading.
  tracker.lastLiveError = error.code === error.TIMEOUT ? "timeout" : "unavailable";
  renderLiveStatus();
  if (missedReading) {
    const reason = error.code === error.TIMEOUT ? "the GPS took too long to respond" : "your position is unavailable";
    setMessage(`Missed a reading because ${reason}. Still tracking — will try again at the next interval.`, "warning");
  }
}

function changeInterval(intervalMs) {
  if (!INTERVAL_OPTIONS_MS.includes(intervalMs)) return;
  app.settings.intervalMs = intervalMs;
  saveSettings();

  if (tracker.status === "active") {
    // Keep the timing anchored to the last reading, so switching never causes a burst of readings.
    tracker.nextDueAt = Math.max(Date.now(), (tracker.lastTickAt || Date.now()) + intervalMs);
    scheduleNextReading();
    setMessage(`Interval changed to ${formatInterval(intervalMs)}. Next reading at ${formatTime(tracker.nextDueAt)}.`);
  } else {
    setMessage(`Interval set to ${formatInterval(intervalMs)}.`);
  }
  renderAll();
}

// Remembers an active trip so a page refresh can resume it.
function saveActiveSession() {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ sessionId: tracker.sessionId, lastActiveAt: Date.now() }));
  } catch {
    // Without this, a refresh will simply not auto-resume.
  }
}

function clearActiveSession() {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch { /* nothing to do */ }
}

async function resumeAfterRefresh() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
  } catch {
    saved = null;
  }
  if (!saved || !saved.sessionId) return;

  // Only resume a trip that was active moments ago. Opening the page days later should not start tracking.
  if (Date.now() - saved.lastActiveAt > RESUME_WINDOW_MS) {
    clearActiveSession();
    setMessage("Your previous tracking session ended when the page was closed. Press Start Tracking to begin a new trip.");
    return;
  }

  let permission = "prompt";
  try {
    permission = (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    // Permissions API not supported; ask the user to press Start instead.
  }
  if (permission === "granted") {
    await startTracking({ resumeSessionId: saved.sessionId });
  } else {
    clearActiveSession();
    setMessage("Tracking stopped when the page reloaded. Press Start Tracking to continue.", "warning");
  }
}

/* ===================================================================
   7. Map
   =================================================================== */
const mapView = {
  map: null,
  tileLayer: null,
  routeLayer: null,
  latestMarker: null,
  accuracyCircle: null,
  startMarker: null,
  tilesLoadedOnce: false,
  tileErrors: 0,
  loadTimeoutId: null
};

function initMap() {
  if (typeof L === "undefined") {
    showMapOverlay("The map could not load (check your internet connection). Tracking and history still work.", true);
    elements.recenter.disabled = true;
    elements.fit.disabled = true;
    return;
  }

  mapView.map = L.map("map", { zoomControl: true, worldCopyJump: true }).setView([9.08, 8.68], 6); // Nigeria
  mapView.routeLayer = L.layerGroup().addTo(mapView.map);
  setMapStyle(app.settings.mapStyle);

  // Dragging the map yourself turns follow mode off so you can explore freely.
  mapView.map.on("dragstart", () => {
    if (app.settings.follow) {
      setFollow(false);
      setMessage("Follow mode paused so you can explore the map. Turn Follow back on to track your position.");
    }
  });
}

function setMapStyle(styleName) {
  if (!mapView.map) return;
  const style = MAP_STYLES[styleName] || MAP_STYLES.street;
  if (mapView.tileLayer) mapView.map.removeLayer(mapView.tileLayer);

  mapView.tilesLoadedOnce = false;
  mapView.tileErrors = 0;
  showMapOverlay("Loading map…");
  hideMapAlert();

  mapView.tileLayer = L.tileLayer(style.url, style.options).addTo(mapView.map);
  // Leaflet fires "load" even when every tile failed, so only a real "tileload" hides the loading overlay.
  mapView.tileLayer.on("tileload", () => {
    if (!mapView.tilesLoadedOnce) {
      mapView.tilesLoadedOnce = true;
      clearTimeout(mapView.loadTimeoutId);
      hideMapOverlay();
    }
  });
  mapView.tileLayer.on("loading", () => { mapView.tileErrors = 0; });
  mapView.tileLayer.on("load", () => {
    if (mapView.tilesLoadedOnce && mapView.tileErrors === 0) hideMapAlert();
  });
  mapView.tileLayer.on("tileerror", () => {
    mapView.tileErrors += 1;
    if (!mapView.tilesLoadedOnce) {
      showMapOverlay("Map tiles could not be loaded. Check your internet connection. Tracking and history still work.", true);
    } else {
      showMapAlert(navigator.onLine ? "Some map tiles failed to load." : "You are offline — some map areas are unavailable.");
    }
  });

  clearTimeout(mapView.loadTimeoutId);
  mapView.loadTimeoutId = setTimeout(() => {
    if (!mapView.tilesLoadedOnce) {
      showMapOverlay("The map is taking a long time to load. Check your internet connection. Tracking and history still work.", true);
    }
  }, 15000);
}

function showMapOverlay(text, isError = false) {
  elements.mapOverlayText.textContent = text;
  elements.mapOverlay.classList.toggle("is-error", isError);
  elements.mapOverlay.hidden = false;
}
function hideMapOverlay() { elements.mapOverlay.hidden = true; }
function showMapAlert(text) { elements.mapAlert.textContent = text; elements.mapAlert.hidden = false; }
function hideMapAlert() { elements.mapAlert.hidden = true; }

// Reads a colour from the stylesheet so the map uses the same tokens as the rest of the page.
function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function markerIcon(className) {
  return L.divIcon({ className, html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] });
}

function drawMap(trips) {
  if (!mapView.map) return;
  mapView.routeLayer.clearLayers();
  [mapView.latestMarker, mapView.accuracyCircle, mapView.startMarker].forEach((layer) => {
    if (layer) mapView.map.removeLayer(layer);
  });
  mapView.latestMarker = mapView.accuracyCircle = mapView.startMarker = null;

  const latestRecord = app.history[app.history.length - 1];
  const currentTrip = latestRecord ? trips.find((trip) => trip.sessionId === latestRecord.sessionId) : null;

  trips.forEach((trip) => {
    const isCurrent = trip === currentTrip;
    trip.lines.forEach((line) => {
      if (line.length < 2) return;
      L.polyline(line.map(toLatLng), {
        color: cssColor(isCurrent ? "--accent" : "--old-route"),
        weight: isCurrent ? 5 : 3,
        opacity: isCurrent ? 0.95 : 0.6,
        lineJoin: "round",
        interactive: false
      }).addTo(mapView.routeLayer);
    });
    trip.gaps.forEach((gap) => {
      L.polyline([toLatLng(gap.from), toLatLng(gap.to)], {
        // Dark dashes on the light street map, light dashes on the dark map.
        color: app.settings.mapStyle === "dark" ? "#cbd5e1" : "#334155",
        weight: 3,
        opacity: 0.9,
        dashArray: "2 9",
        lineCap: "round"
      })
        .bindTooltip(describeGap(gap), { sticky: true })
        .addTo(mapView.routeLayer);
    });
  });

  // Start marker: first reliable point of the latest trip.
  const firstReliable = currentTrip && currentTrip.records.find(isReliable);
  if (firstReliable) {
    mapView.startMarker = L.marker(toLatLng(firstReliable), { icon: markerIcon("marker-start"), keyboard: false, title: "Trip start" })
      .bindPopup(`<strong>Trip start</strong><br>${formatDateTime(firstReliable.timestamp)}`)
      .addTo(mapView.map);
  }

  if (latestRecord) {
    const flagged = !isReliable(latestRecord);
    mapView.accuracyCircle = L.circle(toLatLng(latestRecord), {
      radius: latestRecord.accuracy,
      color: cssColor(flagged ? "--warning" : "--accent"),
      fillColor: cssColor(flagged ? "--warning" : "--accent"),
      fillOpacity: 0.1,
      weight: 1,
      dashArray: flagged ? "4 6" : null,
      interactive: false
    }).addTo(mapView.map);
    mapView.latestMarker = L.marker(toLatLng(latestRecord), {
      icon: markerIcon(`marker-latest${flagged ? " is-flagged" : ""}`),
      title: "Latest saved position",
      zIndexOffset: 1000
    })
      .bindPopup(
        `<strong>Latest saved position</strong><br>${formatDateTime(latestRecord.timestamp)}<br>Accuracy ${formatAccuracy(latestRecord.accuracy)}` +
          (flagged ? "<br><em>Flagged — see details panel</em>" : "")
      )
      .addTo(mapView.map);
  }

  elements.recenter.disabled = !latestRecord;
  elements.fit.disabled = app.history.length === 0;
}

function describeGap(gap) {
  if (gap.reason === "jump") return "Route break: the position jumped too far to connect. The path in between is unknown.";
  return `Gap: no location recorded for ${formatDuration(gap.durationMs)}. The path in between is unknown.`;
}

function toLatLng(record) { return [record.latitude, record.longitude]; }

function recenterOnLatest() {
  const latest = app.history[app.history.length - 1];
  if (!mapView.map || !latest) return;
  mapView.map.setView(toLatLng(latest), Math.max(mapView.map.getZoom(), 16));
}

function fitRoute() {
  if (!mapView.map || app.history.length === 0) return;
  const reliable = app.history.filter(isReliable);
  const points = (reliable.length ? reliable : app.history).map(toLatLng);
  if (points.length === 1) {
    mapView.map.setView(points[0], 16);
  } else {
    mapView.map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 });
  }
}

function followLatest() {
  if (app.settings.follow) recenterOnLatest();
}

function setFollow(enabled) {
  app.settings.follow = enabled;
  elements.followToggle.checked = enabled;
  saveSettings();
  if (enabled) followLatest();
}

function focusRecord(record) {
  if (!mapView.map) return;
  setFollow(false);
  mapView.map.setView(toLatLng(record), Math.max(mapView.map.getZoom(), 16));
  L.popup()
    .setLatLng(toLatLng(record))
    .setContent(`${formatDateTime(record.timestamp)}<br>Accuracy ${formatAccuracy(record.accuracy)}${isReliable(record) ? "" : "<br><em>Flagged point</em>"}`)
    .openOn(mapView.map);
}

/* ===================================================================
   8. Rendering
   =================================================================== */
function renderAll() {
  const trips = buildTrips(app.history);
  renderTrackingState();
  renderLatestLocation();
  renderStats(trips);
  renderHistory(trips);
  renderLiveStatus();
  renderSyncStatus();
  renderTrip();
  drawMap(trips);
}

function renderTrackingState() {
  const labels = { idle: "Not tracking", starting: "Starting…", active: "Tracking active" };
  const isActive = tracker.status === "active";
  elements.trackingState.textContent = labels[tracker.status];
  elements.trackingPill.classList.toggle("is-active", isActive);
  elements.statStatus.textContent = labels[tracker.status];
  // One action at a time: Start while idle, Stop while tracking.
  elements.start.disabled = tracker.status !== "idle";
  elements.start.hidden = isActive;
  elements.stop.disabled = !isActive;
  elements.stop.hidden = !isActive;
  // During a trip, tracking is started, paused and stopped from the Trip Mode card.
  if (typeof tripIsOpen === "function" && tripIsOpen()) {
    elements.start.hidden = true;
    elements.stop.hidden = true;
    elements.intervalSelect.disabled = true;
  } else {
    elements.intervalSelect.disabled = false;
  }
}

// Location states shown under the tracking controls: available, waiting for a first fix,
// no recent GPS fix, temporary GPS problems, permission denied, or not tracking.
function renderLiveStatus() {
  const signal = elements.gpsSignal;
  signal.classList.remove("is-live", "is-waiting", "is-weak", "is-denied");

  if (tracker.status !== "active") {
    elements.nextReading.textContent = "Stopped";
    if (app.locationPermission === "denied") {
      signal.classList.add("is-denied");
      elements.gpsSignalText.textContent = "Location permission denied. Allow location for this site in your browser settings.";
    } else if (!navigator.geolocation) {
      signal.classList.add("is-denied");
      elements.gpsSignalText.textContent = "This browser cannot provide location.";
    } else {
      elements.gpsSignalText.textContent = "Location: not tracking";
    }
    renderCondition();
    return;
  }

  if (tracker.tickRunning) {
    elements.nextReading.textContent = "Taking reading…";
  } else {
    elements.nextReading.textContent = `Next reading in ${formatCountdown(tracker.nextDueAt - Date.now())}`;
  }

  const fix = tracker.latestFix;
  const ageMs = fix ? Date.now() - fix.receivedAt : Infinity;
  if (tracker.lastLiveError) {
    signal.classList.add("is-weak");
    const reasons = { timeout: "GPS slow to respond — retrying", unavailable: "GPS position unavailable — retrying", invalid: "GPS returned an invalid position — ignored" };
    elements.gpsSignalText.textContent = reasons[tracker.lastLiveError];
  } else if (!fix) {
    signal.classList.add("is-waiting");
    elements.gpsSignalText.textContent = "Waiting for the first GPS fix…";
  } else if (ageMs > NO_RECENT_FIX_MS) {
    signal.classList.add("is-weak");
    elements.gpsSignalText.textContent = `No recent GPS fix: the last one was ${formatDuration(ageMs)} ago.`;
  } else {
    const age = Math.round(ageMs / 1000);
    signal.classList.add(fix.accuracy > LOW_ACCURACY_METERS ? "is-weak" : "is-live");
    elements.gpsSignalText.textContent = `Location available ${formatAccuracy(fix.accuracy)} · updated ${age < 2 ? "just now" : `${age} s ago`}`;
  }
  renderCondition();
}

async function watchLocationPermission() {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    app.locationPermission = status.state;
    status.addEventListener("change", () => {
      app.locationPermission = status.state;
      renderLiveStatus();
    });
  } catch {
    app.locationPermission = "unknown"; // Permissions API not available
  }
  renderLiveStatus();
}

function renderLatestLocation() {
  const latest = app.history[app.history.length - 1];
  if (!latest) {
    elements.latitude.textContent = "—";
    elements.longitude.textContent = "—";
    elements.accuracy.textContent = "—";
    elements.lastUpdate.textContent = "No locations yet";
    elements.locationName.textContent = "—";
    elements.locationFlag.hidden = true;
    return;
  }
  elements.latitude.textContent = formatCoordinate(latest.latitude);
  elements.longitude.textContent = formatCoordinate(latest.longitude);
  elements.accuracy.textContent = formatAccuracy(latest.accuracy);
  elements.lastUpdate.textContent = formatDateTime(latest.timestamp);
  elements.locationFlag.textContent = describeFlags(latest);
  elements.locationFlag.hidden = isReliable(latest);
  elements.locationName.textContent = isReliable(latest)
    ? app.locationNameText || "Not looked up yet"
    : "Not looked up for flagged points";
}

function renderStats(trips) {
  const latest = app.history[app.history.length - 1];
  const currentSessionId = tracker.sessionId || (latest && latest.sessionId);
  const trip = trips.find((item) => item.sessionId === currentSessionId);

  elements.statInterval.textContent = formatInterval(app.settings.intervalMs);
  elements.statTotal.textContent = app.history.length.toLocaleString();
  elements.statTripPoints.textContent = trip ? trip.records.length.toLocaleString() : "0";
  elements.statDistance.textContent = formatDistance(trip ? trip.distanceMeters : 0);
  elements.intervalSelect.value = String(app.settings.intervalMs);
}

function renderHistory(trips) {
  const list = elements.historyList;
  list.replaceChildren();
  const total = app.history.length;
  elements.historyCount.textContent = `${total.toLocaleString()} saved point${total === 1 ? "" : "s"}${app.storageReady ? "" : " (not stored)"}`;
  elements.clear.disabled = total === 0;

  if (total === 0) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "No saved points yet. Start tracking to build your history.";
    list.append(empty);
    elements.historyMore.hidden = true;
    return;
  }

  // Gaps keyed by the record that comes after the gap.
  const gapsBefore = new Map();
  trips.forEach((trip) => trip.gaps.forEach((gap) => gapsBefore.set(gap.to.id, gap)));

  // Newest first, limited to the number currently shown (large histories stay fast).
  const visible = app.history.slice(-app.historyShown).reverse();
  let currentSession = null;
  let currentDay = null;

  visible.forEach((record, index) => {
    if (record.sessionId !== currentSession) {
      currentSession = record.sessionId;
      const tripRecords = trips.find((trip) => trip.sessionId === record.sessionId).records;
      const header = document.createElement("li");
      header.className = "history-session";
      header.textContent = `${record.sessionId.startsWith("imported-") ? "Imported from Phase 1" : "Trip"} · started ${formatDateTime(tripRecords[0].timestamp)}`;
      list.append(header);
      currentDay = null;
    }

    const day = formatDate(record.timestamp);
    list.append(buildHistoryItem(record, day !== currentDay));
    currentDay = day;

    // Newest-first list, so a gap before this record is shown below it.
    const gap = gapsBefore.get(record.id);
    const nextShown = visible[index + 1];
    if (gap && nextShown && nextShown.sessionId === record.sessionId) {
      const gapItem = document.createElement("li");
      gapItem.className = "history-gap";
      gapItem.textContent = describeGap(gap);
      list.append(gapItem);
    }
  });

  const remaining = total - visible.length;
  elements.historyMore.hidden = remaining <= 0;
  elements.historyMore.textContent = `Show older points (${remaining.toLocaleString()} more)`;
}

function buildHistoryItem(record, showDate) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-entry";
  button.disabled = !mapView.map;
  button.addEventListener("click", () => focusRecord(record));

  // Screen readers hear the action first, then the same details sighted users see.
  const action = document.createElement("span");
  action.className = "visually-hidden";
  action.textContent = "Show on map: ";

  const time = document.createElement("span");
  time.className = "history-time";
  time.textContent = formatTime(record.timestamp);
  if (showDate) {
    const date = document.createElement("small");
    date.textContent = formatDate(record.timestamp);
    time.append(date);
  }

  const coordinates = document.createElement("span");
  coordinates.className = "history-coordinates";
  coordinates.textContent = `${formatCoordinate(record.latitude)}, ${formatCoordinate(record.longitude)}`;

  const badges = document.createElement("span");
  badges.className = "history-badges";
  badges.append(makeBadge(formatAccuracy(record.accuracy)));
  if (record.flags.includes("low-accuracy")) badges.append(makeBadge("Low accuracy", "warning"));
  if (record.flags.includes("implausible-jump")) badges.append(makeBadge("GPS jump", "warning"));
  if (app.unsavedIds.has(record.id)) badges.append(makeBadge("Not saved on device", "warning"));
  if (sync.enabled && record.syncState === "pending") badges.append(makeBadge("Not uploaded"));
  if (record.syncState === "rejected") {
    const badge = makeBadge("Rejected by server", "danger");
    badge.title = record.syncError || "";
    badges.append(badge);
  }

  button.append(action, time, coordinates, badges);
  item.append(button);
  return item;
}

function makeBadge(text, variant = "") {
  const badge = document.createElement("span");
  badge.className = `badge${variant ? ` badge-${variant}` : ""}`;
  badge.textContent = text;
  return badge;
}

// Internet (what the device reports) and the Safe Location server (what our last request saw) separately.
function renderNetworkState() {
  const online = navigator.onLine;
  const serverDown = online && API_BASE_URL !== null && app.server === "unavailable";
  elements.networkState.textContent = !online ? "Offline" : serverDown ? "Server unavailable" : "Online";
  elements.networkPill.classList.toggle("is-online", online && !serverDown);
  elements.networkPill.classList.toggle("is-offline", !online || serverDown);
  renderCondition();
}

// The instrument's condition band: one sentence and one tone (idle, calm, attention, alert) for the
// most important thing right now. It only states facts the page already knows.
function renderCondition() {
  const panel = elements.instrument;
  if (!panel) return;
  const open = tripIsOpen();
  const tripState = trip.current ? currentTripState() : null;
  const tracking = tracker.status === "active";
  const fix = tracker.latestFix;
  const fixAge = fix ? Date.now() - fix.receivedAt : Infinity;
  const pending = account.user && account.device ? myPendingRecords().length : 0;
  const offline = !navigator.onLine;
  const serverDown = !offline && API_BASE_URL !== null && app.server === "unavailable";
  const to = open ? ` to ${trip.current.destination}` : "";

  let tone = "idle";
  let text = "Not recording: nothing is being saved or shared";
  if (sosState.view === "active") [tone, text] = ["alert", "SOS active: your trusted contacts are being alerted"];
  else if (sosState.view === "queued") [tone, text] = ["alert", "SOS waiting to be sent: it goes out when the connection returns"];
  else if (sosState.view === "countdown" || sosState.view === "sending") [tone, text] = ["alert", "Sending SOS…"];
  else if (tripState === "checkin-requested") [tone, text] = ["alert", "Check-in requested: tap \"I'm OK\" in Trip Mode"];
  else if (!app.storageReady || app.unsavedIds.size) [tone, text] = ["attention", "New points can't be saved on this device"];
  else if (app.locationPermission === "denied" && (tracking || open)) [tone, text] = ["attention", "Location permission denied: nothing is being recorded"];
  else if (tripState === "paused") [tone, text] = ["attention", `Trip${to} paused: not recording`];
  else if (tracker.status === "starting") [tone, text] = ["calm", "Starting…"];
  else if (tracking) {
    const what = open ? `Trip${to}: recording` : "Recording";
    if (offline || serverDown) [tone, text] = ["attention", `${what} offline: points wait on this phone`];
    else if (tracker.lastLiveError || (fix && fixAge > NO_RECENT_FIX_MS)) [tone, text] = ["attention", `${what}, but GPS has no recent fix`];
    else if (tripState === "delayed") [tone, text] = ["attention", `${what}: updates are reaching the server late`];
    else if (pending && sync.lastError) [tone, text] = ["attention", `${what}: ${pending.toLocaleString()} point${pending === 1 ? "" : "s"} waiting to upload`];
    else [tone, text] = ["calm", `${what} every ${formatInterval(app.settings.intervalMs)}`];
  } else if (pending) [tone, text] = ["attention", `Not recording: ${pending.toLocaleString()} point${pending === 1 ? "" : "s"} waiting to upload`];

  if (panel.dataset.tone !== tone) panel.dataset.tone = tone;
  if (elements.conditionText.textContent !== text) elements.conditionText.textContent = text; // no repeat announcements

  // Fourth readout: the trip while one is open, otherwise what is saved here.
  if (open) {
    elements.extraLabel.textContent = "Trip";
    elements.extraValue.textContent = TRIP_BADGES[tripState];
  } else {
    const total = app.history.length;
    elements.extraLabel.textContent = "Saved here";
    elements.extraValue.textContent = `${total.toLocaleString()} point${total === 1 ? "" : "s"}`;
  }
}

async function updateLocationName(point) {
  // Avoid repeatedly sending nearly identical coordinates to the lookup service.
  if (app.lastNamedPoint && distanceInMeters(app.lastNamedPoint, point) < LOCATION_NAME_MOVEMENT_THRESHOLD_METERS) return;
  if (!navigator.onLine) {
    showLocationName("Unavailable while offline");
    return;
  }

  if (app.locationNameRequest) app.locationNameRequest.abort();
  app.locationNameRequest = new AbortController();
  showLocationName("Finding location name…");

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({ format: "jsonv2", lat: point.latitude, lon: point.longitude, zoom: "18" });
    const response = await fetch(url, { signal: app.locationNameRequest.signal });
    if (!response.ok) throw new Error("Location name lookup failed");
    const result = await response.json();
    showLocationName(result.display_name || "No name available in map data for this spot");
    app.lastNamedPoint = point;
  } catch (error) {
    if (error.name !== "AbortError") showLocationName("Location name unavailable");
  }
}

function showLocationName(text) {
  app.locationNameText = text;
  const latest = app.history[app.history.length - 1];
  if (latest && isReliable(latest)) elements.locationName.textContent = text;
}

async function clearHistory() {
  if (app.history.length === 0) {
    setMessage("There is no saved history to clear.");
    return;
  }
  const serverNote = sync.enabled ? " Copies already backed up to an account are not deleted (manage them on the Account page)." : "";
  if (!window.confirm(`Permanently delete all ${app.history.length.toLocaleString()} saved location points from this browser?${serverNote}`)) return;

  try {
    if (app.storageReady) await storage.clear();
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* nothing to do */ }
  } catch (error) {
    setMessage(`History could not be cleared: ${error.message}`, "error");
    return;
  }

  app.history = [];
  app.unsavedIds.clear();
  app.historyShown = HISTORY_PAGE_SIZE;
  app.lastNamedPoint = null;
  app.locationNameText = null;
  if (tracker.status === "active") tracker.lastSavedFixTimestamp = null;
  announceHistoryChange();
  renderAll();
  setMessage(`Saved location history cleared from this browser.${sync.enabled ? " Backed-up copies in your account were kept." : ""}`, "success");
}

/* ===================================================================
   9. Account and backup (Phases 3–4)
   - An account is optional: tracking and local history work without one.
   - The sign-in session is an HttpOnly cookie handled by the server; this script never sees it.
     localStorage only keeps non-secret IDs: the signed-in user's ID and name, and this browser's
     device ID for that user.
   - Each point remembers the account that was signed in when it was recorded (`accountId`) and is
     uploaded only to that account. Points recorded while signed out are uploaded only if the person
     explicitly chooses to back them up, so one person's history never lands in someone else's account.
   - Upload rules from Phase 3 are unchanged: saved locally first, batches of 50, "synced" only after the
     server confirms, bounded exponential backoff (about 2 s … 5 min), and no duplicates thanks to unique IDs.
   =================================================================== */
const account = {
  status: "unknown", // "unknown" | "offline" | "signed-out" | "signed-in"
  expired: false, // the server said the session ended while this page was open
  user: null, // { id, name }
  device: null // { id, name }: this browser, registered to `user`
};

const sync = {
  enabled: Boolean(API_BASE_URL),
  running: false,
  rerun: false,
  timerId: null,
  attempt: 0,
  nextRetryAt: 0,
  lastError: null, // { message, permanent }
  lastSuccessAt: null
};

class SyncError extends Error {
  constructor(message, { permanent = false, retryAfterMs = 0, paused = false } = {}) {
    super(message);
    this.permanent = permanent; // a setting or server problem: retry slowly (every 5 minutes)
    this.retryAfterMs = retryAfterMs; // the server asked us to wait at least this long
    this.paused = paused; // needs the person to act (sign in, register): no automatic retry
  }
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional */ }
}
function removeKey(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to do */ }
}

const deviceKey = (userId) => `${DEVICE_KEY_PREFIX}${userId}`;

// Which account new points belong to: only one confirmed by the server on this page load
// (or remembered from it while the connection is down).
function recordOwner() {
  return account.user && (account.status === "signed-in" || account.status === "offline") ? account.user.id : null;
}

const myPendingRecords = () =>
  account.user ? app.history.filter((record) => record.syncState === "pending" && record.accountId === account.user.id) : [];
const unclaimedRecords = () => app.history.filter((record) => !record.accountId);
const otherAccountRecords = () => app.history.filter((record) => record.accountId && (!account.user || record.accountId !== account.user.id));

// The browser's own timeout (AbortSignal.timeout) is used when available: it runs on real time,
// independent of the page's timers.
function requestTimeoutSignal() {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS), clear: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function apiFetch(url, { method = "GET", body } = {}) {
  const timeout = requestTimeoutSignal();
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: timeout.signal
    });
    noteServer(response.status >= 500 ? "unavailable" : "ok");
    return response;
  } catch {
    if (navigator.onLine) noteServer("unavailable");
    // Without a third-party check we cannot tell a broken internet link from a down server, so say both.
    throw new SyncError(navigator.onLine ? "The server could not be reached (the server or the internet connection may be down)." : "You are offline.");
  } finally {
    timeout.clear();
  }
}

let serverProbeTimer = null;
function noteServer(state) {
  if (app.server === state) return;
  app.server = state;
  renderNetworkState();
  clearTimeout(serverProbeTimer);
  if (state === "unavailable") serverProbeTimer = setTimeout(probeServer, SERVER_PROBE_MS);
}

// While the server is unreachable, check it now and then so the status (and uploads) recover by themselves.
async function probeServer() {
  if (!navigator.onLine) {
    serverProbeTimer = setTimeout(probeServer, SERVER_PROBE_MS);
    return;
  }
  try {
    await apiFetch(`${API_BASE_URL}/health`);
  } catch {
    /* still unavailable: noteServer has not changed, so schedule the next check */
  }
  if (app.server === "unavailable") {
    serverProbeTimer = setTimeout(probeServer, SERVER_PROBE_MS);
    return;
  }
  await checkSession();
  renderAll();
  runSync();
  loadSosStatus();
  await processTripQueue();
  refreshTripFromServer();
}

// Asks the server who is signed in (the cookie is sent automatically).
async function checkSession() {
  if (!sync.enabled) return;
  let response;
  try {
    response = await apiFetch(`${AUTH_BASE_URL}/get-session`);
    // Rate limited or a server error says nothing about who is signed in: treat it like an outage,
    // never as "signed out" (which would forget the account and pause uploads for no reason).
    if (response.status === 429 || response.status >= 500) throw new SyncError("Temporary server problem.");
  } catch {
    account.status = "offline";
    account.user = readJson(ACCOUNT_CACHE_KEY);
    account.device = account.user ? readJson(deviceKey(account.user.id)) : null;
    sync.lastSuccessAt = account.user ? readJson(`${LAST_SYNC_KEY_PREFIX}${account.user.id}`) : null;
    return;
  }
  let data = null;
  try { data = await response.json(); } catch { /* not signed in */ }
  if (response.ok && data && data.user) {
    account.status = "signed-in";
    account.expired = false;
    account.user = { id: data.user.id, name: data.user.name };
    account.device = readJson(deviceKey(data.user.id));
    sync.lastSuccessAt = readJson(`${LAST_SYNC_KEY_PREFIX}${data.user.id}`);
    writeJson(ACCOUNT_CACHE_KEY, account.user);
  } else {
    markSignedOut(false);
  }
}

function markSignedOut(expired) {
  account.status = "signed-out";
  account.expired = expired;
  account.user = null;
  account.device = null;
  sync.lastSuccessAt = null;
  removeKey(ACCOUNT_CACHE_KEY);
}

function errorFromResponse(response, action) {
  const retryAfterSeconds = Number(response.headers.get("Retry-After"));
  const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
  if ([408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
    return new SyncError(`The server had a temporary problem (${response.status}).`, { retryAfterMs });
  }
  if (response.status === 404) {
    return new SyncError("No backup server was found at this address. Start the site with npm run dev.", { permanent: true });
  }
  return new SyncError(`The server refused the ${action} (${response.status}).`, { permanent: true });
}

async function readErrorCode(response) {
  try { return (await response.json()).error.code; } catch { return null; }
}

// Registers this browser as one of the signed-in user's devices.
async function registerDevice(name, claimExisting) {
  let response;
  try {
    response = await apiFetch(`${API_BASE_URL}/devices`, { method: "POST", body: { name } });
  } catch (error) {
    return { ok: false, message: error.message };
  }
  if (response.status === 401) {
    markSignedOut(true);
    return { ok: false, message: "Your session has ended. Sign in again." };
  }
  if (!response.ok) {
    let message = "This browser could not be registered. Try again.";
    try { message = (await response.json()).error.message || message; } catch { /* keep default */ }
    return { ok: false, message };
  }
  const { device } = await response.json();
  account.device = { id: device.id, name: device.name };
  writeJson(deviceKey(account.user.id), account.device);
  if (claimExisting) await claimUnclaimedRecords();
  return { ok: true };
}

// Points recorded while signed out (or before accounts existed) join this account only on request.
async function claimUnclaimedRecords() {
  if (!account.user) return 0;
  const records = unclaimedRecords();
  records.forEach((record) => Object.assign(record, { accountId: account.user.id, syncState: "pending", syncError: null }));
  if (app.storageReady && records.length) {
    try {
      await storage.updateRecordState(records);
      announceHistoryChange();
    } catch { /* kept in memory for this session */ }
  }
  return records.length;
}

// Only the fields the server needs. Device times are sent as-is; the server treats them as untrusted.
function toApiRecord(record) {
  return {
    id: record.id,
    sessionId: record.sessionId,
    latitude: record.latitude,
    longitude: record.longitude,
    accuracy: record.accuracy,
    deviceTimestamp: record.timestamp,
    deviceRecordedAt: record.recordedAt ?? null,
    intervalMs: record.intervalMs ?? null,
    flags: record.flags
  };
}

async function uploadBatch(batch) {
  const response = await apiFetch(`${API_BASE_URL}/locations/batch`, {
    method: "POST",
    body: { deviceId: account.device.id, accountId: account.user.id, records: batch.map(toApiRecord) }
  });

  if (response.status === 409 && (await readErrorCode(response)) === "account_mismatch") {
    // Someone else signed in on this browser (e.g. in another tab). Never upload into their account.
    await checkSession();
    throw new SyncError(
      "A different account is now signed in on this browser. Points recorded for the previous account stay on this device and are not uploaded here.",
      { paused: true }
    );
  }
  if (response.status === 401) {
    markSignedOut(true);
    throw new SyncError("Your session has ended. Sign in again to resume backup. Points stay on this device.", { paused: true });
  }
  if (response.status === 404 && (await readErrorCode(response)) === "device_not_found") {
    removeKey(deviceKey(account.user.id));
    account.device = null;
    throw new SyncError("This browser is no longer registered to your account. Register it again to resume backup.", { paused: true });
  }
  if (!response.ok) throw errorFromResponse(response, "upload");

  let result;
  try {
    result = await response.json();
  } catch {
    throw new SyncError("The server sent an unreadable reply.");
  }
  if (!result || !Array.isArray(result.accepted) || !Array.isArray(result.duplicates) || !Array.isArray(result.rejected)) {
    throw new SyncError("The server sent an unexpected reply.");
  }

  // Trust only IDs we actually sent.
  const sentIds = new Set(batch.map((record) => record.id));
  const confirmed = new Set([...result.accepted, ...result.duplicates].filter((id) => sentIds.has(id)));
  const rejected = new Map(
    result.rejected.filter((item) => item && sentIds.has(item.id)).map((item) => [item.id, String(item.reason || "Rejected by the server.")])
  );
  if (confirmed.size + rejected.size === 0) throw new SyncError("The server did not confirm any points.");
  if (confirmed.size) {
    sync.lastSuccessAt = Date.now();
    writeJson(`${LAST_SYNC_KEY_PREFIX}${account.user.id}`, sync.lastSuccessAt);
  }

  // Apply to the records in memory now (history may have been reloaded or cleared while we waited).
  const now = Date.now();
  const changed = [];
  app.history.forEach((record) => {
    if (confirmed.has(record.id)) Object.assign(record, { syncState: "synced", syncedAt: now, syncError: null });
    else if (rejected.has(record.id)) Object.assign(record, { syncState: "rejected", syncError: rejected.get(record.id) });
    else return;
    changed.push(record);
  });

  if (app.storageReady && changed.length) {
    try {
      await storage.updateRecordState(changed);
      announceHistoryChange();
    } catch {
      // The server has them; if this browser forgets they were uploaded, the next upload reports duplicates.
    }
  }
}

function withSyncLock(work) {
  if (!navigator.locks) return work();
  return navigator.locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, (lock) => (lock ? work() : "busy"));
}

const canUpload = () => sync.enabled && account.status === "signed-in" && account.user && account.device;

async function runSync() {
  if (!canUpload()) {
    renderSyncStatus();
    return;
  }
  if (sync.running) {
    sync.rerun = true;
    return;
  }
  clearTimeout(sync.timerId);
  sync.timerId = null;

  if (myPendingRecords().length === 0) {
    renderSyncStatus();
    return;
  }
  if (!navigator.onLine) {
    // No retries while offline (saves data and battery); the "online" event restarts uploading.
    sync.lastError = { message: "Offline. Points will upload when the connection returns.", permanent: false };
    renderSyncStatus();
    return;
  }

  sync.running = true;
  renderSyncStatus();
  try {
    const outcome = await withSyncLock(async () => {
      for (let round = 0; round < 1000; round += 1) {
        if (!canUpload()) return "done";
        const batch = myPendingRecords().slice(0, SYNC_BATCH_SIZE);
        if (batch.length === 0) return "done";
        await uploadBatch(batch);
      }
      return "done";
    });
    if (outcome === "busy") {
      sync.timerId = setTimeout(() => { sync.timerId = null; runSync(); }, 30000); // another tab is uploading
    } else {
      sync.attempt = 0;
      sync.lastError = null;
    }
  } catch (error) {
    const syncError = error instanceof SyncError ? error : new SyncError("Unexpected upload problem.");
    if (syncError.paused) {
      sync.attempt = 0;
      sync.lastError = { message: syncError.message, permanent: true };
    } else {
      scheduleSyncRetry(syncError);
    }
  } finally {
    sync.running = false;
    renderSyncStatus();
    renderHistory(buildTrips(app.history));
    renderTrip(); // the trip card shows what is still waiting to upload
    if (sync.rerun) {
      sync.rerun = false;
      if (!sync.timerId) runSync();
    }
  }
}

function scheduleSyncRetry(error) {
  sync.attempt += 1;
  const exponential = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** (sync.attempt - 1));
  const jittered = Math.min(SYNC_RETRY_MAX_MS, exponential * (0.8 + Math.random() * 0.4)); // ±20% so devices don't retry in lockstep
  let delay = error.permanent ? SYNC_RETRY_MAX_MS : jittered;
  if (error.retryAfterMs) delay = Math.min(SYNC_RETRY_MAX_MS, Math.max(delay, error.retryAfterMs));

  sync.lastError = { message: error.message, permanent: error.permanent };
  sync.nextRetryAt = Date.now() + delay;
  sync.timerId = setTimeout(() => {
    sync.timerId = null;
    runSync();
  }, delay);
}

// Called after a new point is saved. Respects a scheduled retry instead of hammering a failing server.
function requestSync() {
  if (!sync.timerId) runSync();
}

function defaultDeviceName() {
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iPhone" : /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "Mac" : /Linux/.test(agent) ? "Linux" : "this device";
  return `${browser} on ${system}`;
}

function setPill(state, text) {
  const pill = elements.syncPill;
  pill.classList.remove("is-online", "is-offline", "is-active", "is-error");
  if (state) pill.classList.add(state);
  elements.syncState.textContent = text;
}

function showBackupPanel(name) {
  ["off", "checking", "signedOut", "register", "active"].forEach((key) => { elements.backup[key].hidden = key !== name; });
}

// The "Backup and sync" status block: connection, synchronization, last confirmed upload, storage.
function renderSyncOverview() {
  const block = elements.syncOverview;
  block.list.hidden = !sync.enabled;
  if (!sync.enabled) {
    block.syncNow.hidden = true;
    return;
  }
  const set = (node, text, tone) => {
    node.textContent = text;
    node.className = tone ? `status-${tone}` : "";
  };

  if (!navigator.onLine) set(block.connection, "Internet unavailable", "warning");
  else if (app.server === "unavailable") set(block.connection, "Server unavailable", "warning");
  else if (app.server === "ok") set(block.connection, "Online, server reachable", "success");
  else set(block.connection, "Online", "");

  const waitingHere = app.history.filter((record) => record.syncState === "pending").length;
  const mine = myPendingRecords().length;
  const plural = (n) => `${n.toLocaleString()} point${n === 1 ? "" : "s"}`;
  if (account.status === "unknown") set(block.sync, "Checking…", "");
  else if (account.status === "signed-out" || !account.user) {
    set(block.sync, waitingHere ? `Paused: sign in to upload ${plural(waitingHere)} waiting on this device` : "Not signed in: points stay on this device", waitingHere ? "warning" : "");
  } else if (!account.device) set(block.sync, "Paused: register this browser to upload", "warning");
  else if (sync.running) set(block.sync, `Uploading ${plural(mine)}…`, "");
  else if (mine === 0) set(block.sync, "Synchronization complete", "success");
  else if (sync.lastError && sync.lastError.permanent) set(block.sync, `Synchronization pending: ${plural(mine)} (paused, see below)`, "danger");
  else set(block.sync, `Synchronization pending: ${plural(mine)}`, "warning");

  block.lastSync.textContent = sync.lastSuccessAt ? formatDateTime(sync.lastSuccessAt) : account.user ? "Never on this device" : "—";

  let storageText = null;
  let storageTone = "warning";
  if (app.unsavedIds.size) {
    storageText = `${plural(app.unsavedIds.size)} kept only in memory (not saved on the device)`;
    storageTone = "danger";
  } else if (!app.storageReady) {
    storageText = "Unavailable: new points can't be saved on this device";
    storageTone = "danger";
  } else if (app.storageWarning) {
    storageText = app.storageWarning;
  }
  block.storageRow.hidden = !storageText;
  if (storageText) set(block.storage, storageText, storageTone);

  block.syncNow.hidden = !(account.user && account.device && account.status !== "signed-out");
  block.syncNow.disabled = sync.running;
  block.syncNow.textContent = sync.running ? "Syncing…" : "Sync now";
}

// Manual "Sync now": skips any waiting retry, re-checks the account, retries unsaved points, uploads.
async function syncNow() {
  if (!navigator.onLine) {
    setMessage("No internet connection. Your points are queued on this device and upload automatically when you're back online.", "warning");
    return;
  }
  elements.syncOverview.syncNow.disabled = true;
  await persistUnsavedRecords();
  await checkSession(); // also notices if a different account signed in from another tab
  sync.attempt = 0;
  clearTimeout(sync.timerId);
  sync.timerId = null;
  await runSync();
  const pending = myPendingRecords().length;
  if (account.status !== "signed-in") setMessage("You're not signed in, so nothing could be uploaded. Your points stay on this device.", "warning");
  else if (!account.device) setMessage("Register this browser in the Backup card to upload its points.", "warning");
  else if (pending === 0) setMessage(`Synchronization complete. Everything is confirmed by the server${sync.lastSuccessAt ? ` (last upload ${formatTime(sync.lastSuccessAt)})` : ""}.`, "success");
  else setMessage(`${pending.toLocaleString()} point${pending === 1 ? "" : "s"} still waiting. ${sync.lastError ? sync.lastError.message : "It will be retried automatically."}`, "warning");
  renderAll();
}

function renderSyncStatus() {
  renderSyncOverview();
  document.querySelectorAll("[data-needs-server]").forEach((node) => { node.hidden = !sync.enabled; });
  renderCondition();
  const pending = myPendingRecords().length;
  const unclaimed = unclaimedRecords().length;
  const others = otherAccountRecords().length;
  const rejected = app.history.filter((record) => record.syncState === "rejected" && account.user && record.accountId === account.user.id).length;

  // Header account link.
  const link = elements.accountLink;
  if (!sync.enabled) {
    link.hidden = true;
  } else if (account.user && account.status !== "signed-out") {
    link.hidden = false;
    link.textContent = account.user.name.length > 18 ? `${account.user.name.slice(0, 17)}…` : account.user.name;
    link.href = "/account";
    link.setAttribute("aria-label", `Your account (${account.user.name})`);
  } else {
    link.hidden = false;
    link.textContent = "Sign in";
    link.href = "/signin";
    link.removeAttribute("aria-label");
  }

  if (!sync.enabled) {
    setPill(null, "This device only");
    showBackupPanel("off");
    return;
  }
  if (account.status === "unknown") {
    setPill(null, "Checking…");
    showBackupPanel("checking");
    return;
  }
  if (account.status === "signed-out" || (account.status === "offline" && !account.user)) {
    setPill(account.expired ? "is-offline" : null, account.expired ? "Signed out" : "Not backed up");
    elements.backup.signedOutText.textContent = account.expired
      ? "Your session has ended. Sign in again to resume backup. Everything recorded meanwhile stays safe on this device."
      : account.status === "offline"
        ? "You're offline. Your history is saved on this device."
        : "Your history is saved only in this browser. Create a free account to back it up.";
    showBackupPanel("signedOut");
    return;
  }
  if (!account.device) {
    setPill("is-offline", "Not backed up");
    elements.backup.claimRow.hidden = unclaimed === 0;
    elements.backup.claimLabel.textContent = `Also back up the ${unclaimed.toLocaleString()} point${unclaimed === 1 ? "" : "s"} already saved in this browser`;
    if (!elements.backup.nameInput.value) elements.backup.nameInput.value = defaultDeviceName();
    showBackupPanel("register");
    return;
  }

  showBackupPanel("active");
  elements.backup.deviceName.textContent = account.device.name;

  let detail;
  if (sync.running) {
    setPill("is-active", "Uploading…");
    detail = `Uploading ${pending.toLocaleString()} point${pending === 1 ? "" : "s"}…`;
  } else if (pending === 0) {
    setPill("is-online", "All uploaded");
    detail = sync.lastSuccessAt ? `Everything is backed up. Last upload at ${formatTime(sync.lastSuccessAt)}.` : "Everything recorded under your account is backed up.";
  } else {
    setPill(sync.lastError && sync.lastError.permanent ? "is-error" : "is-offline", `${pending.toLocaleString()} waiting`);
    const retry = sync.timerId ? ` Next try at ${formatTime(sync.nextRetryAt)}.` : "";
    detail = `${sync.lastError ? sync.lastError.message : "Waiting to upload."}${retry} Points stay safe on this device until the server confirms them.`;
  }
  if (rejected) detail += ` ${rejected.toLocaleString()} point${rejected === 1 ? " was" : "s were"} rejected by the server (see history).`;
  elements.statSync.textContent = detail;

  elements.backup.claimButton.hidden = unclaimed === 0;
  elements.backup.claimButton.textContent = `Back up ${unclaimed.toLocaleString()} point${unclaimed === 1 ? "" : "s"} recorded while signed out`;
  elements.backup.othersNote.hidden = others === 0;
  elements.backup.othersNote.textContent = `${others.toLocaleString()} point${others === 1 ? "" : "s"} in this browser belong${others === 1 ? "s" : ""} to another account and won't be uploaded here.`;
}

function bindBackupEvents() {
  elements.backup.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.backup.nameInput.value.trim();
    if (!name) {
      elements.backup.formMessage.textContent = "Give this browser a name, for example \"My phone\".";
      return;
    }
    const button = elements.backup.form.querySelector("button[type=submit]");
    button.disabled = true;
    elements.backup.formMessage.textContent = "Registering…";
    const result = await registerDevice(name, elements.backup.claimCheckbox.checked);
    button.disabled = false;
    elements.backup.formMessage.textContent = result.ok ? "" : result.message;
    renderAll();
    if (result.ok) runSync();
  });

  elements.backup.claimButton.addEventListener("click", async () => {
    const count = unclaimedRecords().length;
    if (!window.confirm(`Upload the ${count.toLocaleString()} point${count === 1 ? "" : "s"} recorded in this browser while nobody was signed in to your account?`)) return;
    await claimUnclaimedRecords();
    renderAll();
    runSync();
  });
}

// Phase 3 kept a device token in localStorage. Accounts replace it, so remove it.
function removeLegacyDeviceToken() {
  removeKey(LEGACY_DEVICE_TOKEN_KEY);
}

/* ===================================================================
   10. Emergency SOS (Phase 5)
   - Pressing SOS starts a 5-second countdown (Send now / Cancel) so a mistaken tap can be stopped.
   - A fresh GPS fix is requested at once; if none arrives in time, the last known location is sent
     with its age and accuracy, or no location at all. Nothing is invented.
   - Battery and connection details are included only when this browser actually provides them.
   - The event ID is created here, so retries after a dropped connection never create a second SOS.
     An SOS that could not be sent is kept on this device and retried until it goes through.
   - Safe Location never calls emergency services. The card always offers "Call 112".
   =================================================================== */
const SOS_COUNTDOWN_SECONDS = 5;
const SOS_FRESH_FIX_TIMEOUT_MS = 10000;
const SOS_WAIT_FOR_FIX_MS = 6000; // after the countdown, wait at most this long for the fresh fix
const SOS_POLL_MS = 4000;
const SOS_PENDING_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PENDING_SOS_KEY = "safe-location-pending-sos"; // an SOS waiting for a connection (not a secret)

const sosState = {
  view: "unavailable", // unavailable | ready | countdown | sending | queued | active
  contacts: 0,
  channels: [],
  simulated: true,
  secondsLeft: 0,
  countdownTimer: null,
  fixPromise: null,
  event: null,
  pollTimer: null,
  retryTimer: null,
  retryAttempt: 0,
  message: ""
};

const sosEl = {
  card: document.querySelector("#sos-card"),
  panels: {
    unavailable: document.querySelector("#sos-unavailable"),
    ready: document.querySelector("#sos-ready"),
    countdown: document.querySelector("#sos-countdown"),
    sending: document.querySelector("#sos-sending"),
    queued: document.querySelector("#sos-queued"),
    active: document.querySelector("#sos-active")
  },
  unavailableText: document.querySelector("#sos-unavailable-text"),
  readyText: document.querySelector("#sos-ready-text"),
  readyShort: document.querySelector("#sos-ready-short"),
  button: document.querySelector("#sos-button"),
  seconds: document.querySelector("#sos-seconds"),
  fixStatus: document.querySelector("#sos-fix-status"),
  sendNow: document.querySelector("#sos-send-now"),
  abort: document.querySelector("#sos-abort"),
  queuedText: document.querySelector("#sos-queued-text"),
  queuedCancel: document.querySelector("#sos-queued-cancel"),
  activeSince: document.querySelector("#sos-active-since"),
  activeLocation: document.querySelector("#sos-active-location"),
  activeList: document.querySelector("#sos-active-list"),
  activeLink: document.querySelector("#sos-active-link"),
  cancelButton: document.querySelector("#sos-cancel"),
  cancelDialog: document.querySelector("#sos-cancel-dialog"),
  message: document.querySelector("#sos-message")
};

async function sosRequest(path, { method = "GET", body } = {}) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, { method, body }); // throws SyncError when offline
  let data = null;
  try { data = await response.json(); } catch { /* empty reply */ }
  return { ok: response.ok, status: response.status, data };
}

function setSosView(view, message = sosState.message) {
  sosState.view = view;
  sosState.message = message;
  renderSos();
}

function describeSosNotification(item) {
  const sim = item.simulated ? " (simulated)" : "";
  if (item.submissionStatus === "cancelled") return "not sent (SOS cancelled first)";
  if (item.submissionStatus === "pending") return item.attempts > 0 ? "retrying…" : "sending…";
  if (item.submissionStatus === "failed") return "failed to send";
  if (item.deliveryStatus === "delivered") return item.simulated ? "delivery confirmed (simulated)" : "delivered (confirmed by provider)";
  if (item.deliveryStatus === "failed") return "not delivered";
  if (item.deliveryStatus === "unconfirmed") return `sent${sim}, delivery never confirmed`;
  return `sent${sim}, waiting for confirmation`;
}

function describeSosLocation(location) {
  if (location.source === "none") return "No location was available to send.";
  if (!location.shared) return "Location not shared (turned off in your alert settings).";
  if (location.source === "fresh") return `Current location sent (±${Math.round(location.accuracy)} m).`;
  return `Last known location sent: ${formatDuration(location.ageMs)} old, ±${Math.round(location.accuracy)} m.`;
}

function renderSos() {
  if (!sosEl.card) return;
  Object.entries(sosEl.panels).forEach(([name, panel]) => { panel.hidden = name !== sosState.view; });
  // On phones the SOS card is a narrow column beside the status panel; anything but the ready
  // button needs the full width.
  elements.layout.classList.toggle("sos-wide", sosState.view !== "ready");
  renderCondition();
  sosEl.message.textContent = sosState.message;
  sosEl.message.hidden = !sosState.message;

  if (sosState.view === "unavailable") {
    if (!sync.enabled) sosEl.unavailableText.textContent = "SOS alerts to your trusted contacts are coming soon. If you're in immediate danger, call 112.";
    else if (account.status !== "signed-in") sosEl.unavailableText.textContent = "Sign in and add trusted contacts to send SOS alerts.";
    else sosEl.unavailableText.textContent = "Add at least one trusted contact to send SOS alerts.";
  }
  if (sosState.view === "ready") {
    const how = sosState.channels.length ? ` by ${sosState.channels.join(" and ")}` : "";
    sosEl.readyText.textContent =
      `Alerts ${sosState.contacts} trusted contact${sosState.contacts === 1 ? "" : "s"}${how} with your location.` +
      (sosState.simulated ? " Development mode: alerts are simulated, nothing is really sent." : "");
    sosEl.readyShort.textContent =
      `${sosState.contacts} contact${sosState.contacts === 1 ? "" : "s"}${sosState.simulated ? " · simulated" : ""}`;
  }
  if (sosState.view === "countdown") sosEl.seconds.textContent = String(sosState.secondsLeft);
  if (sosState.view === "active" && sosState.event) {
    const event = sosState.event;
    sosEl.activeSince.textContent = formatTime(event.createdAt);
    sosEl.activeLocation.textContent = describeSosLocation(event.location);
    const alerts = event.notifications.filter((item) => item.kind === "alert");
    sosEl.activeList.replaceChildren(
      ...(alerts.length
        ? alerts.map((item) => {
            const row = document.createElement("li");
            row.textContent = `${item.contactName} (${item.channel === "sms" ? "SMS" : "email"}): ${describeSosNotification(item)}`;
            return row;
          })
        : [Object.assign(document.createElement("li"), { textContent: "No trusted contacts were set up, so nobody was alerted." })])
    );
    sosEl.activeLink.href = `/emergency#event-${event.id}`;
  }
}

// Decides what the card can offer right now.
async function loadSosStatus() {
  if (!sosEl.card) return;
  if (["countdown", "sending", "queued"].includes(sosState.view)) return; // don't interrupt an SOS in progress
  if (!sync.enabled || account.status !== "signed-in") {
    setSosView(readPendingSos() ? "queued" : "unavailable");
    return;
  }
  try {
    const [contactsResult, statusResult, activeResult] = await Promise.all([
      sosRequest("/contacts"),
      sosRequest("/notify/status"),
      sosRequest("/sos/active")
    ]);
    if (activeResult.ok && activeResult.data.event) {
      sosState.event = activeResult.data.event;
      setSosView("active");
      scheduleSosPoll();
      return;
    }
    const alerted = contactsResult.ok ? contactsResult.data.contacts.filter((contact) => contact.notifySos) : [];
    sosState.contacts = alerted.length;
    const channels = new Set();
    alerted.forEach((contact) => {
      if (contact.phone) channels.add("SMS");
      if (contact.email) channels.add("email");
    });
    sosState.channels = [...channels];
    sosState.simulated = statusResult.ok ? statusResult.data.mode === "simulated" : true;
    setSosView(alerted.length ? "ready" : "unavailable");
  } catch {
    setSosView(sosState.view === "active" ? "active" : "unavailable", "Can't reach the server right now. If you're in danger, call 112.");
  }
}

/* ---------- Location and device details at the moment of the SOS ---------- */

function requestFreshFix() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const fix = positionToFix(position);
        resolve(isValidCoordinateSet(fix) ? fix : null);
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: SOS_FRESH_FIX_TIMEOUT_MS }
    );
  });
}

function lastKnownLocation() {
  const candidates = [];
  if (tracker.latestFix) candidates.push(tracker.latestFix);
  const latest = app.history[app.history.length - 1];
  if (latest) candidates.push(latest);
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  return { latitude: best.latitude, longitude: best.longitude, accuracy: best.accuracy, timestamp: best.timestamp, source: "last-known" };
}

function connectionDetails() {
  const details = { online: navigator.onLine };
  const info = navigator.connection;
  if (info) {
    if (["slow-2g", "2g", "3g", "4g"].includes(info.effectiveType)) details.effectiveType = info.effectiveType;
    if (Number.isFinite(info.downlink)) details.downlinkMbps = info.downlink;
    if (Number.isInteger(info.rtt)) details.rttMs = info.rtt;
    if (typeof info.saveData === "boolean") details.saveData = info.saveData;
  }
  return details;
}

async function batteryDetails() {
  if (typeof navigator.getBattery !== "function") return null; // not available in this browser
  try {
    const battery = await Promise.race([navigator.getBattery(), new Promise((resolve) => setTimeout(() => resolve(null), 1000))]);
    if (!battery || !Number.isFinite(battery.level)) return null;
    return { level: Math.min(1, Math.max(0, battery.level)), charging: Boolean(battery.charging) };
  } catch {
    return null;
  }
}

/* ---------- Countdown, sending, retrying ---------- */

function startSosCountdown() {
  if (sosState.view !== "ready") return;
  sosState.fixPromise = requestFreshFix(); // start getting a fix straight away
  sosState.secondsLeft = SOS_COUNTDOWN_SECONDS;
  sosEl.fixStatus.textContent = "Getting your current location…";
  sosState.fixPromise.then((fix) => {
    if (sosState.view === "countdown") sosEl.fixStatus.textContent = fix ? `Current location found (±${Math.round(fix.accuracy)} m).` : "No current location yet: the last known location will be used if there is one.";
  });
  setSosView("countdown", "");
  sosEl.abort.focus();
  clearInterval(sosState.countdownTimer);
  sosState.countdownTimer = setInterval(() => {
    sosState.secondsLeft -= 1;
    if (sosState.secondsLeft <= 0) sendSos();
    else renderSos();
  }, 1000);
}

function abortSosCountdown() {
  clearInterval(sosState.countdownTimer);
  sosState.fixPromise = null;
  setSosView("ready", "SOS not sent.");
  sosEl.button.focus();
}

async function sendSos() {
  clearInterval(sosState.countdownTimer);
  if (sosState.view !== "countdown") return;
  setSosView("sending", "");

  const fix = await Promise.race([sosState.fixPromise || Promise.resolve(null), new Promise((resolve) => setTimeout(() => resolve(null), SOS_WAIT_FOR_FIX_MS))]);
  const location = fix
    ? { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, timestamp: fix.timestamp, source: "fresh" }
    : lastKnownLocation();

  const payload = {
    id: createId(),
    deviceId: account.device ? account.device.id : null,
    triggeredAt: Date.now(),
    location,
    connection: connectionDetails(),
    battery: await batteryDetails()
  };
  writeJson(PENDING_SOS_KEY, { payload, savedAt: Date.now() }); // kept until the server confirms
  sosState.retryAttempt = 0;
  await deliverPendingSos();
}

function readPendingSos() {
  const pending = readJson(PENDING_SOS_KEY);
  if (!pending || !pending.payload) return null;
  if (Date.now() - pending.savedAt > SOS_PENDING_MAX_AGE_MS) {
    removeKey(PENDING_SOS_KEY);
    return null;
  }
  return pending;
}

async function deliverPendingSos() {
  const pending = readPendingSos();
  if (!pending) return;
  clearTimeout(sosState.retryTimer);
  if (account.status !== "signed-in") {
    setSosView("queued", "You're signed out, so the SOS can't be sent. Sign in to send it, or call 112 if you're in danger.");
    return;
  }

  let result;
  try {
    result = await sosRequest("/sos", { method: "POST", body: pending.payload });
  } catch {
    result = { ok: false, status: 0 };
  }

  if (result.ok) {
    removeKey(PENDING_SOS_KEY);
    sosState.event = result.data.event;
    const message = result.data.alreadyActive ? "An SOS was already active, so nobody was alerted twice." : "";
    setSosView("active", message);
    scheduleSosPoll();
    return;
  }
  if (result.status === 401) {
    markSignedOut(true);
    renderAll();
    setSosView("queued", "Your session ended, so the SOS has not been sent. Sign in to send it, or call 112 if you're in danger.");
    return;
  }
  if (result.status === 429 || result.status === 400 || result.status === 409) {
    removeKey(PENDING_SOS_KEY);
    const reason = result.data && result.data.error ? result.data.error.message : "The SOS could not be sent.";
    setSosView("ready", `${reason} If you're in danger, call 112.`);
    loadSosStatus();
    return;
  }
  // No connection or a server problem: keep it and keep trying (2 s, 4 s … at most every 30 s).
  sosState.retryAttempt += 1;
  const delay = Math.min(30000, 2000 * 2 ** (sosState.retryAttempt - 1));
  setSosView(
    "queued",
    `Not sent yet: ${navigator.onLine ? "the server can't be reached" : "no connection"}. Trying again in ${Math.round(delay / 1000)} s. If you're in danger, call 112.`
  );
  sosState.retryTimer = setTimeout(deliverPendingSos, delay);
}

function cancelQueuedSos() {
  if (!window.confirm("Stop trying to send this SOS? Nobody has been alerted yet.")) return;
  clearTimeout(sosState.retryTimer);
  removeKey(PENDING_SOS_KEY);
  setSosView("ready", "SOS not sent.");
  loadSosStatus();
}

function scheduleSosPoll() {
  clearTimeout(sosState.pollTimer);
  if (sosState.view !== "active" || !sosState.event) return;
  sosState.pollTimer = setTimeout(async () => {
    try {
      const result = await sosRequest(`/sos/${encodeURIComponent(sosState.event.id)}`);
      if (result.ok) {
        sosState.event = result.data.event;
        if (sosState.event.status !== "active") {
          sosState.event = null;
          setSosView("ready", "This SOS was cancelled.");
          loadSosStatus();
          return;
        }
        renderSos();
      } else if (result.status === 401) {
        markSignedOut(true);
        renderAll();
      }
    } catch {
      /* offline: try again next time */
    }
    scheduleSosPoll();
  }, SOS_POLL_MS);
}

function openSosCancelDialog() {
  const dialog = sosEl.cancelDialog;
  dialog.returnValue = "";
  dialog.querySelector('input[value="safe-now"]').checked = true;
  dialog.showModal();
  dialog.addEventListener(
    "close",
    async () => {
      if (dialog.returnValue !== "confirm" || !sosState.event) return;
      const reason = dialog.querySelector('input[name="sos-cancel-reason"]:checked').value;
      let result;
      try {
        result = await sosRequest(`/sos/${encodeURIComponent(sosState.event.id)}/cancel`, { method: "POST", body: { reason } });
      } catch {
        result = { ok: false, status: 0 };
      }
      if (!result.ok) {
        setSosView("active", result.status === 0 ? "No connection: the SOS is still active. Try again when you're back online." : "The SOS could not be cancelled. Try again.");
        return;
      }
      clearTimeout(sosState.pollTimer);
      sosState.event = null;
      setSosView("ready", "SOS cancelled. Contacts who were already alerted are being told you're safe.");
      loadSosStatus();
    },
    { once: true }
  );
}

function bindSosEvents() {
  if (!sosEl.card) return;
  sosEl.button.addEventListener("click", startSosCountdown);
  sosEl.sendNow.addEventListener("click", sendSos);
  sosEl.abort.addEventListener("click", abortSosCountdown);
  sosEl.queuedCancel.addEventListener("click", cancelQueuedSos);
  sosEl.cancelButton.addEventListener("click", openSosCancelDialog);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sosState.view === "countdown") abortSosCountdown();
  });
  window.addEventListener("online", () => {
    if (readPendingSos()) {
      sosState.retryAttempt = 0;
      deliverPendingSos();
    }
  });
}

async function initSos() {
  await loadSosStatus();
  if (readPendingSos() && account.status === "signed-in") deliverPendingSos(); // e.g. sent while offline, then the page reloaded
}

/* ===================================================================
   11. Trip Mode (Phase 7)
   A trip is a monitored journey: origin, destination, optional expected arrival, chosen contacts.
   - The trip's ID is also the tracking session ID, so its points are saved and uploaded exactly like
     every other point (offline queue, exactly-once upload). The map draws the trip as the latest route.
   - Trip actions (start, pause, resume, check in, end) are applied on this phone at once and queued;
     the queue is sent to the server in order, and retried when the connection returns.
   - The server watches open trips (see server/trips/watchdog.js). This page shows what it reports:
     a delayed update, a check-in request, and what happens next according to the person's choices.
   - Every location is shown with its age and accuracy; an old one is never presented as current.
   =================================================================== */
const TRIP_POLL_MS = 30000; // how often to ask the server for news about an open trip
const TRIP_QUEUE_RETRY_MS = 15000;
const TRIP_KEY_PREFIX = "safe-location-trip:"; // + user ID -> { trip, pending } (no secrets)

const trip = {
  current: null, // what we know about the open trip: the server's view plus changes made here
  pending: [], // queued actions: { type, tripId, body }
  fetchedAt: 0, // when the server's view was received (to turn "in N ms" into local times)
  running: false,
  pollTimer: null,
  queueTimer: null,
  renderTimer: null,
  contacts: [] // trusted contacts offered in the start form
};

const tripEl = {
  card: document.querySelector("#trip-card"),
  unavailable: document.querySelector("#trip-unavailable"),
  idle: document.querySelector("#trip-idle"),
  form: document.querySelector("#trip-form"),
  active: document.querySelector("#trip-active"),
  open: document.querySelector("#trip-open"),
  formCancel: document.querySelector("#trip-form-cancel"),
  formError: document.querySelector("#trip-form-error"),
  origin: document.querySelector("#trip-origin"),
  destination: document.querySelector("#trip-destination"),
  arrival: document.querySelector("#trip-arrival"),
  interval: document.querySelector("#trip-interval"),
  contactsBox: document.querySelector("#trip-contacts"),
  contactsHelp: document.querySelector("#trip-contacts-help"),
  silence: document.querySelector("#trip-silence"),
  grace: document.querySelector("#trip-grace"),
  notifyStartEnd: document.querySelector("#trip-notify-start-end"),
  badge: document.querySelector("#trip-badge"),
  route: document.querySelector("#trip-route"),
  stateText: document.querySelector("#trip-state-text"),
  checkin: document.querySelector("#trip-checkin"),
  checkinText: document.querySelector("#trip-checkin-text"),
  checkinOk: document.querySelector("#trip-checkin-ok"),
  eta: document.querySelector("#trip-eta"),
  position: document.querySelector("#trip-current"),
  confirmed: document.querySelector("#trip-confirmed"),
  pendingCount: document.querySelector("#trip-pending"),
  contactNames: document.querySelector("#trip-contacts-list"),
  pause: document.querySelector("#trip-pause"),
  end: document.querySelector("#trip-end"),
  cancel: document.querySelector("#trip-cancel"),
  trackingNote: document.querySelector("#trip-tracking-note")
};

const TRIP_BADGES = {
  active: "Active",
  offline: "Offline",
  delayed: "Delayed update",
  "checkin-requested": "Check-in requested",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled"
};

const tripIsOpen = () => Boolean(trip.current && ["active", "paused"].includes(trip.current.status));

function tripKey() {
  return account.user ? `${TRIP_KEY_PREFIX}${account.user.id}` : null;
}

function saveTripLocal() {
  const key = tripKey();
  if (!key) return;
  if (!trip.current && !trip.pending.length) removeKey(key);
  else writeJson(key, { current: trip.current, pending: trip.pending, fetchedAt: trip.fetchedAt });
}

function loadTripLocal() {
  const key = tripKey();
  const saved = key ? readJson(key) : null;
  trip.current = saved ? saved.current : null;
  trip.pending = saved && Array.isArray(saved.pending) ? saved.pending : [];
  trip.fetchedAt = saved ? saved.fetchedAt || 0 : 0;
}

// Takes the server's view of the trip, keeping changes made here that the server hasn't seen yet.
function applyServerTrip(serverTrip) {
  if (!serverTrip) return;
  const local = trip.current && trip.current.id === serverTrip.id ? trip.current : {};
  trip.current = { ...local, ...serverTrip, confirmed: true };
  trip.fetchedAt = Date.now();
  // A pause/resume/end still in the queue wins over the server's older status.
  const lastStatusAction = [...trip.pending].reverse().find((action) => action.tripId === serverTrip.id && ["pause", "resume", "end"].includes(action.type));
  if (lastStatusAction) trip.current.status = lastStatusAction.type === "pause" ? "paused" : lastStatusAction.type === "resume" ? "active" : lastStatusAction.body.outcome;
  if (trip.pending.some((action) => action.type === "checkin" && action.tripId === serverTrip.id)) trip.current.checkinRequestedAt = null;
  saveTripLocal();
}

/* ---------- The action queue ---------- */

function actionUrl(action) {
  return action.type === "start" ? `${API_BASE_URL}/trips` : `${API_BASE_URL}/trips/${encodeURIComponent(action.tripId)}/${action.type}`;
}

// The start request says "arrive in N minutes", worked out when it is actually sent.
function actionBody(action) {
  if (action.type !== "start") return action.body || {};
  const { expectedArrivalLocal, ...body } = action.body;
  const minutes = expectedArrivalLocal ? Math.min(1440, Math.max(1, Math.ceil((expectedArrivalLocal - Date.now()) / 60000))) : null;
  return { ...body, expectedArrivalInMinutes: minutes };
}

function queueTripAction(type, body) {
  trip.pending.push({ type, tripId: trip.current.id, body });
  saveTripLocal();
  processTripQueue();
}

async function processTripQueue() {
  if (trip.running || !trip.pending.length || account.status !== "signed-in") return;
  trip.running = true;
  clearTimeout(trip.queueTimer);
  try {
    while (trip.pending.length) {
      const action = trip.pending[0];
      let response;
      try {
        response = await apiFetch(actionUrl(action), { method: "POST", body: actionBody(action) });
      } catch {
        trip.queueTimer = setTimeout(processTripQueue, TRIP_QUEUE_RETRY_MS); // offline or server down: try again later
        break;
      }
      if (response.status === 401) {
        markSignedOut(true);
        break;
      }
      let data = null;
      try { data = await response.json(); } catch { /* empty reply */ }
      if (response.status === 429 || response.status >= 500) {
        trip.queueTimer = setTimeout(processTripQueue, TRIP_QUEUE_RETRY_MS);
        break;
      }
      trip.pending.shift();
      if (response.ok) {
        applyServerTrip(data.trip);
      } else if (action.type === "start" && data && data.error && data.error.code === "trip_already_open" && data.trip) {
        // Another trip was already open (for example started on another phone). Keep the points recorded
        // here as a normal recording, and show the trip that is really open.
        stopTracking("Another trip was already in progress, so this one could not start. Its points are kept as a normal recording.", "warning");
        trip.pending = trip.pending.filter((item) => item.tripId !== action.tripId);
        trip.current = null;
        applyServerTrip(data.trip);
      } else {
        setMessage((data && data.error && data.error.message) || "A trip change could not be saved on the server.", "warning");
        await refreshTripFromServer();
      }
      saveTripLocal();
    }
  } finally {
    trip.running = false;
    if (trip.current && !tripIsOpen() && !trip.pending.length) finishTripLocally();
    renderAll();
  }
}

async function refreshTripFromServer() {
  if (account.status !== "signed-in" || !navigator.onLine) return;
  try {
    const path = trip.current && trip.current.confirmed ? `/trips/${encodeURIComponent(trip.current.id)}` : "/trips/active";
    const response = await apiFetch(`${API_BASE_URL}${path}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data.trip) applyServerTrip(data.trip);
    else if (!trip.pending.length && trip.current && trip.current.confirmed) trip.current = null;
  } catch {
    /* offline: the next poll tries again */
  }
  if (trip.current && !tripIsOpen() && !trip.pending.length) finishTripLocally();
  renderTrip();
}

function scheduleTripPoll() {
  clearTimeout(trip.pollTimer);
  if (!tripIsOpen()) return;
  trip.pollTimer = setTimeout(async () => {
    await processTripQueue();
    await refreshTripFromServer();
    scheduleTripPoll();
  }, TRIP_POLL_MS);
}

// The trip has ended (here or on the server): stop tracking, forget it locally, show a summary.
function finishTripLocally() {
  const ended = trip.current;
  trip.current = null;
  saveTripLocal();
  clearTimeout(trip.pollTimer);
  if (tracker.status !== "idle") stopTracking("Trip ended. Tracking stopped.");
  if (ended) setMessage(`Trip ${ended.status === "cancelled" ? "cancelled" : "ended"}. You can review it in Trip history.`, "success");
  document.title = "Safe Location";
}

/* ---------- Start, pause, resume, check in, end ---------- */

async function loadTripContacts() {
  try {
    const response = await apiFetch(`${API_BASE_URL}/contacts`);
    trip.contacts = response.ok ? (await response.json()).contacts : [];
  } catch {
    trip.contacts = [];
  }
  tripEl.contactsBox.replaceChildren(
    ...trip.contacts.map((contact) => {
      const label = document.createElement("label");
      label.className = "check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = contact.id;
      box.checked = contact.notifySos;
      const text = document.createElement("span");
      text.textContent = `${contact.name} (${[contact.phone ? "SMS" : null, contact.email ? "email" : null].filter(Boolean).join(" and ")})`;
      label.append(box, text);
      return label;
    })
  );
  tripEl.contactsHelp.textContent = trip.contacts.length
    ? "They are only messaged according to the choice below."
    : "You have no trusted contacts yet, so only you will be reminded. Add contacts on the Emergency page.";
}

// "18:30" today, or tomorrow if that time has already passed.
function expectedArrivalFromInput(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

async function openTripForm() {
  tripEl.formError.textContent = "";
  tripEl.interval.value = String(app.settings.intervalMs);
  const submit = tripEl.form.querySelector('button[type="submit"]');
  submit.disabled = true; // until the contact list has loaded, so a quick tap can't start a trip without them
  tripEl.contactsHelp.textContent = "Loading your contacts…";
  showTripPanel("form");
  tripEl.origin.focus();
  await loadTripContacts();
  submit.disabled = false;
}

async function submitTripForm(event) {
  event.preventDefault();
  const origin = tripEl.origin.value.trim();
  const destination = tripEl.destination.value.trim();
  if (!origin || !destination) {
    tripEl.formError.textContent = "Enter where you're starting from and where you're going.";
    return;
  }
  const contactIds = [...tripEl.contactsBox.querySelectorAll("input:checked")].map((box) => box.value);
  const escalation = tripEl.form.querySelector('input[name="trip-escalation"]:checked').value;
  const intervalMs = Number(tripEl.interval.value);
  const expectedArrivalLocal = expectedArrivalFromInput(tripEl.arrival.value);
  const id = createId();

  trip.current = {
    id, origin, destination, intervalMs, escalation,
    status: "active",
    confirmed: false,
    contacts: trip.contacts.filter((contact) => contactIds.includes(contact.id)).map(({ id: cid, name }) => ({ id: cid, name })),
    expectedArrivalLocal,
    silenceMs: Number(tripEl.silence.value) * 60000,
    startedAtLocal: Date.now()
  };
  changeInterval(intervalMs);
  queueTripAction("start", {
    id, origin, destination, intervalMs, contactIds, escalation,
    deviceId: account.device ? account.device.id : null,
    silenceMinutes: Number(tripEl.silence.value),
    graceMinutes: Number(tripEl.grace.value),
    notifyStartEnd: tripEl.notifyStartEnd.checked,
    expectedArrivalLocal
  });
  tripEl.form.reset();
  if (tracker.status !== "idle") stopTracking("Starting your trip…");
  await startTracking({ sessionId: id }); // the trip's points use the trip's ID
  setMessage(navigator.onLine ? "Trip started." : "Trip started offline: it will be registered with the server when you're back online.", "success");
  scheduleTripPoll();
  renderAll();
  // The form is below the map on phones: bring the live status panel back into view.
  elements.instrument.scrollIntoView({ block: "start" });
}

async function togglePause() {
  if (!tripIsOpen()) return;
  if (trip.current.status === "active") {
    trip.current.status = "paused";
    queueTripAction("pause");
    stopTracking("Trip paused: no location is recorded until you resume. Your expected arrival time still counts.");
  } else {
    trip.current.status = "active";
    queueTripAction("resume");
    await startTracking({ sessionId: trip.current.id });
    setMessage("Trip resumed.", "success");
  }
  renderAll();
}

function endTrip(outcome) {
  if (!tripIsOpen()) return;
  const question = outcome === "completed"
    ? "End this trip? Tracking stops."
    : "Cancel this trip? Tracking stops. Recorded points are kept.";
  if (!window.confirm(question)) return;
  trip.current.status = outcome;
  queueTripAction("end", { outcome });
  if (tracker.status !== "idle") stopTracking(outcome === "completed" ? "Trip ended." : "Trip cancelled.");
  renderAll();
}

function checkIn() {
  if (!tripIsOpen()) return;
  trip.current.checkinRequestedAt = null;
  queueTripAction("checkin");
  setMessage(navigator.onLine ? "Thanks, you've checked in." : "Check-in saved: it will reach the server when you're back online.", "success");
  renderTrip();
}

/* ---------- What the card shows ---------- */

function showTripPanel(name) {
  ["unavailable", "idle", "form", "active"].forEach((key) => { tripEl[key].hidden = key !== name; });
  tripEl.open.hidden = name !== "idle"; // "Start a trip" lives in the status panel
}

const tripPoints = () => (trip.current ? app.history.filter((record) => record.sessionId === trip.current.id) : []);

// Combines the server's view with what this phone knows (connection, unsent points).
function currentTripState() {
  const current = trip.current;
  if (!["active", "paused"].includes(current.status)) return current.status;
  if (current.checkinRequestedAt) return "checkin-requested";
  if (current.status === "paused") return "paused";
  if (!navigator.onLine || app.server === "unavailable") return "offline";
  const waiting = tripPoints().filter((record) => record.syncState === "pending");
  const oldestWaiting = waiting.reduce((oldest, record) => Math.min(oldest, record.timestamp), Infinity);
  if (waiting.length && Date.now() - oldestWaiting > 3 * current.intervalMs) return "delayed";
  if (current.state === "delayed") return "delayed";
  return "active";
}

function describeAge(ms) {
  if (ms < 60000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  return formatDuration(ms);
}

function renderTrip() {
  if (!tripEl.card) return;
  renderCondition();
  const usable = sync.enabled && account.user && account.status !== "signed-out" && (account.device || trip.current);
  if (!usable) {
    tripEl.unavailable.textContent = !sync.enabled
      ? "Trip Mode is coming soon. It needs the Safe Location server, which watches your trip even when your phone can't."
      : !account.user || account.status === "signed-out"
        ? "Sign in to use Trip Mode: the server needs to watch your trip even when your phone can't."
        : "Register this browser in the Backup and sync card first, so the trip's locations can reach the server.";
    showTripPanel("unavailable");
    tripEl.trackingNote.hidden = true;
    return;
  }
  if (!trip.current) {
    if (tripEl.form.hidden) showTripPanel("idle");
    tripEl.trackingNote.hidden = true;
    document.title = "Safe Location";
    return;
  }

  const current = trip.current;
  const state = currentTripState();
  showTripPanel("active");
  tripEl.trackingNote.hidden = !tripIsOpen();
  tripEl.badge.textContent = current.confirmed || !tripIsOpen() ? TRIP_BADGES[state] : `${TRIP_BADGES[state]} (not yet registered)`;
  tripEl.badge.className = `trip-badge is-${state}`;
  tripEl.route.textContent = `${current.origin} → ${current.destination}`;

  const silence = current.silenceMinutes ?? Math.round((current.silenceMs || 0) / 60000);
  const explanations = {
    active: `Your location is recorded every ${formatInterval(current.intervalMs)} and shared with the Safe Location server.`,
    offline: `Offline: points are saved on this phone and upload when you're back online. If nothing reaches the server for ${silence} min, you'll be asked to check in${current.escalation === "remind-only" ? "" : " and your contacts may be told"}.`,
    delayed: "Updates are late: the server hasn't received a recent location. Points waiting on this phone upload automatically.",
    "checkin-requested": "",
    paused: "Paused: no location is recorded. Your expected arrival time still counts.",
    completed: "Trip ended.",
    cancelled: "Trip cancelled."
  };
  // Until the server knows about the trip, nobody is watching it: say so plainly.
  const unregistered = !current.confirmed && tripIsOpen()
    ? " Not yet registered with the server: missed arrival and stopped updates are only watched once it is."
    : "";
  tripEl.stateText.textContent = explanations[state] + unregistered;

  // Check-in request: what the server noticed, and exactly what happens next.
  tripEl.checkin.hidden = state !== "checkin-requested";
  if (state === "checkin-requested") {
    const reason = current.checkinReason === "overdue" ? "Your expected arrival time has passed." : "No location has reached the server for a while.";
    const names = (current.contacts || []).map((contact) => contact.name).join(", ");
    let next;
    if (current.contactsAlertedAt) next = `Your contacts${names ? ` (${names})` : ""} have been told. Tap "I'm OK" to let them know you're fine.`;
    else if (current.escalation === "remind-only" || !names) next = "Your contacts won't be told.";
    else if (current.escalation === "notify-immediately") next = `${names} will be told now.`;
    else {
      const at = current.msUntilContactsAlerted !== null && current.msUntilContactsAlerted !== undefined ? trip.fetchedAt + current.msUntilContactsAlerted : null;
      next = at ? `If you don't answer by ${formatTime(at)}, ${names} will be told.` : `If you don't answer soon, ${names} will be told.`;
    }
    tripEl.checkinText.textContent = `${reason} Are you OK? ${next}`;
    document.title = "Check in · Safe Location";
  } else {
    document.title = "Safe Location";
  }

  // Expected arrival, as local time (from "in N ms" measured by the server, or the time chosen here).
  const expectedAt = current.msUntilArrival !== null && current.msUntilArrival !== undefined && current.confirmed
    ? trip.fetchedAt + current.msUntilArrival
    : current.expectedArrivalLocal;
  if (!expectedAt) tripEl.eta.textContent = "Not set";
  else {
    const left = expectedAt - Date.now();
    tripEl.eta.textContent = left >= 0 ? `By ${formatTime(expectedAt)} (in ${describeAge(left)})` : `Overdue: was ${formatTime(expectedAt)} (${describeAge(-left)} ago)`;
  }
  tripEl.eta.className = expectedAt && expectedAt < Date.now() ? "status-warning" : "";

  // Current position: only called "current" when it is recent.
  const fix = tracker.latestFix;
  if (current.status === "paused") tripEl.position.textContent = "Not recording (paused)";
  else if (!fix) tripEl.position.textContent = app.locationPermission === "denied" ? "Location permission denied" : "Waiting for GPS…";
  else {
    const age = Date.now() - fix.receivedAt;
    tripEl.position.textContent = age <= NO_RECENT_FIX_MS
      ? `Current: ${formatAccuracy(fix.accuracy)}, ${describeAge(age)} old`
      : `Last known: ${describeAge(age)} old, ${formatAccuracy(fix.accuracy)}; may be out of date`;
    tripEl.position.className = age <= NO_RECENT_FIX_MS ? "" : "status-warning";
  }

  // Last confirmed location: the newest point of this trip that the server has confirmed.
  const points = tripPoints();
  const synced = points.filter((record) => record.syncState === "synced");
  const newest = synced.reduce((best, record) => (!best || record.timestamp > best.timestamp ? record : best), null);
  if (newest) {
    tripEl.confirmed.textContent = `${formatTime(newest.timestamp)} (${describeAge(Date.now() - newest.timestamp)} old, ${formatAccuracy(newest.accuracy)})`;
  } else if (current.lastLocation) {
    const at = trip.fetchedAt - current.lastLocation.ageMs;
    tripEl.confirmed.textContent = `${formatTime(at)} (${describeAge(Date.now() - at)} old, ±${Math.round(current.lastLocation.accuracy)} m)`;
  } else {
    tripEl.confirmed.textContent = "None yet";
  }

  const waiting = points.filter((record) => record.syncState === "pending").length;
  tripEl.pendingCount.textContent = waiting ? `${waiting} point${waiting === 1 ? "" : "s"} (synchronization pending)` : "None: everything is uploaded";
  tripEl.pendingCount.className = waiting ? "status-warning" : "status-success";
  const names = (current.contacts || []).map((contact) => contact.name);
  tripEl.contactNames.textContent = names.length ? names.join(", ") : "None (only you are reminded)";

  tripEl.pause.textContent = current.status === "paused" ? "Resume" : "Pause";
  [tripEl.pause, tripEl.end, tripEl.cancel].forEach((button) => { button.disabled = !tripIsOpen(); });
}

function bindTripEvents() {
  if (!tripEl.card) return;
  tripEl.open.addEventListener("click", openTripForm);
  tripEl.formCancel.addEventListener("click", () => showTripPanel("idle"));
  tripEl.form.addEventListener("submit", submitTripForm);
  tripEl.pause.addEventListener("click", togglePause);
  tripEl.end.addEventListener("click", () => endTrip("completed"));
  tripEl.cancel.addEventListener("click", () => endTrip("cancelled"));
  tripEl.checkinOk.addEventListener("click", checkIn);
}

// On page load: restore the trip saved on this phone, send queued actions, ask the server for news,
// and keep recording if the trip is active (a trip is consent to track until it ends).
async function initTrip() {
  if (!tripEl.card) return;
  clearInterval(trip.renderTimer);
  trip.renderTimer = setInterval(() => { if (trip.current) renderTrip(); }, 15000);
  if (!sync.enabled || !account.user) {
    renderTrip();
    return;
  }
  loadTripLocal();
  await processTripQueue();
  await refreshTripFromServer();
  if (tripIsOpen() && trip.current.status === "active" && tracker.status === "idle") {
    let permission = "prompt";
    try { permission = (await navigator.permissions.query({ name: "geolocation" })).state; } catch { /* unknown */ }
    if (permission === "granted") {
      await startTracking({ sessionId: trip.current.id });
      setMessage("Your trip is still active, so tracking resumed.", "success");
    } else {
      setMessage("Your trip is still active. Allow location to keep recording it.", "warning");
    }
  }
  scheduleTripPoll();
  renderAll();
}

/* ===================================================================
   12. Start-up
   =================================================================== */
function bindEvents() {
  elements.start.addEventListener("click", () => startTracking());
  elements.stop.addEventListener("click", () => stopTracking());
  elements.clear.addEventListener("click", clearHistory);
  elements.syncOverview.syncNow.addEventListener("click", syncNow);
  bindBackupEvents();
  bindSosEvents();
  bindTripEvents();
  elements.intervalSelect.addEventListener("change", (event) => changeInterval(Number(event.target.value)));
  elements.followToggle.addEventListener("change", (event) => setFollow(event.target.checked));
  elements.recenter.addEventListener("click", recenterOnLatest);
  elements.fit.addEventListener("click", () => {
    setFollow(false);
    fitRoute();
  });
  elements.historyMore.addEventListener("click", () => {
    app.historyShown += HISTORY_PAGE_SIZE;
    renderHistory(buildTrips(app.history));
  });
  elements.styleRadios.forEach((radio) => {
    radio.checked = radio.value === app.settings.mapStyle;
    radio.addEventListener("change", () => {
      app.settings.mapStyle = radio.value;
      saveSettings();
      setMapStyle(radio.value);
      drawMap(buildTrips(app.history)); // gap lines use a different colour per style
    });
  });

  window.addEventListener("online", () => {
    renderNetworkState();
    hideMapAlert();
    if (mapView.tileLayer) mapView.tileLayer.redraw(); // retry tiles that failed while offline
    setMessage("Back online. Map tiles and place names are available again.", "success");
    sync.attempt = 0; // fresh start for uploads
    checkSession().then(async () => {
      renderAll();
      runSync();
      loadSosStatus();
      await processTripQueue(); // trip actions made while offline
      refreshTripFromServer();
    });
  });
  window.addEventListener("offline", () => {
    renderNetworkState();
    renderSyncStatus();
    renderLiveStatus();
    setMessage("You are offline. Tracking continues and points are saved on this device; map tiles and place names may be missing.", "warning");
  });

  // Never lose points silently: warn before closing while some exist only in memory and aren't uploaded.
  window.addEventListener("beforeunload", (event) => {
    const atRisk = app.history.some((record) => app.unsavedIds.has(record.id) && record.syncState !== "synced");
    if (atRisk) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Record the moment the page closes, so a quick refresh can resume the trip.
  window.addEventListener("pagehide", () => {
    if (tracker.status === "active") saveActiveSession();
  });

  // Browsers slow down timers in background tabs. Catch up when the page is visible again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && tracker.status === "active") scheduleNextReading();
    if (document.visibilityState !== "visible" || !sync.enabled) return;
    if (account.status === "signed-in") requestSync();
    else checkSession().then(() => { renderSyncStatus(); runSync(); loadSosStatus(); }); // e.g. signed in from another tab
  });

  if (app.channel) {
    app.channel.addEventListener("message", (event) => {
      if (event.data && event.data.type === "history-changed") reloadHistoryFromStorage();
    });
  }
}

// Lets the tracker page open and reload without a connection (see sw.js). Optional: if it fails,
// everything else still works; only offline reloads are unavailable.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* not available here */
  });
}

async function init() {
  elements.followToggle.checked = app.settings.follow;
  elements.intervalSelect.value = String(app.settings.intervalMs);
  renderNetworkState();
  bindEvents();
  initMap();
  await initStorage();
  watchLocationPermission();
  checkStorageEstimate();
  registerServiceWorker();
  removeLegacyDeviceToken();
  await checkSession();
  renderAll();
  if (app.history.length) {
    fitRoute();
    const latest = app.history[app.history.length - 1];
    if (isReliable(latest)) updateLocationName(latest);
  }
  await resumeAfterRefresh();
  runSync(); // upload anything still waiting from before
  initSos();
  initTrip();
}

init();
