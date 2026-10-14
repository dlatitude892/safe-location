// Trip history page (Phase 7). Only sent to signed-in users; every request is checked on the server
// against the session cookie, so a person only ever sees their own trips.
"use strict";

const $ = (selector) => document.querySelector(selector);
const notice = $("#notice");
let map = null;
let routeLayer = null;
let shownTripId = null;

const BADGES = {
  active: "Active",
  delayed: "Delayed update",
  "checkin-requested": "Check-in requested",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled"
};
const KIND_LABEL = {
  "trip-started": "Trip started",
  "trip-missed-checkin": "Missed check-in",
  "trip-checked-in": "Checked in",
  "trip-ended": "Trip ended"
};

function showNotice(text, type = "info") {
  notice.textContent = text;
  notice.className = `notice is-${type}`;
  notice.hidden = false;
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (ms < 60000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${Math.round(minutes / 1440)} days`;
}

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
    if (response.status === 401) location.assign("/signin?next=%2Ftrips&expired=1");
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Same honest wording as the Emergency page: "delivered" only when the provider confirmed it.
function describeNotification(item) {
  if (item.submissionStatus === "cancelled") return "Not sent";
  if (item.submissionStatus === "pending") return item.attempts > 0 ? "Retrying…" : "Sending…";
  if (item.submissionStatus === "failed") return `Failed to send: ${item.lastError || "provider error"}`;
  if (item.deliveryStatus === "delivered") return item.simulated ? "Delivery confirmed (simulated, nothing really sent)" : "Delivered, confirmed by the provider";
  if (item.deliveryStatus === "failed") return `Not delivered: ${item.lastError || "provider reported a failure"}`;
  if (item.deliveryStatus === "unconfirmed") return "Sent; delivery never confirmed";
  return `Sent to provider${item.simulated ? " (simulated)" : ""}; waiting for confirmation`;
}

function duration(trip) {
  const end = trip.endedAt || trip.serverNow;
  return formatAge(end - trip.startedAt);
}

/* ---------- List ---------- */

async function loadList() {
  const result = await request("/api/v1/trips");
  const list = $("#trip-list");
  if (!result.ok) {
    list.replaceChildren(el("li", "row-empty", "Trips could not be loaded. Check your connection and reload."));
    return [];
  }
  const trips = result.data.trips;
  if (!trips.length) {
    list.replaceChildren(el("li", "row-empty", "No trips yet. Start one from the Trip Mode card on the tracker."));
    return trips;
  }
  list.replaceChildren(
    ...trips.map((trip) => {
      const row = el("li", "row");
      const main = el("div", "row-main");
      const title = el("p", "row-title", `${trip.origin} → ${trip.destination} `);
      title.append(el("span", `trip-badge is-${trip.state}`, BADGES[trip.state]));
      main.append(title);
      const parts = [`Started ${formatDateTime(trip.startedAt)}`, trip.endedAt ? `took ${duration(trip)}` : `running for ${duration(trip)}`, `${trip.points} point${trip.points === 1 ? "" : "s"}`];
      if (trip.contactsAlertedAt) parts.push("contacts were alerted");
      main.append(el("p", "row-meta", parts.join(" · ")));
      const actions = el("div", "row-actions");
      const view = el("button", "button button-ghost", "View");
      view.type = "button";
      view.setAttribute("aria-label", `View trip from ${trip.origin} to ${trip.destination}`);
      view.addEventListener("click", () => showTrip(trip.id));
      actions.append(view);
      row.append(main, actions);
      return row;
    })
  );
  return trips;
}

/* ---------- One trip ---------- */

async function loadRoute(tripId) {
  const points = [];
  let cursor = null;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ sessionId: tripId, limit: "500" });
    if (cursor) query.set("cursor", cursor);
    const result = await request(`/api/v1/locations?${query}`);
    if (!result.ok) break;
    points.push(...result.data.records);
    cursor = result.data.nextCursor;
    if (!cursor) break;
  }
  return points.sort((a, b) => a.deviceTimestamp - b.deviceTimestamp);
}

function drawRoute(points) {
  const note = $("#trip-map-note");
  if (typeof L === "undefined") {
    note.textContent = "The map could not load. The trip details below are still correct.";
    note.hidden = false;
    return;
  }
  if (!map) {
    map = L.map("trip-map", { zoomControl: true }).setView([9.08, 8.68], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }
  routeLayer.clearLayers();
  const usable = points.filter((point) => !point.flags.includes("low-accuracy") && !point.flags.includes("implausible-jump"));
  note.hidden = points.length > 0;
  note.textContent = "No uploaded locations for this trip.";
  if (!points.length) return;
  const line = (usable.length ? usable : points).map((point) => [point.latitude, point.longitude]);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(); // colours from style.css
  L.polyline(line, { color: css("--accent"), weight: 5, opacity: 0.95 }).addTo(routeLayer);
  L.circleMarker(line[0], { radius: 7, color: css("--success"), weight: 4, fillColor: css("--bg"), fillOpacity: 1 }).bindTooltip("Start").addTo(routeLayer);
  L.circleMarker(line[line.length - 1], { radius: 8, color: "#fff", weight: 3, fillColor: css("--accent"), fillOpacity: 1 }).bindTooltip("Last uploaded point").addTo(routeLayer);
  if (line.length > 1) map.fitBounds(L.latLngBounds(line), { padding: [30, 30], maxZoom: 17 });
  else map.setView(line[0], 16);
  setTimeout(() => map.invalidateSize(), 50);
}

function fact(label, value) {
  const wrap = el("div");
  wrap.append(el("dt", "", label), el("dd", "", value));
  return wrap;
}

async function showTrip(tripId) {
  const result = await request(`/api/v1/trips/${encodeURIComponent(tripId)}`);
  if (!result.ok) return showNotice("That trip could not be loaded.", "error");
  const trip = result.data.trip;
  const fetchedAt = Date.now();
  shownTripId = trip.id;
  $("#detail").hidden = false;
  $("#detail-heading").textContent = `${trip.origin} → ${trip.destination}`;
  $("#detail-subtitle").textContent = `Started ${formatDateTime(trip.startedAt)}${trip.endedAt ? ` · ended ${formatDateTime(trip.endedAt)} (${duration(trip)})` : ""}`;
  const badge = $("#detail-badge");
  badge.textContent = BADGES[trip.state];
  badge.className = `trip-badge is-${trip.state}`;

  const facts = [];
  facts.push(fact("Expected arrival", trip.expectedArrivalAt ? `${formatDateTime(trip.expectedArrivalAt)}${trip.overdueFlaggedAt ? " (passed before the trip ended)" : ""}` : "Not set"));
  if (trip.lastLocation) {
    const at = fetchedAt - trip.lastLocation.ageMs;
    const old = trip.lastLocation.ageMs > 2 * 60000;
    facts.push(fact(old ? "Last confirmed location (not current)" : "Last confirmed location",
      `${formatDateTime(at)}: ${formatAge(trip.lastLocation.ageMs)} old, ±${Math.round(trip.lastLocation.accuracy)} m · ${trip.lastLocation.latitude.toFixed(5)}, ${trip.lastLocation.longitude.toFixed(5)}`));
  } else {
    facts.push(fact("Last confirmed location", "None received"));
  }
  facts.push(fact("Uploaded points", String(trip.points)));
  facts.push(fact("Trip contacts", trip.contacts.length ? trip.contacts.map((contact) => contact.name).join(", ") : "None"));
  const escalation = { "remind-only": "Only remind me", "checkin-then-notify": `Tell contacts if I don't answer within ${trip.graceMinutes} min`, "notify-immediately": "Tell contacts straight away" };
  facts.push(fact("If a check-in is missed", escalation[trip.escalation]));
  facts.push(fact("Check-in if no update for", `${trip.silenceMinutes} min`));
  if (trip.checkinRequestedAt) facts.push(fact("Check-in requested", `${formatTime(trip.checkinRequestedAt)} (${trip.checkinReason === "overdue" ? "arrival time passed" : "no recent update"})`));
  if (trip.contactsAlertedAt) facts.push(fact("Contacts alerted", formatDateTime(trip.contactsAlertedAt)));
  if (trip.lastCheckinAt) facts.push(fact("Last check-in", formatDateTime(trip.lastCheckinAt)));
  $("#detail-facts").replaceChildren(...facts);

  const messages = trip.notifications || [];
  $("#detail-messages").replaceChildren(
    ...(messages.length
      ? messages.map((item) => {
          const row = el("li", "row");
          const main = el("div", "row-main");
          main.append(el("p", "row-title", `${KIND_LABEL[item.kind] || item.kind} · ${item.contactName} · ${item.channel === "sms" ? "SMS" : "Email"}`));
          main.append(el("p", "row-meta", `${formatDateTime(item.createdAt)} · ${describeNotification(item)}`));
          row.append(main);
          return row;
        })
      : [el("li", "row-empty", "No messages were sent for this trip.")])
  );

  const open = ["active", "paused"].includes(trip.status);
  $("#detail-open").hidden = !open;
  $("#detail-delete").hidden = open;
  $("#detail").scrollIntoView({ block: "start" });
  drawRoute(await loadRoute(trip.id));
}

$("#detail-delete").addEventListener("click", async () => {
  if (!shownTripId) return;
  if (!window.confirm("Permanently delete this trip, its route and its message history from your account?")) return;
  const result = await request(`/api/v1/trips/${encodeURIComponent(shownTripId)}`, { method: "DELETE" });
  if (!result.ok) return showNotice((result.data && result.data.error && result.data.error.message) || "The trip could not be deleted.", "error");
  $("#detail").hidden = true;
  shownTripId = null;
  showNotice("Trip deleted.", "success");
  loadList();
});

(async function start() {
  const session = await request("/api/auth/get-session");
  if (!session.ok || !session.data || !session.data.user) {
    location.assign("/signin?next=%2Ftrips");
    return;
  }
  const trips = await loadList();
  const wanted = new URLSearchParams(location.search).get("trip");
  if (wanted && trips.some((trip) => trip.id === wanted)) showTrip(wanted);
  $("#main").setAttribute("aria-busy", "false");
})();
