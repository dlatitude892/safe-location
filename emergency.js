// Emergency contacts and SOS page (Phase 5).
// The server only sends this page to signed-in users and checks every request against the session cookie.
// Statuses are shown exactly as recorded: "delivered" only when the provider confirmed delivery.
"use strict";

const $ = (selector) => document.querySelector(selector);
const notice = $("#notice");
let contacts = [];
let editingId = null;
let activeEvent = null;
let pollTimer = null;

function showNotice(text, type = "info") {
  notice.textContent = text;
  notice.className = `notice is-${type}`;
  notice.setAttribute("role", type === "error" ? "alert" : "status");
  notice.hidden = false;
  notice.scrollIntoView({ block: "nearest" });
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
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
    if (response.status === 401) location.assign("/signin?next=%2Femergency&expired=1");
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function failure(result, fallback) {
  if (result.status === 0) return "Can't reach the server. Check your connection and try again.";
  return (result.data && result.data.error && result.data.error.message) || fallback;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const node = el("button", `button ${className}`, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

/* ---------- Honest status wording (shared idea with the tracker page) ---------- */

function describeNotification(item) {
  const sim = item.simulated ? " (simulated)" : "";
  if (item.submissionStatus === "cancelled") return { text: "Not sent: the SOS was cancelled first", tone: "muted" };
  if (item.submissionStatus === "pending") return { text: item.attempts > 0 ? `Retrying… (${item.lastError || "provider error"})` : "Sending…", tone: "muted" };
  if (item.submissionStatus === "failed") return { text: `Failed to send: ${item.lastError || "provider error"}`, tone: "danger" };
  if (item.deliveryStatus === "delivered") {
    return { text: item.simulated ? "Delivery confirmed (simulated, nothing really sent)" : "Delivered, confirmed by the provider", tone: "success" };
  }
  if (item.deliveryStatus === "failed") return { text: `Not delivered: ${item.lastError || "the provider reported a failure"}`, tone: "danger" };
  if (item.deliveryStatus === "unconfirmed") return { text: `Sent${sim}; the provider never confirmed delivery`, tone: "warning" };
  return { text: `Sent to provider${sim}; waiting for delivery confirmation`, tone: "muted" };
}

function describeLocation(location) {
  if (!location.shared && location.source !== "none") return "Location recorded for you but not shared (turned off in settings)";
  if (location.source === "none") return "No location was available";
  const accuracy = `±${Math.round(location.accuracy)} m`;
  if (location.source === "fresh") return `Current location sent (${accuracy})`;
  return `Last known location sent: ${formatAge(location.ageMs)} old, ${accuracy}`;
}

const KIND_LABEL = { alert: "Alert", cancellation: "\"I'm safe\" update", test: "Test" };
const CHANNEL_LABEL = { sms: "SMS", email: "Email" };

function notificationRow(item) {
  const row = el("li", "row");
  const main = el("div", "row-main");
  main.append(el("p", "row-title", `${item.contactName} · ${CHANNEL_LABEL[item.channel]} · ${KIND_LABEL[item.kind]}`));
  const status = describeNotification(item);
  main.append(el("p", `row-meta status-${status.tone}`, status.text));
  row.append(main);
  return row;
}

/* ---------- Notification mode ---------- */

async function loadMode() {
  const result = await request("/api/v1/notify/status");
  const banner = $("#mode-banner");
  if (!result.ok) {
    banner.textContent = "Could not check how alerts are sent.";
    return;
  }
  const { mode, channels } = result.data;
  banner.className = `mode-banner ${mode === "simulated" ? "is-simulated" : "is-live"}`;
  banner.textContent =
    mode === "simulated"
      ? "Development mode: alerts are SIMULATED. Nothing is sent to real phones or inboxes; each message is saved in the project's data/dev-outbox folder instead."
      : `Live mode: SMS alerts are sent through ${channels.sms.provider}. Email alerts are ${channels.email.simulated ? "still simulated (no email provider configured)" : "live"}.`;
}

/* ---------- Contacts ---------- */

// Accepts Nigerian local numbers (0803…) and international ones (+…); returns +E.164 or null.
function normalizePhone(value) {
  const compact = value.replace(/[\s()-]/g, "");
  if (!compact) return "";
  if (/^0\d{10}$/.test(compact)) return `+234${compact.slice(1)}`;
  if (/^234\d{10}$/.test(compact)) return `+${compact}`;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  return null;
}

async function loadContacts() {
  const result = await request("/api/v1/contacts");
  const list = $("#contact-list");
  if (!result.ok) {
    list.replaceChildren(el("li", "row-empty", failure(result, "Contacts could not be loaded.")));
    return;
  }
  contacts = result.data.contacts;
  $("#add-contact").disabled = contacts.length >= 10;
  if (!contacts.length) {
    list.replaceChildren(el("li", "row-empty", "No trusted contacts yet. Add at least one person who should hear from you in an emergency."));
    return;
  }
  list.replaceChildren(
    ...contacts.map((contact) => {
      const row = el("li", "row");
      const main = el("div", "row-main");
      const title = el("p", "row-title", contact.name);
      if (contact.relationship) title.append(" ", el("span", "badge", contact.relationship));
      if (!contact.notifySos) title.append(" ", el("span", "badge badge-warning", "Alerts off"));
      main.append(title);
      main.append(el("p", "row-meta", [contact.phone ? `SMS ${contact.phone}` : null, contact.email ? `Email ${contact.email}` : null].filter(Boolean).join(" · ")));
      const testStatus = el("p", "row-meta", "");
      testStatus.dataset.testFor = contact.id;
      main.append(testStatus);
      const actions = el("div", "row-actions");
      actions.append(
        button("Send test", "button-ghost", () => sendTest(contact, testStatus)),
        button("Edit", "button-ghost", () => openContactDialog(contact)),
        button("Remove", "button-danger-ghost", () => removeContact(contact))
      );
      row.append(main, actions);
      return row;
    })
  );
}

function openContactDialog(contact = null) {
  editingId = contact ? contact.id : null;
  $("#contact-title").textContent = contact ? `Edit ${contact.name}` : "Add a trusted contact";
  $("#contact-name").value = contact ? contact.name : "";
  $("#contact-relationship").value = contact && contact.relationship ? contact.relationship : "";
  $("#contact-phone").value = contact && contact.phone ? contact.phone : "";
  $("#contact-email").value = contact && contact.email ? contact.email : "";
  $("#contact-notify").checked = contact ? contact.notifySos : true;
  $("#contact-error").hidden = true;
  $("#contact-dialog").showModal();
  $("#contact-name").focus();
}

function contactError(text) {
  const box = $("#contact-error");
  box.textContent = text;
  box.className = "notice is-error";
  box.hidden = false;
}

$("#add-contact").addEventListener("click", () => openContactDialog());
$("#contact-cancel").addEventListener("click", () => $("#contact-dialog").close());

$("#contact-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#contact-name").value.trim();
  const phone = normalizePhone($("#contact-phone").value);
  const email = $("#contact-email").value.trim();
  if (!name) return contactError("Enter the person's name.");
  if (phone === null) return contactError("That phone number doesn't look right. Use 0803 123 4567 or +234 803 123 4567.");
  if (!phone && !email) return contactError("Add a mobile number or an email address.");

  const body = {
    name,
    relationship: $("#contact-relationship").value.trim() || null,
    phone: phone || null,
    email: email || null,
    notifySos: $("#contact-notify").checked
  };
  const result = editingId
    ? await request(`/api/v1/contacts/${encodeURIComponent(editingId)}`, { method: "PUT", body })
    : await request("/api/v1/contacts", { method: "POST", body });
  if (!result.ok) return contactError(failure(result, "The contact could not be saved. Check the details."));
  $("#contact-dialog").close();
  showNotice(`${result.data.contact.name} ${editingId ? "updated" : "added"}.`, "success");
  await Promise.all([loadContacts(), loadAudit()]);
});

async function removeContact(contact) {
  if (!window.confirm(`Remove ${contact.name} from your trusted contacts? They will not be alerted in future. Past SOS history is kept.`)) return;
  const result = await request(`/api/v1/contacts/${encodeURIComponent(contact.id)}`, { method: "DELETE" });
  if (!result.ok) return showNotice(failure(result, "The contact could not be removed."), "error");
  showNotice(`${contact.name} removed.`, "success");
  await Promise.all([loadContacts(), loadAudit()]);
}

async function sendTest(contact, statusLine) {
  const result = await request(`/api/v1/contacts/${encodeURIComponent(contact.id)}/test`, { method: "POST" });
  if (!result.ok) {
    statusLine.textContent = failure(result, "The test could not be sent.");
    statusLine.className = "row-meta status-danger";
    return;
  }
  const ids = result.data.notifications.map((item) => item.id);
  const render = (items) => {
    statusLine.textContent = `Test: ${items.map((item) => `${CHANNEL_LABEL[item.channel]}: ${describeNotification(item).text}`).join(" · ")}`;
    statusLine.className = "row-meta";
  };
  render(result.data.notifications);
  // Follow the test for up to a minute, until every message has a final status.
  for (let round = 0; round < 20; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const items = (await Promise.all(ids.map((id) => request(`/api/v1/notifications/${encodeURIComponent(id)}`)))).filter((item) => item.ok).map((item) => item.data.notification);
    if (!items.length) return;
    render(items);
    if (items.every((item) => item.submissionStatus !== "pending" && item.deliveryStatus !== "unknown") || items.some((item) => item.submissionStatus === "failed")) break;
  }
  loadAudit();
}

/* ---------- Preferences and preview ---------- */

async function loadPreferences() {
  const result = await request("/api/v1/sos/preferences");
  if (!result.ok) return;
  $("#pref-location").checked = result.data.preferences.includeLocation;
  $("#pref-note").value = result.data.preferences.note || "";
}

async function loadPreview() {
  const result = await request("/api/v1/sos/preview");
  $("#preview").textContent = result.ok ? result.data.message : failure(result, "Preview unavailable.");
}

$("#prefs-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await request("/api/v1/sos/preferences", {
    method: "PUT",
    body: { includeLocation: $("#pref-location").checked, note: $("#pref-note").value.trim() || null }
  });
  if (!result.ok) return showNotice(failure(result, "Settings could not be saved."), "error");
  showNotice("Alert settings saved.", "success");
  await Promise.all([loadPreview(), loadAudit()]);
});

/* ---------- Active SOS and history ---------- */

function deviceDetails(event) {
  const parts = [];
  if (event.battery) parts.push(`battery ${Math.round(event.battery.level * 100)}%${event.battery.charging ? " (charging)" : ""}`);
  else parts.push("battery: not available");
  if (event.connection) {
    const type = event.connection.effectiveType ? ` (${event.connection.effectiveType})` : "";
    parts.push(`${event.connection.online ? "online" : "offline"}${type}`);
  } else {
    parts.push("connection: not available");
  }
  return parts.join(" · ");
}

function summaryText(event) {
  const s = event.summary;
  if (!s.total) return "No trusted contacts were set up, so nobody was alerted.";
  const bits = [];
  if (s.delivered) bits.push(`${s.delivered} delivery confirmed`);
  if (s.submitted) bits.push(`${s.submitted} sent, not yet confirmed`);
  if (s.pending) bits.push(`${s.pending} sending`);
  if (s.failed) bits.push(`${s.failed} failed`);
  if (s.cancelled) bits.push(`${s.cancelled} not sent (cancelled)`);
  const simulated = event.notifications.some((item) => item.simulated) ? " Simulated: nothing was really sent." : "";
  return `${plural(s.total, "alert message")}: ${bits.join(", ")}.${simulated}`;
}

function renderActive() {
  const card = $("#active-card");
  card.hidden = !activeEvent;
  if (!activeEvent) return;
  $("#active-summary").textContent =
    `Started ${formatDateTime(activeEvent.createdAt)}. ${describeLocation(activeEvent.location)}. ${summaryText(activeEvent)}`;
  $("#active-notifications").replaceChildren(...activeEvent.notifications.map(notificationRow));
}

async function loadEvents() {
  const result = await request("/api/v1/sos");
  const list = $("#event-list");
  if (!result.ok) {
    list.replaceChildren(el("li", "row-empty", failure(result, "SOS history could not be loaded.")));
    return;
  }
  const events = result.data.events;
  activeEvent = events.find((event) => event.status === "active") || null;
  renderActive();
  schedulePoll();
  if (!events.length) {
    list.replaceChildren(el("li", "row-empty", "No SOS sent yet."));
    return;
  }
  list.replaceChildren(
    ...events.map((event) => {
      const row = el("li", "row event-row");
      row.id = `event-${event.id}`;
      const main = el("div", "row-main");
      const title = el("p", "row-title", formatDateTime(event.createdAt));
      title.append(" ", el("span", `badge ${event.status === "active" ? "badge-danger" : ""}`, event.status === "active" ? "Active" : `Cancelled (${event.cancelReason === "false-alarm" ? "false alarm" : "safe"})`));
      main.append(title);
      main.append(el("p", "row-meta", `${describeLocation(event.location)}. ${summaryText(event)}`));
      const details = el("details", "event-details");
      details.append(el("summary", "", "Details"));
      if (event.location.source !== "none") {
        details.append(el("p", "row-meta", `Coordinates: ${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)} · fix taken ${formatDateTime(event.location.timestamp)} (device time)`));
      }
      details.append(el("p", "row-meta", `Device at the time: ${deviceDetails(event)}`));
      if (event.cancelledAt) details.append(el("p", "row-meta", `Cancelled ${formatDateTime(event.cancelledAt)}`));
      details.append(el("p", "row-meta", `Event ID ${event.id}`));
      const messages = el("ul", "row-list");
      messages.append(...event.notifications.map(notificationRow));
      if (event.notifications.length) details.append(messages);
      main.append(details);
      row.append(main);
      if (location.hash === `#event-${event.id}`) details.open = true;
      return row;
    })
  );
}

function schedulePoll() {
  clearTimeout(pollTimer);
  // While an SOS is active (or messages are still being confirmed), refresh every few seconds.
  if (activeEvent) pollTimer = setTimeout(() => { loadEvents(); loadAudit(); }, 4000);
}

document.querySelectorAll("[data-cancel]").forEach((node) => {
  node.addEventListener("click", async () => {
    if (!activeEvent) return;
    const reason = node.dataset.cancel;
    if (!window.confirm("End this SOS and tell your contacts you're safe?")) return;
    const result = await request(`/api/v1/sos/${encodeURIComponent(activeEvent.id)}/cancel`, { method: "POST", body: { reason } });
    if (!result.ok) return showNotice(failure(result, "The SOS could not be cancelled. Try again."), "error");
    showNotice("SOS cancelled. Contacts who were already alerted are being told you're safe.", "success");
    activeEvent = null;
    await Promise.all([loadEvents(), loadAudit()]);
  });
});

/* ---------- Audit log ---------- */

const AUDIT_LABELS = {
  "contact.created": "Contact added",
  "contact.updated": "Contact changed",
  "contact.deleted": "Contact removed",
  "contact.test_sent": "Test message sent",
  "sos.preferences_updated": "Alert settings changed",
  "sos.triggered": "SOS sent",
  "sos.repeat_while_active": "SOS pressed again while already active (no new alerts)",
  "sos.rate_limited": "SOS refused: too many in the last hour",
  "sos.cancelled": "SOS cancelled",
  "notification.failed": "A message could not be sent",
  "notification.undelivered": "A message was not delivered"
};

async function loadAudit() {
  const result = await request("/api/v1/audit");
  const list = $("#audit-list");
  if (!result.ok) return;
  if (!result.data.entries.length) {
    list.replaceChildren(el("li", "row-empty", "Nothing yet."));
    return;
  }
  list.replaceChildren(
    ...result.data.entries.slice(0, 50).map((entry) => {
      const row = el("li", "row");
      const main = el("div", "row-main");
      main.append(el("p", "row-title", AUDIT_LABELS[entry.action] || entry.action));
      const who = entry.actor === "system" ? "by the server" : `from ${entry.ip || "unknown address"}`;
      main.append(el("p", "row-meta", `${formatDateTime(entry.createdAt)} · ${who}`));
      row.append(main);
      return row;
    })
  );
}

/* ---------- Start ---------- */

(async function start() {
  const session = await request("/api/auth/get-session");
  if (!session.ok || !session.data || !session.data.user) {
    location.assign("/signin?next=%2Femergency");
    return;
  }
  await Promise.all([loadMode(), loadContacts(), loadPreferences(), loadPreview(), loadEvents(), loadAudit()]);
  $("#main").setAttribute("aria-busy", "false");
})();
