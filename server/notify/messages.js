// The text trusted contacts receive. Kept short enough for 1–2 SMS messages.
// Locations are written into the message itself: there is no link to this server, so nothing about
// the person can be opened by anyone else through the alert.

const REASONS = { "false-alarm": "false alarm", "safe-now": "now safe" };

export function formatWhen(ms, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(ms);
}

export function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

// One line describing the location, honest about its source, age and accuracy.
export function describeLocation(location, shared) {
  if (!shared) return "Location: not shared (turned off in their settings).";
  if (!location || location.source === "none") return "Location: not available.";
  const coords = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  const accuracy = `±${Math.round(location.accuracy)} m`;
  const map = `https://www.openstreetmap.org/?mlat=${location.latitude.toFixed(5)}&mlon=${location.longitude.toFixed(5)}#map=17/${location.latitude.toFixed(5)}/${location.longitude.toFixed(5)}`;
  if (location.source === "fresh") return `Location now (${accuracy}): ${coords} ${map}`;
  return `Last known location, ${formatAge(location.ageMs ?? 0)} old (${accuracy}), may be out of date: ${coords} ${map}`;
}

export function alertMessage({ userName, createdAt, location, locationShared, note, timeZone }) {
  const parts = [
    `SOS from ${userName} via Safe Location, ${formatWhen(createdAt, timeZone)}.`,
    describeLocation(location, locationShared)
  ];
  if (note) parts.push(`Their note: ${note}`);
  parts.push("Please try to reach them now. Safe Location has NOT contacted emergency services (Nigeria: 112).");
  return { subject: `SOS from ${userName}`, body: parts.join(" ") };
}

export function cancellationMessage({ userName, createdAt, reason, timeZone }) {
  return {
    subject: `${userName} cancelled their SOS`,
    body:
      `Update from Safe Location: ${userName} cancelled the SOS sent ${formatWhen(createdAt, timeZone)} ` +
      `(${REASONS[reason] || "cancelled"}). They report being safe. If in doubt, contact them directly.`
  };
}

export function testMessage({ userName }) {
  return {
    subject: `${userName} added you as a trusted contact`,
    body:
      `Test from Safe Location: ${userName} added you as a trusted contact. If they send an SOS, you will get ` +
      "a message like this with their location. No action is needed now."
  };
}

/* ---------- Trip messages (Phase 7) ----------
   These describe facts only. A missed check-in does NOT mean the person is in danger: their phone may be
   off, out of battery or without signal. The wording says so and never claims anything worse. */

// The newest location the server received for a trip, with its honest age.
export function describeTripLocation(trip, now) {
  if (trip.lastLatitude === null || trip.lastLatitude === undefined) return "No location has been received for this trip.";
  const ageMs = Math.max(0, now - tripLocationTime(trip));
  const coords = `${trip.lastLatitude.toFixed(5)}, ${trip.lastLongitude.toFixed(5)}`;
  const map = `https://www.openstreetmap.org/?mlat=${trip.lastLatitude.toFixed(5)}&mlon=${trip.lastLongitude.toFixed(5)}#map=17/${trip.lastLatitude.toFixed(5)}/${trip.lastLongitude.toFixed(5)}`;
  return `Last confirmed location, ${formatAge(ageMs)} old (±${Math.round(trip.lastAccuracy)} m), may be out of date: ${coords} ${map}`;
}

// The device's own time for the newest point, unless it is implausible next to when the server got it.
export function tripLocationTime(trip) {
  const fix = trip.lastFixAt;
  const received = trip.lastReceivedAt;
  if (!fix) return received;
  const lag = received - fix;
  return lag >= -5 * 60 * 1000 && lag <= 7 * 24 * 60 * 60 * 1000 ? fix : received;
}

const route = (trip) => `from ${trip.origin} to ${trip.destination}`;

export function tripStartedMessage({ userName, trip, timeZone }) {
  const by = trip.expectedArrivalAt ? `, expecting to arrive by ${formatWhen(trip.expectedArrivalAt, timeZone)}` : "";
  return {
    subject: `${userName} started a trip`,
    body: `Safe Location: ${userName} started a trip ${route(trip)}${by}. You were chosen as a trip contact; you'll get a message if they miss a check-in, and when the trip ends.`
  };
}

export function tripMissedCheckinMessage({ userName, trip, now, timeZone }) {
  const what =
    trip.checkinReason === "overdue"
      ? `expected to arrive by ${formatWhen(trip.expectedArrivalAt, timeZone)} on a trip ${route(trip)}, but hasn't ended the trip or confirmed they're OK.`
      : `stopped sending location updates during a trip ${route(trip)} and hasn't answered a check-in.`;
  return {
    subject: `${userName} missed a trip check-in`,
    body:
      `Safe Location trip alert: ${userName} ${what} This doesn't necessarily mean something is wrong: their phone may be off or without signal. ` +
      `Please try to contact them. ${describeTripLocation(trip, now)} Safe Location has NOT contacted emergency services (Nigeria: 112).`
  };
}

export function tripCheckedInMessage({ userName, trip }) {
  return {
    subject: `${userName} checked in`,
    body: `Safe Location update: ${userName} has checked in on their trip ${route(trip)} and says they're OK.`
  };
}

export function tripEndedMessage({ userName, trip, outcome, now, timeZone }) {
  const how = outcome === "completed" ? "ended their trip (arrived)" : "cancelled their trip";
  return {
    subject: `${userName} ${outcome === "completed" ? "ended" : "cancelled"} their trip`,
    body: `Safe Location update: ${userName} ${how} ${route(trip)} at ${formatWhen(now, timeZone)}.`
  };
}
