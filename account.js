// Account dashboard (Phase 4): profile, devices, trips, sessions, sign-out and account deletion.
// The server only sends this page to signed-in users, and every API call below is checked against
// the session cookie on the server. This script never sees or stores the session itself.
"use strict";

const DEVICE_KEY_PREFIX = "safe-location-device:"; // + user ID -> { id, name } (not a secret)
const ACCOUNT_CACHE_KEY = "safe-location-account"; // { id, name } of the last signed-in user (not a secret)
const LOCAL_DB = "safe-location";
const LOCAL_STORE = "locations";

const $ = (selector) => document.querySelector(selector);
const notice = $("#notice");
let currentUser = null;
let currentSessionId = null;
let leaving = false; // set when signing out or deleting the account: late "not signed in" replies are expected then

function showNotice(text, type = "info") {
  notice.textContent = text;
  notice.className = `notice is-${type}`;
  notice.setAttribute("role", type === "error" ? "alert" : "status");
  notice.hidden = false;
  notice.scrollIntoView({ block: "nearest" });
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDate = (value) => new Date(value).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
const plural = (count, word) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

async function request(path, { method = "GET", body } = {}) {
  try {
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
    let data = null;
    try { data = await response.json(); } catch { /* empty reply */ }
    if (response.status === 401 && !leaving) {
      location.assign("/signin?next=%2Faccount&expired=1");
    }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function failure(result, fallback) {
  if (result.status === 0) return "Can't reach the server. Check your connection and try again.";
  if (result.status === 429) return "Too many attempts. Please wait a minute and try again.";
  return (result.data && result.data.error && result.data.error.message) || fallback;
}

function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to do */ }
}

/* ---------- This browser's local history (IndexedDB, written by the tracker page) ---------- */

function openLocalDb() {
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(LOCAL_DB);
    } catch {
      resolve(null);
      return;
    }
    // If the database does not exist yet, don't create it from this page.
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

// Counts (and optionally deletes) this browser's records that belong to the given user.
async function localHistory(userId, { remove = false } = {}) {
  const db = await openLocalDb();
  if (!db || !db.objectStoreNames.contains(LOCAL_STORE)) return { total: 0, pending: 0 };
  return new Promise((resolve, reject) => {
    const summary = { total: 0, pending: 0 };
    const transaction = db.transaction(LOCAL_STORE, remove ? "readwrite" : "readonly");
    transaction.objectStore(LOCAL_STORE).openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      if (cursor.value.accountId === userId) {
        summary.total += 1;
        if (cursor.value.syncState === "pending") summary.pending += 1;
        if (remove) cursor.delete();
      }
      cursor.continue();
    };
    transaction.oncomplete = () => {
      db.close();
      if (remove && "BroadcastChannel" in window) new BroadcastChannel("safe-location").postMessage({ type: "history-changed" });
      resolve(summary);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function forgetThisBrowserFor(userId) {
  storageRemove(`${DEVICE_KEY_PREFIX}${userId}`);
  const cached = storageGet(ACCOUNT_CACHE_KEY);
  if (cached && cached.id === userId) storageRemove(ACCOUNT_CACHE_KEY);
}

/* ---------- Rendering ---------- */

function emptyRow(list, text) {
  const item = document.createElement("li");
  item.className = "row-empty";
  item.textContent = text;
  list.replaceChildren(item);
}

function rowButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${className}`;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

async function loadProfile() {
  const session = await request("/api/auth/get-session");
  if (!session.ok || !session.data || !session.data.user) {
    location.assign("/signin?next=%2Faccount");
    return false;
  }
  currentUser = session.data.user;
  currentSessionId = session.data.session.id;
  try {
    localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({ id: currentUser.id, name: currentUser.name }));
  } catch { /* optional */ }

  $("#profile-name").textContent = currentUser.name;
  $("#profile-email").textContent = `${currentUser.email}${currentUser.emailVerified ? " (confirmed)" : ""}`;
  $("#profile-since").textContent = formatDate(currentUser.createdAt);
  const summary = await request("/api/v1/account/summary");
  if (summary.ok) $("#profile-points").textContent = summary.data.locations.toLocaleString();

  if (new URLSearchParams(location.search).has("welcome")) {
    const hint = thisBrowserDevice() ? "" : " Go back to the tracker to register this browser for backup.";
    showNotice(`Email confirmed. Welcome to Safe Location!${hint}`, "success");
  }
  return true;
}

function thisBrowserDevice() {
  return storageGet(`${DEVICE_KEY_PREFIX}${currentUser.id}`);
}

async function loadDevices() {
  const list = $("#device-list");
  const result = await request("/api/v1/devices");
  if (!result.ok) return emptyRow(list, failure(result, "Devices could not be loaded."));
  const mine = thisBrowserDevice();
  const devices = result.data.devices;

  const registeredHere = mine && devices.some((device) => device.id === mine.id);
  $("#this-browser").textContent = registeredHere
    ? `This browser is registered as "${devices.find((device) => device.id === mine.id).name}".`
    : "This browser is not registered for backup. Register it from the tracker page (Backup section).";

  if (!devices.length) return emptyRow(list, "No devices yet.");
  list.replaceChildren(
    ...devices.map((device) => {
      const item = document.createElement("li");
      item.className = "row";
      const info = document.createElement("div");
      info.className = "row-main";
      const title = document.createElement("p");
      title.className = "row-title";
      title.textContent = device.name;
      if (mine && mine.id === device.id) {
        const tag = document.createElement("span");
        tag.className = "badge";
        tag.textContent = "This browser";
        title.append(" ", tag);
      }
      const meta = document.createElement("p");
      meta.className = "row-meta";
      meta.textContent =
        `${plural(device.points, "point")} uploaded · registered ${formatDate(device.createdAt)}` +
        (device.lastUploadAt ? ` · last upload ${formatDateTime(device.lastUploadAt)}` : "") +
        ` · ID ${device.id.slice(0, 8)}`;
      info.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.append(
        rowButton("Rename", "button-ghost", () => renameDevice(device)),
        rowButton("Remove", "button-danger-ghost", () => removeDevice(device))
      );
      item.append(info, actions);
      return item;
    })
  );
}

async function renameDevice(device) {
  const name = window.prompt("New name for this device (1–60 characters):", device.name);
  if (name === null) return;
  const result = await request(`/api/v1/devices/${encodeURIComponent(device.id)}`, { method: "PATCH", body: { name } });
  if (!result.ok) return showNotice(failure(result, "The device could not be renamed."), "error");
  const mine = thisBrowserDevice();
  if (mine && mine.id === device.id) {
    try { localStorage.setItem(`${DEVICE_KEY_PREFIX}${currentUser.id}`, JSON.stringify({ id: device.id, name: result.data.device.name })); } catch { /* optional */ }
  }
  showNotice(`Renamed to "${result.data.device.name}".`, "success");
  loadDevices();
}

function removeDevice(device) {
  const dialog = $("#remove-dialog");
  $("#remove-text").textContent =
    `"${device.name}" will no longer be able to upload locations. It has ${plural(device.points, "uploaded point")}.`;
  dialog.querySelector('input[value="keep"]').checked = true;
  dialog.returnValue = "";
  dialog.showModal();
  dialog.addEventListener(
    "close",
    async () => {
      if (dialog.returnValue !== "confirm") return;
      const deleteLocations = dialog.querySelector('input[name="remove-mode"]:checked').value === "delete";
      const result = await request(`/api/v1/devices/${encodeURIComponent(device.id)}?deleteLocations=${deleteLocations}`, { method: "DELETE" });
      if (!result.ok) return showNotice(failure(result, "The device could not be removed."), "error");
      const mine = thisBrowserDevice();
      if (mine && mine.id === device.id) storageRemove(`${DEVICE_KEY_PREFIX}${currentUser.id}`);
      showNotice(
        deleteLocations
          ? `"${device.name}" was removed and ${plural(result.data.deletedLocations, "uploaded point")} deleted.`
          : `"${device.name}" was removed. Its uploaded history is still in your account.`,
        "success"
      );
      refreshAll();
    },
    { once: true }
  );
}

async function loadTrips() {
  const list = $("#trip-list");
  const result = await request("/api/v1/recordings");
  if (!result.ok) return emptyRow(list, failure(result, "Recordings could not be loaded."));
  if (!result.data.recordings.length) return emptyRow(list, "Nothing uploaded yet.");
  list.replaceChildren(
    ...result.data.recordings.map((trip) => {
      const item = document.createElement("li");
      item.className = "row";
      const info = document.createElement("div");
      info.className = "row-main";
      const title = document.createElement("p");
      title.className = "row-title";
      title.textContent = `${formatDateTime(trip.startedAt)} – ${new Date(trip.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const meta = document.createElement("p");
      meta.className = "row-meta";
      meta.textContent = `${plural(trip.points, "point")} · ${trip.deviceName}${trip.deviceRemoved ? " (removed)" : ""}`;
      info.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.append(
        rowButton("Delete", "button-danger-ghost", async () => {
          if (!window.confirm(`Permanently delete this recording's ${plural(trip.points, "uploaded point")} from your account?`)) return;
          const removed = await request(`/api/v1/recordings/${encodeURIComponent(trip.sessionId)}`, { method: "DELETE" });
          if (!removed.ok) return showNotice(failure(removed, "The recording could not be deleted."), "error");
          showNotice(`Deleted ${plural(removed.data.deletedLocations, "point")} from your account. Copies saved in a browser are not affected.`, "success");
          refreshAll();
        })
      );
      item.append(info, actions);
      return item;
    })
  );
}

function describeAgent(userAgent = "") {
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const system = /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Windows/.test(userAgent) ? "Windows" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "unknown system";
  return `${browser} on ${system}`;
}

async function loadSessions() {
  const list = $("#session-list");
  const result = await request("/api/auth/list-sessions");
  if (!result.ok || !Array.isArray(result.data)) return emptyRow(list, failure(result, "Sessions could not be loaded."));
  list.replaceChildren(
    ...result.data.map((session) => {
      const item = document.createElement("li");
      item.className = "row";
      const info = document.createElement("div");
      info.className = "row-main";
      const title = document.createElement("p");
      title.className = "row-title";
      title.textContent = describeAgent(session.userAgent);
      if (session.id === currentSessionId) {
        const tag = document.createElement("span");
        tag.className = "badge";
        tag.textContent = "This session";
        title.append(" ", tag);
      }
      const meta = document.createElement("p");
      meta.className = "row-meta";
      meta.textContent = `Signed in ${formatDateTime(session.createdAt)} · expires ${formatDate(session.expiresAt)}`;
      info.append(title, meta);
      item.append(info);
      return item;
    })
  );
  $("#revoke-others").disabled = result.data.length < 2;
}

async function refreshAll() {
  await Promise.all([loadDevices(), loadTrips(), loadSessions()]);
  const summary = await request("/api/v1/account/summary");
  if (summary.ok) $("#profile-points").textContent = summary.data.locations.toLocaleString();
  const local = await localHistory(currentUser.id);
  const warning = $("#signout-warning");
  warning.hidden = local.pending === 0;
  warning.textContent = `${plural(local.pending, "point")} saved in this browser ${local.pending === 1 ? "has" : "have"} not been uploaded yet and would be lost if removed.`;
}

/* ---------- Actions ---------- */

$("#revoke-others").addEventListener("click", async () => {
  const result = await request("/api/auth/revoke-other-sessions", { method: "POST", body: {} });
  if (!result.ok) return showNotice(failure(result, "Could not sign out other sessions."), "error");
  showNotice("Signed out of every other browser and device.", "success");
  loadSessions();
});

// Buttons can be pressed before the page has finished loading: make sure we know who is signed in.
async function ensureProfile() {
  return Boolean(currentUser) || loadProfile();
}

$("#signout").addEventListener("click", async () => {
  if (!(await ensureProfile())) return;
  const userId = currentUser.id;
  if ($("#signout-clear").checked) await localHistory(userId, { remove: true });
  leaving = true;
  const result = await request("/api/auth/sign-out", { method: "POST", body: {} });
  if (!result.ok) {
    leaving = false;
    return showNotice(failure(result, "Could not sign out. Try again."), "error");
  }
  storageRemove(ACCOUNT_CACHE_KEY);
  location.assign("/signin?signedOut=1");
});

$("#delete-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#delete-password").value;
  if ($("#delete-confirm").value.trim() !== "DELETE") return showNotice('Type DELETE (in capital letters) to confirm.', "error");
  if (!password) return showNotice("Enter your password to confirm.", "error");
  if (!(await ensureProfile())) return;

  const userId = currentUser.id;
  leaving = true;
  const result = await request("/api/auth/delete-user", { method: "POST", body: { password } });
  if (!result.ok) {
    leaving = false;
    const wrongPassword = result.data && /PASSWORD/.test(result.data.code || "");
    return showNotice(wrongPassword ? "That password is not correct. Nothing was deleted." : failure(result, "The account could not be deleted. Nothing was changed."), "error");
  }
  if ($("#delete-local").checked) await localHistory(userId, { remove: true });
  forgetThisBrowserFor(userId);
  location.assign("/signin?deleted=1");
});

(async function start() {
  if (!(await loadProfile())) return;
  await refreshAll();
  $("#main").setAttribute("aria-busy", "false");
})();
