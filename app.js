// Safe Location V1: everything happens in the browser. No account or server is used.
const STORAGE_KEY = "safe-location-history";
const MAX_HISTORY_POINTS = 100;
const LOCATION_NAME_MOVEMENT_THRESHOLD_METERS = 50;

const elements = {
  start: document.querySelector("#start-button"),
  stop: document.querySelector("#stop-button"),
  clear: document.querySelector("#clear-button"),
  message: document.querySelector("#message"),
  state: document.querySelector("#tracking-state"),
  latitude: document.querySelector("#latitude"),
  longitude: document.querySelector("#longitude"),
  locationName: document.querySelector("#location-name"),
  accuracy: document.querySelector("#accuracy"),
  lastUpdate: document.querySelector("#last-update"),
  historyList: document.querySelector("#history-list"),
  historyCount: document.querySelector("#history-count")
};

let watchId = null;
let history = loadHistory();
let map;
let currentMarker;
let accuracyCircle;
let historyLayer;
let lastNamedPoint = null;
let locationNameRequest;

function loadHistory() {
  try {
    const savedHistory = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(savedHistory) ? savedHistory : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    setMessage("Your browser could not save location history.", "error");
  }
}

function initMap() {
  if (typeof L === "undefined") {
    document.querySelector("#map").textContent = "The map could not load. Location tracking can still save points below.";
    return;
  }
  map = L.map("map", { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  historyLayer = L.layerGroup().addTo(map);
  drawHistoryOnMap();
}

function setMessage(text, type = "") {
  elements.message.textContent = text;
  elements.message.className = `message${type ? ` is-${type}` : ""}`;
}

function setTrackingUI(isTracking) {
  elements.start.disabled = isTracking;
  elements.stop.disabled = !isTracking;
  elements.state.textContent = isTracking ? "Tracking active" : "Not tracking";
  elements.state.classList.toggle("is-active", isTracking);
}

function formatCoordinate(value) { return Number(value).toFixed(6); }
function formatTime(timestamp) { return new Date(timestamp).toLocaleString(); }
function formatAccuracy(value) { return `${Math.round(value)} m`; }

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

async function updateLocationName(point) {
  // Avoid repeatedly sending nearly identical coordinates to the lookup service.
  if (
    lastNamedPoint &&
    distanceInMeters(lastNamedPoint, point) < LOCATION_NAME_MOVEMENT_THRESHOLD_METERS
  ) {
    return;
  }

  if (locationNameRequest) locationNameRequest.abort();
  locationNameRequest = new AbortController();
  elements.locationName.textContent = "Finding location name...";

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: point.latitude,
      lon: point.longitude,
      zoom: "18"
    });
    const response = await fetch(url, { signal: locationNameRequest.signal });
    if (!response.ok) throw new Error("Location name lookup failed");

    const result = await response.json();
    elements.locationName.textContent = result.display_name || "No location name found";
    lastNamedPoint = point;
  } catch (error) {
    if (error.name !== "AbortError") {
      elements.locationName.textContent = "Location name unavailable";
    }
  }
}

function startTracking() {
  if (!navigator.geolocation) {
    setMessage("This browser does not support location tracking.", "error");
    return;
  }
  if (watchId !== null) return;

  setMessage("Requesting location permission...");
  watchId = navigator.geolocation.watchPosition(handlePosition, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 15000
  });
  setTrackingUI(true);
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  setTrackingUI(false);
  setMessage("Tracking stopped. Your saved history is still on this device.");
}

function handlePosition(position) {
  const point = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp
  };

  elements.latitude.textContent = formatCoordinate(point.latitude);
  elements.longitude.textContent = formatCoordinate(point.longitude);
  elements.accuracy.textContent = formatAccuracy(point.accuracy);
  elements.lastUpdate.textContent = formatTime(point.timestamp);

  updateLocationName(point);

  history.unshift(point);
  history = history.slice(0, MAX_HISTORY_POINTS);
  saveHistory();
  renderHistory();
  updateMap(point);
  setMessage("Location updated and saved on this device.", "success");
}

function handleLocationError(error) {
  const messages = {
    [error.PERMISSION_DENIED]: "Location permission was denied. Allow location in your browser settings, then try again.",
    [error.POSITION_UNAVAILABLE]: "Your location is currently unavailable. Check your connection or try again outside.",
    [error.TIMEOUT]: "Location took too long to respond. Please try again."
  };
  stopTracking();
  setMessage(messages[error.code] || "An unexpected location error occurred.", "error");
}

function updateMap(point) {
  if (!map) return;
  const location = [point.latitude, point.longitude];
  if (currentMarker) map.removeLayer(currentMarker);
  if (accuracyCircle) map.removeLayer(accuracyCircle);

  currentMarker = L.marker(location).addTo(map).bindPopup("Current position");
  accuracyCircle = L.circle(location, {
    radius: point.accuracy,
    color: "#075985",
    fillColor: "#075985",
    fillOpacity: 0.12,
    weight: 1
  }).addTo(map);
  map.setView(location, 16);
}

function drawHistoryOnMap() {
  if (!historyLayer) return;
  historyLayer.clearLayers();
  history.slice().reverse().forEach((point) => {
    L.circleMarker([point.latitude, point.longitude], {
      radius: 4,
      color: "#075985",
      fillColor: "#075985",
      fillOpacity: 0.55,
      weight: 1
    }).addTo(historyLayer).bindPopup(`Saved point: ${formatTime(point.timestamp)}`);
  });
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.historyCount.textContent = `${history.length} saved point${history.length === 1 ? "" : "s"}`;
  drawHistoryOnMap();

  if (history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-history";
    empty.textContent = "No saved points yet. Start tracking to create a history.";
    elements.historyList.append(empty);
    return;
  }

  history.forEach((point, index) => {
    const item = document.createElement("li");
    item.className = "history-item";
    const number = document.createElement("span");
    number.className = "history-number";
    number.textContent = index + 1;
    const info = document.createElement("div");
    const coordinates = document.createElement("p");
    coordinates.className = "history-coordinates";
    coordinates.textContent = `${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}`;
    const meta = document.createElement("p");
    meta.className = "history-meta";
    meta.textContent = `${formatAccuracy(point.accuracy)} accuracy - ${formatTime(point.timestamp)}`;
    info.append(coordinates, meta);
    item.append(number, info);
    elements.historyList.append(item);
  });
}

function clearHistory() {
  if (history.length === 0) {
    setMessage("There is no saved history to clear.");
    return;
  }
  if (!window.confirm("Clear all saved location points from this browser?")) return;
  history = [];
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
  setMessage("Saved location history cleared.", "success");
}

elements.start.addEventListener("click", startTracking);
elements.stop.addEventListener("click", stopTracking);
elements.clear.addEventListener("click", clearHistory);

initMap();
renderHistory();
