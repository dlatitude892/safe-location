// Safe Location service worker (Phase 6): lets the tracker page open and reload without a connection.
//
// What it caches: only the public tracker page and its files, its fonts, plus the pinned Leaflet library.
// What it never touches: API requests, sign-in, account and emergency pages, map tiles. Those always go
// to the network, so private data is never stored here and nothing can be served stale.
//
// Strategy: network first for the page files (you always get the newest version when online), the
// cached copy only when the network fails. Leaflet's URL is versioned, so its cached copy is used first.
"use strict";

const CACHE = "safe-location-shell-v3"; // change the number when the cached file list changes
const SHELL = ["/", "/app.js", "/style.css", "/config.js"];
const FONTS = ["/fonts/geist-latin.woff2", "/fonts/geist-latin-ext.woff2", "/fonts/geist-vietnamese.woff2"];
const LEAFLET = ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      try { await cache.add(FONTS[0]); } catch { /* the other fonts are cached when first used */ }
      // Leaflet is loaded with integrity checks, so it must be fetched in CORS mode. Best effort: if the
      // CDN can't be reached now, the offline copy still works (just without the map) and Leaflet is
      // cached the next time the page loads it online.
      await Promise.all(
        LEAFLET.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { mode: "cors", credentials: "omit" }));
            if (response.ok) await cache.put(url, response);
          } catch {
            /* not cached this time */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("safe-location-shell-") && name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request.url);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request.url, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    const path = url.pathname === "/index.html" ? "/" : url.pathname;
    if (SHELL.includes(path)) event.respondWith(networkFirst(request, path));
    else if (FONTS.includes(path)) event.respondWith(cacheFirst(request));
    return; // everything else on this site (API, account pages…) goes straight to the network
  }
  if (LEAFLET.includes(url.href)) event.respondWith(cacheFirst(request));
});
