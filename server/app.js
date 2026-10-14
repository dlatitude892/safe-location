// Builds the Fastify server: security headers, rate limits, accounts (Better Auth), the API and the pages.
// `buildApp` receives its database, auth service and mailer, so tests can create isolated servers in memory.
//
// Authorization rule used by every data route: the signed-in user comes ONLY from the session cookie,
// and every database call is filtered by that user's ID. IDs in the URL or body (device, trip, record)
// are looked up inside the user's own data; anything else is "not found".
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import {
  batchBodySchema, listQuerySchema, deviceNameBodySchema, deviceParamsSchema, removeDeviceQuerySchema, tripParamsSchema,
  cleanDeviceName, validateRecord, encodeCursor, decodeCursor
} from "./validation.js";
import { registerEmergencyRoutes } from "./emergency-routes.js";
import { registerTripRoutes } from "./trip-routes.js";

const SITE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = "text/html; charset=utf-8";
const JS = "text/javascript; charset=utf-8";
const FONT = "font/woff2";
const FONT_CACHE = "public, max-age=2592000"; // 30 days: fonts rarely change, and repeat downloads cost data

// Only these files are served to browsers. Everything else (server code, .env, databases) is never reachable.
const PAGES = {
  "/": { file: "index.html" },
  "/welcome": { file: "welcome.html" }, // public landing page: what Safe Location is and is not
  "/index.html": { file: "index.html" },
  "/signin": { file: "signin.html" },
  "/signup": { file: "signup.html" },
  "/forgot-password": { file: "forgot-password.html" },
  "/reset-password": { file: "reset-password.html" },
  "/account": { file: "account.html", signedIn: true },
  "/emergency": { file: "emergency.html", signedIn: true },
  "/trips": { file: "trips.html", signedIn: true }
};
const ASSETS = {
  "/app.js": { file: "app.js", type: JS },
  "/auth-pages.js": { file: "auth-pages.js", type: JS },
  "/account.js": { file: "account.js", type: JS },
  "/emergency.js": { file: "emergency.js", type: JS },
  "/trips.js": { file: "trips.js", type: JS },
  "/sw.js": { file: "sw.js", type: JS }, // offline copy of the tracker page (Phase 6)
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  "/landing.css": { file: "landing.css", type: "text/css; charset=utf-8" },
  "/landing.js": { file: "landing.js", type: JS },
  "/config.js": { file: "config.js", type: JS, optional: true },
  // Self-hosted Geist typeface (SIL Open Font License, fonts/LICENSE-Geist.txt). The browser only downloads
  // the Latin Extended and Vietnamese files when a page contains those letters (for example ẹ, ọ, ṣ, ₦).
  "/fonts/geist-latin.woff2": { file: "fonts/geist-latin.woff2", type: FONT, cache: FONT_CACHE },
  "/fonts/geist-latin-ext.woff2": { file: "fonts/geist-latin-ext.woff2", type: FONT, cache: FONT_CACHE },
  "/fonts/geist-vietnamese.woff2": { file: "fonts/geist-vietnamese.woff2", type: FONT, cache: FONT_CACHE }
};

// Content Security Policy: pages may only run code from this site and Leaflet's pinned CDN copy.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' https://unpkg.com",
  "img-src 'self' data: https://tile.openstreetmap.org https://basemaps.cartocdn.com https://unpkg.com",
  "connect-src 'self' https://nominatim.openstreetmap.org https://unpkg.com", // unpkg: the offline cache fetches Leaflet
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function apiError(reply, status, code, message) {
  return reply.code(status).send({ error: { code, message } });
}

// Simple fixed-window rate limiter kept in memory (enough for one local server process).
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now - entry.start >= windowMs) hits.delete(key);
  }, windowMs);
  timer.unref();
  return {
    take(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || now - entry.start >= windowMs) {
        hits.set(key, { start: now, count: 1 });
        return { allowed: true };
      }
      entry.count += 1;
      return entry.count <= limit ? { allowed: true } : { allowed: false, retryAfterSeconds: Math.ceil((entry.start + windowMs - now) / 1000) };
    },
    stop: () => clearInterval(timer)
  };
}

export function buildApp({ config, db, authService, mailer, providers, dispatcher, logger = true }) {
  const { auth } = authService;
  const app = Fastify({
    logger: logger && { level: config.logLevel, redact: ["req.headers.authorization", "req.headers.cookie"] },
    bodyLimit: 256 * 1024, // 100 records are about 40 KB
    ajv: { customOptions: { removeAdditional: false } } // reject unknown fields instead of silently dropping them
  });
  app.removeContentTypeParser("text/plain"); // the API only accepts JSON

  const apiLimiter = createRateLimiter(config.apiRateLimitPerMinute, 60 * 1000);
  app.addHook("onClose", async () => apiLimiter.stop());

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin"); // OpenStreetMap's tile policy needs a referrer
    reply.header("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
    reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    if (request.url.startsWith("/api/") || request.url.startsWith("/dev/")) reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.addHook("onRequest", async (request, reply) => {
    const isApi = request.url.startsWith("/api/") || request.url.startsWith("/dev/");
    if (!isApi) return undefined;

    const verdict = apiLimiter.take(request.ip);
    if (!verdict.allowed) {
      reply.header("Retry-After", String(verdict.retryAfterSeconds));
      return apiError(reply, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    // Cross-site request forgery protection for our own API: changes must come from our own pages.
    // (Better Auth applies the same check to /api/auth itself.)
    if (UNSAFE_METHODS.has(request.method) && !request.url.startsWith("/api/auth/")) {
      if (!config.trustedOrigins.includes(request.headers.origin)) {
        return apiError(reply, 403, "bad_origin", "This request must come from the Safe Location website.");
      }
    }
    return undefined;
  });

  // Errors: clear JSON for the client, details only in the server log, never stack traces or SQL.
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) return apiError(reply, 400, "invalid_request", error.message);
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") return apiError(reply, 413, "payload_too_large", "The request is too large.");
    if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return apiError(reply, 415, "unsupported_media_type", "Send JSON (Content-Type: application/json).");
    if (error.statusCode >= 400 && error.statusCode < 500) return apiError(reply, error.statusCode, "invalid_request", "The request could not be read.");
    request.log.error({ err: error }, "Unhandled server error");
    return apiError(reply, 500, "server_error", "Something went wrong on the server. Your data is still safe on your device.");
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/dev/")) return apiError(reply, 404, "not_found", "Not found.");
    return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  });

  // Every data route runs this first (before the request body is even read). The user comes only from
  // the session cookie.
  async function requireUser(request, reply) {
    const session = await authService.getSession(request);
    if (!session || !session.user) {
      return apiError(reply, 401, "unauthenticated", "Please sign in.");
    }
    if (!session.user.emailVerified) {
      return apiError(reply, 403, "email_not_verified", "Please confirm your email address first.");
    }
    request.user = session.user;
    request.authSession = session.session;
    return undefined;
  }

  /* ---------- Accounts: Better Auth handles everything under /api/auth ---------- */

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const headers = fromNodeHeaders(request.headers);
      // Rate limits use the real connection address; never trust a client-supplied forwarding header.
      headers.set("x-forwarded-for", request.ip);
      headers.delete("content-length");
      const init = { method: request.method, headers };
      if (request.method === "POST") init.body = JSON.stringify(request.body ?? {});

      const response = await auth.handler(new Request(new URL(request.url, config.publicUrl), init));
      reply.code(response.status);
      response.headers.forEach((value, key) => {
        if (!["set-cookie", "content-length", "content-encoding", "transfer-encoding"].includes(key)) reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      const body = await response.text();
      return reply.send(body.length ? body : undefined);
    }
  });

  /* ---------- API ---------- */

  app.get("/api/v1/health", async (request, reply) => {
    let database = "ok";
    try {
      db.ping();
    } catch (error) {
      request.log.error({ err: error }, "Database health check failed");
      database = "unavailable";
    }
    const healthy = database === "ok";
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? "ok" : "degraded", database, time: Date.now() });
  });

  // Devices of the signed-in user.
  app.get("/api/v1/devices", { onRequest: requireUser }, async (request) => ({ devices: db.listDevices(request.user.id) }));

  app.post("/api/v1/devices", { onRequest: requireUser, schema: { body: deviceNameBodySchema } }, async (request, reply) => {
    const name = cleanDeviceName(request.body.name);
    if (!name) return apiError(reply, 400, "invalid_request", "Give the device a name of 1–60 characters.");
    if (db.listDevices(request.user.id).length >= 20) {
      return apiError(reply, 409, "too_many_devices", "You can register up to 20 devices. Remove one first.");
    }
    const device = db.createDevice({ id: crypto.randomUUID(), ownerId: request.user.id, name, now: Date.now() });
    return reply.code(201).send({ device });
  });

  app.patch(
    "/api/v1/devices/:deviceId",
    { onRequest: requireUser, schema: { params: deviceParamsSchema, body: deviceNameBodySchema } },
    async (request, reply) => {
      const name = cleanDeviceName(request.body.name);
      if (!name) return apiError(reply, 400, "invalid_request", "Give the device a name of 1–60 characters.");
      if (!db.renameDevice(request.user.id, request.params.deviceId, name)) return apiError(reply, 404, "device_not_found", "Device not found.");
      return { device: { id: request.params.deviceId, name } };
    }
  );

  app.delete(
    "/api/v1/devices/:deviceId",
    { onRequest: requireUser, schema: { params: deviceParamsSchema, querystring: removeDeviceQuerySchema } },
    async (request, reply) => {
      const result = db.removeDevice(request.user.id, request.params.deviceId, { deleteLocations: request.query.deleteLocations });
      if (!result.removed) return apiError(reply, 404, "device_not_found", "Device not found.");
      return result;
    }
  );

  // Upload a batch of locally stored records from one of the user's own devices. Safe to repeat.
  app.post("/api/v1/locations/batch", { onRequest: requireUser, schema: { body: batchBodySchema } }, async (request, reply) => {
    // The sign-in cookie is shared by every tab. If someone else signed in from another tab, an older tab
    // could otherwise upload the previous person's points into this account.
    if (request.body.accountId !== request.user.id) {
      return apiError(reply, 409, "account_mismatch", "These points were recorded under a different account than the one signed in.");
    }
    const device = db.findActiveDevice(request.user.id, request.body.deviceId);
    if (!device) {
      // Same answer whether the device was removed, never existed, or belongs to someone else.
      return apiError(reply, 404, "device_not_found", "This device is not registered to your account.");
    }

    const now = Date.now();
    const valid = [];
    const rejected = [];
    const seen = new Set();
    for (const input of request.body.records) {
      const { record, error } = validateRecord(input, now);
      const id = input && typeof input.id === "string" ? input.id.slice(0, 80) : null;
      if (error) rejected.push({ id, reason: error });
      else if (seen.has(record.id)) rejected.push({ id, reason: "The same id appears twice in this batch." });
      else {
        seen.add(record.id);
        valid.push(record);
      }
    }

    const stored = valid.length ? db.insertLocations({ device, records: valid, now }) : { accepted: [], duplicates: [], conflicts: [] };
    stored.conflicts.forEach((id) => rejected.push({ id, reason: "This id cannot be used." }));
    db.touchDevice(device.id, now);

    // Trip Mode: the newest stored point of each trip becomes that trip's "last confirmed location".
    const storedIds = new Set([...stored.accepted, ...stored.duplicates]);
    const newestPerSession = new Map();
    valid.filter((record) => storedIds.has(record.id)).forEach((record) => {
      const best = newestPerSession.get(record.sessionId);
      if (!best || record.deviceTimestamp > best.deviceTimestamp) newestPerSession.set(record.sessionId, record);
    });
    newestPerSession.forEach((record, sessionId) => db.noteTripLocation(request.user.id, sessionId, record, now));
    return { accepted: stored.accepted, duplicates: stored.duplicates, rejected, serverReceivedAt: now };
  });

  // The user's own history, optionally for one of their devices or trips, in pages.
  app.get("/api/v1/locations", { onRequest: requireUser, schema: { querystring: listQuerySchema } }, async (request, reply) => {
    const after = decodeCursor(request.query.cursor);
    if (!after) return apiError(reply, 400, "invalid_request", "The cursor is not valid.");
    const { limit, deviceId, sessionId } = request.query;
    const rows = db.listLocations({ ownerId: request.user.id, deviceId, sessionId, after, limit: limit + 1 });
    const page = rows.slice(0, limit);
    return { records: page, nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null };
  });

  // Recordings: every Start-to-Stop run of uploaded points (Phase 4; called "trips" before Phase 7).
  app.get("/api/v1/recordings", { onRequest: requireUser }, async (request) => ({ recordings: db.listRecordings(request.user.id) }));

  app.delete("/api/v1/recordings/:sessionId", { onRequest: requireUser, schema: { params: tripParamsSchema } }, async (request, reply) => {
    const deleted = db.deleteRecording(request.user.id, request.params.sessionId);
    if (!deleted) return apiError(reply, 404, "recording_not_found", "Recording not found.");
    return { deletedLocations: deleted };
  });

  app.get("/api/v1/account/summary", { onRequest: requireUser }, async (request) => db.countForOwner(request.user.id));

  // Emergency contacts, SOS events, notifications and the audit log (Phase 5).
  app.decorate("emergency", registerEmergencyRoutes(app, { db, config, providers, dispatcher, requireUser, createRateLimiter, apiError }));

  // Trip Mode (Phase 7).
  registerTripRoutes(app, { db, config, dispatcher, requireUser, createRateLimiter, apiError });

  /* ---------- Development-only helpers (DEV_TEST_ENDPOINTS=true, local server only) ---------- */

  if (config.devTestEndpoints) {
    // Read verification and reset emails that would normally arrive in a real inbox.
    app.get("/dev/outbox", async (request) => {
      const to = typeof request.query.to === "string" ? request.query.to : undefined;
      return { messages: mailer.list(to) };
    });
    // Make the caller's OWN session expire now, to test what happens when a session runs out.
    app.post("/dev/expire-my-session", { onRequest: requireUser }, async (request) => {
      authService.expireSession(request.authSession.id);
      return { expired: true };
    });
  }

  /* ---------- Pages and files ---------- */

  async function readSiteFile(entry) {
    try {
      return await fs.promises.readFile(path.join(SITE_ROOT, entry.file));
    } catch (error) {
      // config.js is optional and git-ignored; serve an empty config instead of a 404.
      if (error.code === "ENOENT" && entry.optional) return "window.SAFE_LOCATION_CONFIG = window.SAFE_LOCATION_CONFIG || {};\n";
      throw error;
    }
  }

  for (const [route, entry] of Object.entries(PAGES)) {
    app.get(route, async (request, reply) => {
      if (entry.signedIn) {
        const session = await authService.getSession(request);
        if (!session) {
          const error = typeof request.query.error === "string" ? `&error=${encodeURIComponent(request.query.error.slice(0, 40))}` : "";
          return reply.redirect(`/signin?next=${encodeURIComponent(route)}${error}`);
        }
      }
      return reply.type(HTML).header("Cache-Control", "no-store").send(await readSiteFile(entry));
    });
  }

  for (const [route, entry] of Object.entries(ASSETS)) {
    app.get(route, async (request, reply) => reply.type(entry.type).header("Cache-Control", entry.cache || "no-cache").send(await readSiteFile(entry)));
  }

  return app;
}
