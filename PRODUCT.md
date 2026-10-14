# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Now:** the owner, using it personally and for controlled testing in Nigeria.
- **Later:** the general public in Nigeria — commuters, solo travellers, students, night workers — who want a record
  of where they have been and, in later phases, a way for trusted contacts to help in an emergency.
- Typical moment of use: on a phone, on the move (walking, bus, keke, okada, car), glancing briefly, often outdoors
  in bright sun; also late at night or in unfamiliar areas while feeling unsafe and possibly stressed.
- Secondary moment: reviewing routes and history afterwards on a laptop.

## Product Purpose

A consent-based personal safety and emergency-location platform. The person being tracked starts and stops tracking
themselves; the app records where they are at a chosen interval, shows it on a detailed street map, keeps the history
on the device through connectivity loss, and (in later phases) syncs it and shares it with registered devices,
trip monitoring and emergency contacts.

Success means: when something goes wrong, there is an accurate, honest, timestamped record of where the person was,
and the app was simple enough to start and trust under stress.

## Positioning

Explicit, informed consent of the person being located is the core mechanism. No covert tracking, no tracking of
phone numbers or other people without their authorisation, no telecom interception. The app is honest about
uncertainty: it shows accuracy, flags doubtful positions, marks data gaps, and never fabricates streets, routes,
addresses, accuracy, delivery of notifications or test results.

## Operating Context

- Phones are commonly low-to-mid-range Android devices; mobile data is patchy (3G/4G) and costs money, so data use
  and offline behaviour matter.
- Browsers pause GPS and timers when the screen locks or the tab is backgrounded; reliable background tracking will
  need a native app in a later phase.
- OpenStreetMap coverage varies across Nigeria; many streets are unnamed in map data.
- Built phase by phase by a beginner developer using AI assistance; each phase is confirmed working before the next.

## Capabilities and Constraints

- Phase 2 (current): browser geolocation; one saved point per interval (1, 2, 5 or 10 minutes, default 1); Leaflet
  map with OpenStreetMap tiles (optional CARTO dark tiles with a key in a git-ignored `config.js`); route polylines
  per trip with gap and GPS-jump handling; IndexedDB history with session IDs and sync state; single-tab tracking
  lock.
- Phase 3: local Node.js + Fastify server with SQLite (built into Node) that serves the site and an API; batch
  upload of locally stored points with bounded exponential backoff, idempotent by record ID.
- Phase 7 (current): Trip Mode: monitored journeys (origin, destination, optional expected arrival, interval,
  chosen contacts) with a server-side watchdog for missed arrival / stopped updates, check-in requests, and
  contact messages that follow the person's escalation choice and never claim danger; pause/resume/end; offline
  action queue; trip history with route maps; every location shown with age and accuracy.
- Phase 6: offline-first collection and store-and-forward sync: offline copy of the tracker page
  (service worker), queue survives refreshes and outages, exactly-once upload, separate internet / server / GPS /
  permission states, last successful sync time, Sync now, storage-full safety net, uploads refused when the signed-in
  account differs. Browsers still cannot track in the background or after the page is closed.
- Phase 5: trusted contacts (up to 10, SMS and/or email), SOS with countdown, fresh-or-last-known
  location (labelled with age and accuracy), battery/connection only when available, offline retry queue,
  cancellation with "I'm safe" updates, per-message submission and delivery status, audit log, per-user rate
  limits. Notifications are simulated until Twilio SMS is configured. Never contacts emergency services; always
  shows "Call 112".
- Phase 4: accounts via Better Auth (email + password, email verification, password reset, HttpOnly
  session cookies, account deletion); named devices per user; per-user authorization on every query; dashboard for
  devices, trips and sessions. Points upload only to the account they were recorded under. Still local-only: no
  real email delivery or HTTPS yet.
- Planned later phases: offline sync to a backend, secure accounts, registered devices, trip monitoring, emergency
  contacts / SOS.
- Stack: plain HTML, CSS and JavaScript with no build step in the browser; Node.js + Fastify + SQLite on the server;
  Node's test runner for API tests and Playwright for browser tests.
- No production secrets or credentials in Git. No publicly accessible location histories.
- Simulated locations only in clearly labelled development/test mode.
- Open decision: commercial map/geocoding provider for public launch (OpenStreetMap free services are for light use).

## Brand Commitments

- Name: Safe Location.
- Voice: plain, calm, honest English; explains what happened and what to do next; never overclaims safety or
  security.
- Requested by the owner: a serious, premium technology-company feel (not a student project), dark navy and charcoal
  with a professional blue accent, map as the priority, restrained motion, no decorative charts or fabricated data.

## Evidence on Hand

None yet: no users, testimonials, metrics or partner logos. Future work must not invent any.

## Product Principles

1. **Consent first.** The tracked person is always in control and always knows when tracking is on.
2. **Honest data.** Show accuracy, gaps and doubtful points plainly; never invent or smooth over what is unknown.
3. **Works under stress.** The primary action is obvious and reachable in one tap on a phone, at night, in sunlight.
4. **Light on data and battery.** Respect costly mobile data and modest phones; degrade gracefully offline.
5. **Private by default.** History stays on the device unless the person chooses otherwise; say clearly what is
   sent to third-party services.

## Accessibility & Inclusion

- Target WCAG 2.2 AA: contrast, keyboard operation, screen-reader labels, visible focus, tap targets of at least
  24×24 CSS px (aim for 44×44 for primary controls).
- Low-vision and older users matter: readable text sizes, high contrast, unambiguous controls and states that do not
  rely on colour alone.
- English only for now; Nigerian languages (Pidgin, Yoruba, Hausa, Igbo) planned later, so keep UI text in
  translatable, self-contained strings and avoid text baked into images.
