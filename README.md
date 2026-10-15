# Safe Location

A consent-based personal safety location tracker. You start and stop tracking yourself; nothing is tracked
without your action.

**Current phase: 7.** Trip Mode: monitored journeys with check-ins and contact notifications (see below).
Phase 6: Points are collected offline, survive refreshes and outages, and upload exactly once when
a connection returns (see "Offline collection" below, including what browsers **cannot** do in the background).
Earlier phases: The browser records locations locally and, if you sign in and register it, backs them up
to your account. You can keep a list of trusted contacts and send them an **SOS** with your location. In
development, alerts are **simulated**: nothing is really sent until a provider (Twilio SMS) is configured. The
server still only runs on your own computer. Real email delivery and HTTPS deployment come later.

## Quick start

First time only:

```bash
npm install
```

Create your settings file `.env` (never committed) by copying the example:

```bash
cp .env.example .env
```

Put a random value after `BETTER_AUTH_SECRET=` in `.env`. This command prints one you can paste:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Start the website, accounts and API together:

```bash
npm run dev
```

Open <http://localhost:3000>. Stop the server with `Ctrl+C`.

## The tracker layout (Phase 8: map first)

The tracker is a full-screen map with everything else one swipe away.

**On a phone**
* **Top bar:** the logo, the **status pill** (one short line such as "Recording · every 1 minute", coloured violet
  when all is well, amber when something needs attention, red for SOS or a check-in), and your account initials.
  Tap the pill to show or hide the details.
* **On the map:** only **Recenter** (it also turns "follow my position" back on), **Call 112** and the red **SOS**
  button. Pinch to zoom.
* **The sheet** at the bottom has three heights. Drag its handle, or tap it:
  1. **Peek:** the state ("Tracking active"), the next reading, the latest message, and the main buttons
     (Start Tracking, or Stop tracking + Start a trip, or the trip's Pause + End trip).
  2. **Half:** adds the four readings (GPS, connection, backup, saved points or trip).
  3. **Full:** everything: Trip Mode, location history, recording interval, backup and sync, latest location,
     statistics, and map settings (Dark/Street, Follow my position, map key). At this height SOS and Call 112
     move into a row at the top of the sheet, so they never cover a form.

**On a computer** (960px and wider) the sheet is a panel on the left and the map fills the rest.

**SOS:** tap the red button for the 5-second countdown (Cancel is the first button). A sent SOS opens over the map
with each contact's status; **Hide** shows the map again, the SOS button keeps pulsing, and a red banner at the top
of the sheet keeps it in view. If SOS isn't available (not signed in, or no trusted contacts), the button explains
what's needed and keeps Call 112 in reach.

**Trip check-in:** "Are you OK?" appears over everything, says why (for example "No location has reached the
server for 15 minutes") and what happens next, and **I'm OK** is ready to tap.

### Testing Phase 8 by hand

1. Phone size (DevTools device toolbar, or a real phone on the live site): the map fills the screen, the status pill
   is at the top, and Start Tracking is visible without scrolling.
2. Drag the sheet handle up and down; tap it to step through the three heights; tap the status pill.
3. Start tracking: the pill turns violet and the dot breathes; the route draws on the map with a soft glow.
4. Start a trip while tracking: tracking keeps going (now as part of the trip) and Pause / End trip appear under the
   status.
5. Tap SOS, then Cancel: "SOS not sent." appears next to the button and fades.
6. Signed in with a contact: send an SOS, press Hide, check the pulsing button and the red banner, then Show.
7. Open the full sheet with a form field focused: SOS and Call 112 sit in the row at the top, not over the field.
8. Computer size: the panel is on the left, Recenter is at the top right of the map, SOS at the bottom right.
9. Keyboard only: Tab reaches the sheet handle and every control; Escape closes the SOS panel or cancels a countdown.

## Files

| File | What it does |
|---|---|
| `index.html`, `app.js`, `style.css` | The tracker page. `app.js` is split into numbered sections (settings, storage, tracking, map, rendering, account and backup). |
| `signin.html`, `signup.html`, `forgot-password.html`, `reset-password.html`, `auth-pages.js` | Sign-in, create-account and password-reset pages. |
| `account.html`, `account.js` | The account dashboard: profile, devices, trips, sessions, sign-out, account deletion. Only sent to signed-in users. |
| `emergency.html`, `emergency.js` | Emergency page: trusted contacts, alert settings and preview, SOS history, activity log. Signed-in only. |
| `config.example.js` → `config.js` | Optional browser settings (CARTO map key, `sync: false`). `config.js` is **git-ignored**. |
| `PRODUCT.md` | Product brief: users, purpose, principles, accessibility target. |
| `server/index.js` | Starts the server: reads settings, opens the databases, listens on 127.0.0.1. |
| `server/services.js` | Connects the location database, accounts, email outbox and web server. |
| `server/app.js` | API routes, page serving (and the signed-in check for `/account`), security headers, rate limits, errors. |
| `server/auth.js` | Better Auth configuration: accounts, sessions, email verification, password reset, account deletion. |
| `server/db.js` | Location database (devices, locations). Every query is filtered by the signed-in user's ID. |
| `server/validation.js` | Checks every request body, query and uploaded record; device timestamps are untrusted. |
| `server/mailer.js` | Development email outbox (no real email is sent yet). |
| `server/emergency-store.js` | Contacts, SOS events, messages and audit log tables, always filtered by the signed-in user. |
| `server/emergency-routes.js` | Emergency API: contacts, SOS, cancel, preview, audit log, with rate limits and audit entries. |
| `server/notify/messages.js` | The exact text contacts receive (SOS, "I'm safe", test). |
| `server/notify/providers.js` | Simulated provider (development) and Twilio SMS provider (live). |
| `server/notify/dispatcher.js` | Background sending, retries, delivery checks, and resuming after a restart. |
| `server/config.js` | Reads `.env` and refuses unsafe settings. |
| `server/scripts/create-test-account.js` | Safe way to create a development test account (see below). |
| `trips.html`, `trips.js` | Trip history: your trips, each with its route on a map, facts and message statuses. Signed-in only. |
| `server/trip-store.js` | Trip tables (`trips`, `trip_contacts`) and queries, always filtered by the signed-in user. |
| `server/trip-routes.js` | Trip API: start, list, view, pause, resume, check in, end, delete. |
| `server/trips/watchdog.js` | The server timer that notices a missed arrival or stopped updates and follows your choices. |
| `server/notify/compose.js` | Turns one message into one notification per contact and channel (SOS and trips). |
| `sw.js` | Service worker: offline copy of the tracker page so it can reload without a connection (Phase 6). |
| `server/tests/api.test.js`, `server/tests/emergency.test.js`, `server/tests/trips.test.js` | API tests (Node's built-in test runner). |
| `tests/`, `playwright.config.js` | Browser tests (Playwright). |
| `.env.example` → `.env` | Server settings; `.env` holds the real secret and is **git-ignored**. |
| `data/` | Databases and the development email outbox. **Git-ignored.** |

**Dependencies:** `fastify` (web server), `better-auth` (accounts and sessions), `@playwright/test` (tests only).
Leaflet 1.9.4 loads from unpkg with an integrity hash. Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright).

## Accounts (Phase 4)

### Why Better Auth

The brief asked for an established authentication library rather than home-made login code.
[Better Auth](https://www.better-auth.com) (v1.7) is open source and actively maintained. It runs inside our own
server, so no outside account or service is needed, and it works with the SQLite built into Node. It provides:

* **Registration** with email verification. Sign-in is refused until the address is confirmed.
* **Passwords stored only as salted scrypt hashes.** The plain password is never stored or logged.
* **Sessions in an HttpOnly, SameSite=Lax cookie.** Page scripts, and therefore `localStorage`, can never read
  them. Sessions last 7 days (`SESSION_DAYS`) and are extended once a day while in use.
* **Password reset** by emailed link: valid for 1 hour, works once, and signs out every other session.
* **Sign-out,** a list of signed-in sessions, and "sign out everywhere else".
* **Account deletion,** which needs the password. Our code first deletes every device and location the person owns.
* **Built-in rate limits** on sign-in, sign-up, reset and deletion (`AUTH_RATE_LIMIT_PER_MINUTE`, default 10 per minute).
* **Privacy-friendly answers:** "Email or password is incorrect" either way. The same reply comes back for unknown
  emails on password reset and for addresses that already have an account on sign-up.

Telemetry is switched off. Its tables (`user`, `session`, `account`, `verification`) are in `data/auth.sqlite`.

### How access control works

* The server finds out **who** is calling only from the session cookie, never from anything in the request.
* Every data query includes that person's ID (`WHERE owner_id = ?`). Device IDs, trip IDs and record IDs in a
  request are only searched for **inside the person's own data**. Someone else's device ID gives "not found" (404),
  the same answer as an ID that never existed, so nothing is revealed.
* Uploads must name one of the person's own, not-removed devices.
* Changes (POST, PATCH, DELETE) must come from this site's own pages (`Origin` check), which protects against
  cross-site request forgery. The `SameSite=Lax` cookie adds a second layer.
* `/account` is only sent to signed-in visitors; others are redirected to sign in.
* The browser keeps only non-secret IDs in `localStorage`: the signed-in user's ID and name, and this browser's
  device ID. The Phase 3 device token is deleted on start-up.

### Devices, trips and points on a shared browser

* **An account is optional.** Tracking and local history work without signing in.
* After signing in, the **Backup** card on the tracker page asks you to **name and register this browser** as one
  of your devices. The Account page lists your devices (name, short ID, points, last upload) and lets you rename
  or remove them.
* Each point remembers the account that was signed in when it was recorded, and uploads **only to that account**.
  Points recorded while signed out are uploaded only if you tick "Also back up…" or press "Back up N points
  recorded while signed out". If two people share a browser, one person's points never go to the other's account.

### Deleting data

| What | How | What happens |
|---|---|---|
| One trip | Account page → Uploaded trips → Delete trip | Its uploaded points are deleted from your account. |
| A device | Account page → Devices → Remove | The device can no longer upload. You choose: keep its uploaded points, or delete them. |
| Local history | Tracker → Clear history | Deletes points saved in this browser only. Backed-up copies stay in your account. |
| Sign out | Account page → Sign out | Ends the session. Tick the box to also remove this account's points from this browser (it warns if some are not uploaded yet). |
| The whole account | Account page → Delete account (password + type DELETE) | Deletes the account, sessions, all devices and every uploaded point. Optionally also this browser's copy. |

### Configuration steps

1. `.env` (from `.env.example`). Required: `BETTER_AUTH_SECRET`, at least 32 random characters, used to sign
   sessions and email links. Usually leave the rest as they are:
   * `PUBLIC_URL`: the address you open (`http://localhost:3000`). Emailed links and cookies use it.
   * `AUTH_DATABASE_PATH` and `DATABASE_PATH`: the two SQLite files in `data/`.
   * `SESSION_DAYS` (7), `AUTH_RATE_LIMIT_PER_MINUTE` (10), `API_RATE_LIMIT_PER_MINUTE` (600).
   * `MAIL_OUTBOX_DIR`: where development emails are saved (`data/dev-outbox`).
   * `DEV_TEST_ENDPOINTS=false`: only the automated tests turn this on.
2. Run `npm run dev`. The first start creates the account tables. If the old Phase 3 database is found, its
   anonymous test uploads are removed; your browser still has its own copy and can back it up after you register.
3. **Emails in development:** nothing is really sent. Verification and reset emails are saved as `.txt` files
   in `data/dev-outbox/`. Open the newest file and paste the link into the browser.
4. Never put `BETTER_AUTH_SECRET` or anything from `.env` in `config.js` or any browser file. The browser needs
   no secrets.

### Development test account (safe procedure)

```bash
npm run dev:test-account
```

This creates an already-confirmed account with a random address like `tester-1a2b3c@example.test` and a random
20-character password. Both are printed **once**, nowhere else. To choose the address, add it after `--`, for
example `npm run dev:test-account -- me@example.test`. The script refuses real-looking addresses (only reserved test
domains such as `example.test`), refuses to run when `NODE_ENV=production`, and uses only your local `.env`
databases. Nothing is hard-coded. Delete the account from its Account page when you're done.

### Testing accounts by hand

1. **Register and verify:** open <http://localhost:3000/signup> and create an account. Sign-in is refused until you
   open the link in the newest file in `data/dev-outbox/`. The link opens the Account page.
2. **Register this browser:** back on the tracker, the Backup card asks for a device name. Register, press Start,
   and the header shows "All uploaded". The Account page lists the device and the trip.
3. **Isolation:** in a private window, create a second account. It sees no devices or trips. Copy the first
   account's device ID from the first window's DevTools Console (`account.device.id`) and run this in the second
   window's Console. It must answer **404**:
   ```js
   fetch("/api/v1/locations?deviceId=PASTE_ID").then((r) => r.json()).then(console.log); // → empty list
   fetch("/api/v1/devices/PASTE_ID", { method: "DELETE" }).then((r) => console.log(r.status)); // → 404
   ```
4. **Unauthorized access:** sign out, then open <http://localhost:3000/api/v1/locations>. You get a 401 error.
   Open <http://localhost:3000/account> and you're sent to sign in.
5. **Expired session:** set `SESSION_DAYS=1` in `.env`. You can't wait a day, so instead sign out in another tab
   while tracking. The next upload shows "Your session has ended". Points keep saving and upload after you sign
   in again. (The automated test expires a session directly.)
6. **Account recovery:** "Forgot your password?" → enter the email → open the link in `data/dev-outbox/`. Choose
   a new password. Other signed-in windows are signed out, and the old password stops working.
7. **Deletion:** Account page → Delete account with a wrong password: "Nothing was deleted". With the right
   password: you're signed out, and the account and its uploads are gone.

### Security checklist (Phase 4)

| Item | Status |
|---|---|
| Established auth library (Better Auth), telemetry off | Done |
| Passwords: scrypt hashes only, 10–128 characters | Done, tested |
| Session in HttpOnly + SameSite=Lax cookie; no auth secrets in `localStorage` | Done, tested |
| Email verification required before sign-in | Done, tested |
| Password reset: 1-hour, single-use link; all sessions revoked | Done, tested |
| Every data endpoint requires a valid, unexpired session | Done, tested |
| Per-user authorization on every query; other users' IDs give 404 | Done, tested (API and browser) |
| CSRF: Origin check on all changes, plus SameSite cookie | Done, tested |
| Rate limits: auth endpoints (per IP) and API (per IP), with `Retry-After` | Done, tested |
| Account deletion needs the password; deletes devices and locations first | Done, tested |
| Generic error messages; no stack traces, SQL or account existence leaks | Done, tested |
| Secrets only in `.env` (git-ignored); `.env.example` has no real values; nothing secret in browser files | Done |
| Content-Security-Policy and other security headers on every page | Done |
| Development-only features (email outbox, test endpoints, test-account script) | Clearly marked, off or limited outside tests |
| Real email delivery (SMTP/email API), HTTPS, Secure cookies | **Not yet.** Required before deployment |
| Two-factor authentication, breached-password checks, account lockout alerts | **Not yet.** Recommended before public launch |
| Audit log, data export, backups, retention policy | **Not yet** |

These measures reduce risk; they do not make the system "fully secure". The server must stay local until HTTPS,
real email delivery and a security review are in place.

## Trip Mode (Phase 7)

A **trip** is a monitored journey. You tell Safe Location where you're going and, optionally, when you expect
to arrive. The **server** then watches for a missed arrival or stopped updates, because a phone that is off or
without signal can't raise an alarm itself.

### Using it

On the tracker, the **Trip Mode** card (signed in, browser registered):

1. **Start a trip:**
   * **From / To:** free text, nothing is looked up or guessed.
   * **Expected arrival** (optional).
   * **Recording interval:** 1, 2, 5 or 10 minutes.
   * **Contacts for this trip:** chosen from your trusted contacts.
   * **Check in if no location reaches the server for** 10, 15, 30 or 60 minutes.
   * **If I miss a check-in:** tell my contacts if I don't answer in time (5, 10 or 15 minutes) / tell them
     straight away / only remind me.
   * Optionally, message them when the trip starts and ends.
2. While the trip runs, the card shows:
   * the **state**
   * the expected arrival (or how overdue it is)
   * the **current position**, or "Last known: N min old; may be out of date" when no recent fix exists
   * the **last confirmed location** (newest point the server has confirmed) with its time, age and accuracy
   * how many points are **waiting to upload**
   * the trip's contacts
3. **Pause / Resume:** pausing stops recording; the expected arrival still counts. **End trip** (arrived) or
   **Cancel trip**: recording stops and the points are kept.
4. **Trip history** (`/trips`, signed-in only): every trip with its route on a map, all the facts, and the status
   of every message, which says "delivered" only when the provider confirmed it. Finished trips can be deleted.

While a trip is open, tracking is controlled from the Trip Mode card; the normal Start/Stop buttons are hidden.
When the page is reopened during an active trip, recording resumes by itself (if location permission is granted).

### Trip states

| State | Meaning |
|---|---|
| **Active** | Recording and reaching the server normally. |
| **Offline** | This phone has no internet, or can't reach the server. Points are saved on the phone and upload later. The card warns that you may be asked to check in, and your contacts told, if nothing reaches the server for your chosen period. |
| **Delayed update** | The server hasn't had a recent location (for example uploads are failing or slow), or points have been waiting on this phone longer than 3 intervals. |
| **Check-in requested** | The arrival time passed, or no update reached the server for your chosen period. The card asks "Are you OK?", says exactly what happens next, and the tab title changes to "Check in". **I'm OK** clears it. |
| **Paused** | Not recording, by your choice. |
| **Completed / Cancelled** | Ended. Shown in Trip history. |

A trip started without a connection shows "(not yet registered)". Until the server knows about it, nobody is
watching it, and the card says so.

### What the server does (`server/trips/watchdog.js`)

Every `TRIP_WATCH_INTERVAL_MS` (30 s), for each open trip:

1. **Arrival time passed** (even while paused): it asks for a check-in (reason "overdue"), once per trip.
2. **No update for your chosen period** (not while paused): it asks for a check-in (reason "no-updates").
   Starting, resuming, a received point or a check-in all count as an update.
3. **Check-in not answered:** it follows **your** choice:
   * *Only remind me:* contacts are never messaged.
   * *Tell my contacts if I don't answer in time:* after your grace period.
   * *Tell my contacts straight away:* at once.

   Contacts are told once per missed check-in. If you then check in or end the trip, they are told that too.

**The messages make no claims.** They say what is known, for example "Ada stopped sending location updates during a
trip from Yaba to Lekki and hasn't answered a check-in". They add *"This doesn't necessarily mean something is wrong:
their phone may be off or without signal"*, the last confirmed location **with its age and accuracy**, and that
Safe Location has not contacted emergency services. Nothing ever says the person was kidnapped or is in danger.

### Offline, and how the parts fit

* A trip's ID is also the session ID of its points, so the trip route *is* its points. Points use the same
  offline-safe, exactly-once upload as everything else (Phase 6).
* Trip actions (start, pause, resume, check in, end) are applied on the phone at once and kept in an
  **action queue** (in `localStorage`, with no secrets). They are sent in order when possible, and retried
  every 15 s and when the connection returns. Every server action is safe to repeat.
* The expected arrival is sent as **"in N minutes"**, worked out at the moment it is sent, so a wrong phone clock
  can't make a trip overdue early or late. Times shown on the phone are derived from "how long ago / from now"
  values measured by the server.
* The age of the last confirmed location uses the phone's own fix time, unless that is implausible next to when the
  server received the point (more than 5 minutes in the future or 7 days in the past). Then the server's receive
  time is used.

### Security

Every trip route requires a signed-in, email-verified user and only touches that user's trips. Another
user's trip ID gives "not found", and there are **no public or shareable trip links**. Contacts chosen for a trip
must be your own. Changes must come from this site. Starting trips is rate limited (20 per hour). Trip actions,
check-in requests, alerts and failures are in the audit log. Account deletion removes trips, routes and messages.

### Testing Phase 7 by hand

Start `npm run dev`, sign in, register this browser, and add a trusted contact (Emergency page). Notifications are
simulated: read them in `data/dev-outbox/`.

1. **Start:** Trip Mode → Start a trip. Fill in From/To, set an arrival time a few minutes ahead, pick a contact,
   and tick "message my trip contacts when the trip starts". The card shows **Active**, and a SIMULATED "started a
   trip" message appears in the outbox.
2. **Pause / resume:** Pause. The badge says **Paused** and no new points are added. Resume and recording continues
   in the same trip.
3. **End:** End trip, then open **Trip history** → View: the route, facts and messages.
4. **Missing updates:** start a trip with "check in if no location for **10 minutes**" and "tell my contacts if I
   don't answer within **5 minutes**". Go offline (DevTools → Network → Offline) and wait. After about 10 minutes the
   server asks for a check-in, which you see once you're back online. If you don't press **I'm OK** within 5 minutes,
   the contact gets a "missed a check-in" message. Press **I'm OK** and they get "has checked in".
5. **Overdue:** set an arrival time 2 minutes ahead and don't end the trip. After it passes: **Check-in
   requested**, "Your expected arrival time has passed".
6. **Offline journey:** go offline mid-trip and keep moving. The badge says **Offline** and the pending count grows.
   Reconnect: everything uploads, and the server's point count for the trip matches the phone's.
7. **Notification failure:** use a contact number ending in **0000**. Its message shows "Failed to send" in Trip
   history, and is never shown as delivered.
8. **Authorization:** sign out and open `/trips`, which sends you to sign in. With two accounts, one can't open the
   other's trip (`/api/v1/trips/<id>` gives 404).

## Offline collection and store-and-forward sync (Phase 6)

Phase 6 extends the Phase 3–4 queue; there is still exactly one queue: the `locations` store in IndexedDB.

### How a point travels

1. **Collected** while the page is open and the browser allows location (one point per interval).
2. **Saved on the device first** (IndexedDB) with `syncState: "pending"` and the account it belongs to.
3. **Uploaded in batches of 50** when the page loads, after each new point, when the connection returns, when
   the tab becomes visible, or when you press **Sync now**.
4. **Marked "synced" only when the server confirms** the point's ID (accepted, or already stored). Every point
   has a unique ID that is the database's primary key, so re-sending one can never store it twice.
5. **Temporary problems** (no connection, server down, HTTP 408/425/429/5xx) are retried after about 2 s, 4 s,
   8 s … at most every 5 minutes. **Sync now** skips the wait. Nothing is dropped.

### What you see

| Where | States |
|---|---|
| Tracking card (GPS line) | **Location available** (±accuracy, age) · **Waiting for the first GPS fix** · **No recent GPS fix** (none for 2 minutes) · GPS slow / unavailable, retrying · **Location permission denied** · Location: not tracking |
| Header pill | **Online** · **Offline** (the device reports no internet) · **Server unavailable** (internet reported, but the Safe Location server can't be reached or returned an error) |
| Backup and sync card | Connection (**Internet unavailable** / **Server unavailable** / Online, server reachable) · Synchronization (**pending: N points** / **complete** / uploading / paused: sign in or register) · **Last successful sync** (saved, survives refreshes) · Device storage (only shown when there is a problem) · **Sync now** |
| History rows | "Not uploaded", "Rejected by server", "Not saved on device" |

A browser can't tell a broken internet link from a server that is down without contacting a third party. So when
the device reports a connection but the server can't be reached, the message says either may be the cause.

### Keeping it safe and consistent

* **Refreshing offline works.** A small service worker (`sw.js`) keeps an offline copy of the tracker page,
  its script and style, and the pinned Leaflet library. It is network-first, so online you always get the newest
  version. It never stores API responses, account or emergency pages, or map tiles.
* **Expired sign-in:** uploading pauses ("Paused: sign in to upload N points") and the points stay queued through
  refreshes. They upload after you sign in again.
* **Another account signed in** (for example in another tab, since all tabs share one sign-in cookie): every upload
  states which account the points belong to, and the server refuses a mismatch (`409 account_mismatch`). The other
  account's points stay queued on this device.
* **Storage full:** a point that can't be written is **never silently dropped**:
  * It stays in the page's memory.
  * It still uploads if you're signed in and online.
  * It is shown as "Not saved on device", with a clear warning.
  * Leaving the page asks for confirmation while any such point isn't uploaded yet.
  * It is written to storage as soon as space allows.

  The app also warns when the site's storage is 90 % full, and asks the browser to keep its data (the browser may
  refuse). Old points are never deleted to make room.
* **A rate-limited or failing "who is signed in?" check** is treated as a temporary outage, never as signed out.

### What a browser cannot do (background limits)

Be clear about this with anyone relying on Safe Location:

* **Tracking only runs while the page is open.** If the tab or browser is closed, the phone is switched off,
  or the battery dies, nothing is recorded until the page is opened again.
* **Phones pause background pages.** With the screen off, or another app in front, Android and iOS usually stop
  location updates and timers for web pages within seconds to minutes. Recording continues only if the page stays
  open and visible. Even then, battery savers and Low Power Mode may slow it down. Gaps appear on the map as dashed
  lines.
* **The service worker only serves the page.** It cannot collect location in the background: browsers give
  service workers no location access, and stop them when idle.
* **Queued points upload only when the page is open again** and a connection is available. Nothing is sent
  while the browser is closed.
* **Browser data can be lost.** Clearing site data, private/incognito windows, or the browser reclaiming space
  (unless it granted persistent storage) can delete points that haven't been uploaded yet.

Reliable background tracking needs a native app with the operating system's background-location permission.
Even native apps are limited by the OS.

### Testing Phase 6 by hand

1. Sign in, register this browser, and start tracking. Wait for **Synchronization complete** and note the
   **Last successful sync** time.
2. **Go offline:** DevTools → Network → **Offline** (or switch off Wi-Fi/data on a phone). The header shows
   **Offline** and the card shows **Internet unavailable**.
3. Record several points (wait a few intervals, or choose a 1-minute interval). The card shows **Synchronization
   pending: N points** and the rows say "Not uploaded".
4. **Refresh the page while still offline.** It reopens from the offline copy, the same N points are listed, and
   tracking resumes. (The first visit must have been online, so the offline copy exists.)
5. **Go back online.** Within seconds: **Synchronization complete**, a new **Last successful sync** time, and no
   "Not uploaded" rows.
6. **Check exactly once:** on the Account page, the trip's point count equals the number of rows in the tracker
   history. Or in the DevTools Console:
   ```js
   fetch("/api/v1/locations?limit=500").then((r) => r.json()).then((d) => console.log(d.records.length, new Set(d.records.map((r) => r.id)).size));
   ```
   Both numbers must equal the number of points in the history list.
7. **Server unavailable:** stop the server (`Ctrl+C`) while online. The card says **Server unavailable**, points
   queue, and **Sync now** says they are still waiting. Start the server again and press **Sync now** (or wait up to
   30 s): everything uploads.
8. **Permission states:** block location for the site and reload: **Location permission denied**. Allow it again,
   start tracking indoors or with the GPS off: **No recent GPS fix** after 2 minutes without a fix.

## Emergency contacts and SOS (Phase 5)

> **Safe Location does not contact emergency services.** It alerts the trusted contacts you choose. In immediate
> danger, call **112** (Nigeria's emergency number). Every SOS screen shows a "Call 112" link.

### What you can do

* **Emergency page** (`/emergency`, signed-in only): add, edit and remove up to 10 trusted contacts, each with a
  mobile number (SMS) and/or an email. You can switch alerts on or off per contact and send a test message.
  You also choose whether alerts include your location, add a personal note, and see an exact **preview** of the
  message. The page also shows your **SOS history**, with the status of every message, and an **activity log**.
* **SOS card** at the top of the tracker:
  1. **Send SOS** starts a **5-second countdown** with *Send now* and *Cancel*, so a mistaken tap can be stopped.
  2. A **fresh GPS fix** is requested at once. If none arrives in time, the **last known** location is sent with its
     **age and accuracy**. If there is none at all, the alert says **"Location: not available"**. Nothing is guessed.
  3. **Battery** and **connection** details are attached only when the browser actually provides them.
     Otherwise they are recorded as "not available".
  4. The event ID is created on the phone. If the connection drops, the SOS **waits on the device** and is retried
     (2 s, 4 s … at most every 30 s) until the server confirms it, so a retry never alerts anyone twice.
  5. While the SOS is active the card shows each contact's message status. **I'm safe: cancel SOS** stops alerts
     that haven't gone out yet, and sends an "I'm safe" update to contacts who were already alerted.

### Honest delivery status

Each message is stored with a **submission** status (pending → submitted / failed / cancelled) and a separate
**delivery** status (unknown → delivered / failed / unconfirmed).

| Shown as | Meaning |
|---|---|
| Sending… / Retrying… | Not yet accepted by the provider (temporary errors are retried twice). |
| Sent to provider; waiting for delivery confirmation | The provider accepted it. **Not** proof it reached the phone. |
| **Delivered, confirmed by the provider** | Only when the provider (Twilio) reports `delivered`. |
| Delivery confirmed (simulated, nothing really sent) | Development mode only. |
| Not delivered / Failed to send | The provider rejected it, or reported it undelivered. |
| Sent; the provider never confirmed delivery | No answer within 15 minutes (`NOTIFY_POLL_MAX_MS`). |
| Not sent: the SOS was cancelled first | Cancelled before it went out. |

Twilio's `sent` status only means "handed to the mobile network", so it is **not** shown as delivered. Email has
no reliable delivery confirmation, and is simulated for now.

### Notification providers

| Mode | How to turn on | What happens |
|---|---|---|
| **Simulated** (default) | `NOTIFY_MODE=simulated` | Nothing is sent. Every SOS, "I'm safe" and test message is saved to `data/dev-outbox/` with `SIMULATED … NOT SENT` in the subject. Delivery confirmations are simulated after `SIMULATED_DELIVERY_DELAY_MS` and labelled "simulated" everywhere. |
| **Live SMS** | `NOTIFY_MODE=live` + `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` in `.env` | SMS through Twilio's REST API. Delivery is confirmed by asking Twilio for each message's status every 10 s, because this local server can't receive Twilio's callbacks. Email alerts stay simulated. The server refuses to start in live mode with missing credentials. |

**Before switching to live:** the Twilio adapter is tested against a mocked Twilio, not the real service. Send a
test message to your own phone first. SMS to Nigerian numbers can be blocked by Do-Not-Disturb (DND) settings or
sender-ID rules, so check Twilio's Nigeria guidelines or use a local provider such as Termii. Adding one means
writing another adapter in `server/notify/providers.js`.

### Security

* Every route requires a signed-in, email-verified user. The sign-in check runs **before** the request body is
  even read. Every query is filtered by that user, so other people's contacts, SOS events and messages are "not found".
* Changes must come from this site (Origin check). All input is validated strictly: phone numbers in international
  format, emails, location ranges, battery 0–1, and only known connection fields. Unknown fields are rejected.
* Per-user rate limits: 5 SOS per hour (the refusal still says "call 112"), 30 contact changes per hour, 5 test
  messages per hour. These sit on top of the per-IP API limit.
* The database allows **at most one active SOS** per person (a unique index). A second press while active, or a retry with
  the same ID, returns the existing SOS and alerts nobody twice.
* **Audit log** for contact changes, settings changes, SOS sent, repeated presses, rate-limited presses,
  cancellations and failed or undelivered messages. Each entry records time, IP address and browser, but no
  coordinates or message text. You can see your own entries on the Emergency page.
* **No location links to this server.** Alerts carry the coordinates (and an OpenStreetMap link) in the message
  itself. Nothing on this server can be opened by anyone else. Event details are owner-only.
* Twilio credentials live only in `.env` (git-ignored). The browser never sees them.
* Account deletion also deletes contacts, SOS history, messages and audit entries.

### Testing Phase 5 by hand (simulated mode)

Start `npm run dev`, sign in, then open **Emergency** (link on the tracker's SOS card).

1. **Successful alert:** add a contact with any normal number (e.g. `0803 123 4567`, saved as `+2348031234567`).
   On the tracker, press **Send SOS**, then **Send now**. The card shows "sent (simulated), waiting for
   confirmation", then "delivery confirmed (simulated)". Open the newest `data/dev-outbox/*SIMULATED-SMS*` file to
   read the exact text.
2. **Failed alerts:** add a contact whose number ends in **0000**. It is retried, then shown as "failed to send".
   A number ending in **9999** is accepted, then "not delivered". Neither is ever shown as delivered, and both
   appear in the activity log.
3. **Repeated SOS:** while an SOS is active, the card no longer offers Send SOS. Pressing it from another tab, or
   a retry, returns the same SOS: the history still shows one event and one alert per contact. After cancelling,
   the 6th SOS within an hour is refused, with the advice to call 112.
4. **Cancellation:** during the countdown, press **Cancel**: nothing is sent and the history stays empty. After
   sending, press **I'm safe: cancel SOS** and pick a reason. The history shows "Cancelled", and alerted contacts get
   an "I'm safe" message in the outbox. To see an unsent alert stopped, use a 0000 contact (it is waiting to retry)
   and cancel quickly: it shows "Not sent: the SOS was cancelled first".
5. **Unavailable location:** block location for the site (address-bar icon → Location → Block), reload, and
   send an SOS without having tracked: "No location was available to send", and the message says "Location: not
   available". For **last known**: track for a minute, stop, block location, wait a few minutes, then send. It
   says "Last known location sent: N min old, ±X m".
6. **Offline:** DevTools → Network → Offline, then send an SOS. The card says it's waiting and to call 112.
   Go back online and it is sent automatically.

## Run it locally

Use `npm run dev` (see Quick start). Location only works on secure pages (`https://…` or `http://localhost`);
opening `index.html` by double-clicking (`file://`) is not reliable.

`npm run start:static` (a plain file server on port 8000) still works for the map and local history, but accounts
and backup need `npm run dev`.

### Testing on a phone

`localhost` only works on the computer running the server, and the server is local-only for now, so phones can't
use accounts or backup yet. Use the live site below to try tracking on a phone.

## Live site (Netlify, tracking only)

Netlify only serves files; it can't run the Safe Location server. So the live site is the **tracking-only**
version: tracking, the map, history, the landing page and "Call 112" work, saved on the visitor's device.
Accounts, backup, SOS alerts and Trip Mode say **"coming soon"** and the account pages lead to the landing page,
so nobody can press an SOS that wouldn't really reach anyone.

How it's built (automatic on every push to `main`, configured in `netlify.toml`):

1. Netlify runs `node scripts/build-netlify.js`.
2. The script copies only the public files into `dist/` (no server code, tests or settings) and writes a
   `config.js` with `sync: false`.
3. It writes `_redirects` (account pages → `/welcome`) and `_headers` (the same security headers the server sends).

To check a build locally: `node scripts/build-netlify.js`, then look in `dist/`. The test
`server/tests/netlify-build.test.js` checks that nothing private is published and that the security policy matches
the server's. Optional: set `CARTO_API_KEY` in Netlify's environment variables for the CARTO Dark map tiles.

**Going fully live** (accounts, SOS, Trip Mode, WhatsApp) needs the server deployed on a host with a persistent disk,
a real email provider for sign-up emails, and an SMS/WhatsApp provider. Netlify can then pass `/api/*` requests to
that server, so the website address stays the same.

## Backup and sync (Phase 3, updated for accounts)

### API

All responses are JSON. Errors look like `{ "error": { "code": "...", "message": "..." } }`.
"Session" means a signed-in, email-verified user (cookie). Changes must come from this site (`Origin` check).

| Method and path | Needs | Purpose |
|---|---|---|
| `GET /api/v1/health` | nothing | `{ status, database, time }`; 503 if the database is down. |
| `/api/auth/*` | depends | Better Auth: sign-up, sign-in, sign-out, verify email, request/reset password, sessions, delete account. |
| `GET /api/v1/devices` | session | Your devices with point counts and last upload. |
| `POST /api/v1/devices` | session | Register a device `{ name }` (1–60 characters, up to 20 devices). |
| `PATCH /api/v1/devices/:id` | session | Rename `{ name }`. |
| `DELETE /api/v1/devices/:id?deleteLocations=` | session | Remove a device; optionally delete what it uploaded. |
| `POST /api/v1/locations/batch` | session | `{ deviceId, records[1–100] }` → `{ accepted, duplicates, rejected, serverReceivedAt }`. |
| `GET /api/v1/locations?limit=&cursor=&deviceId=&sessionId=` | session | Your records, in pages of up to 500. |
| `GET /api/v1/recordings` / `DELETE /api/v1/recordings/:sessionId` | session | List or delete uploaded recordings (Start-to-Stop runs; called "trips" before Phase 7). |
| `POST /api/v1/trips` · `GET /api/v1/trips` · `GET /api/v1/trips/active` · `GET /api/v1/trips/:id` | session | Trip Mode: start (idempotent), list, open trip, one trip with messages. |
| `POST /api/v1/trips/:id/pause` · `/resume` · `/checkin` · `/end` · `DELETE /api/v1/trips/:id` | session | Trip actions (safe to repeat); delete a finished trip with its route. |
| `GET /api/v1/account/summary` | session | Counts of your devices and uploaded points. |

Uploaded record fields: `id`, `sessionId`, `latitude`, `longitude`, `accuracy`, `deviceTimestamp`,
`deviceRecordedAt`, `intervalMs`, `flags`. The server adds `serverReceivedAt` (its own clock) and
`deviceTimeSuspect` (device time before 2020 or more than 5 minutes in the future).

### How backup works (browser, `app.js` section 9)

1. Every point is saved in IndexedDB first with `syncState: "pending"` and the owning `accountId`. Recording never
   waits for the network.
2. Pending points of the signed-in account upload in batches of 50 after each new point, on page load, when the
   browser comes back online, and when the tab becomes visible again.
3. A point becomes `"synced"` **only** when the server lists its ID as accepted or duplicate. A point the server
   rejects (invalid data) becomes `"rejected"`, shows a badge, and is not retried forever.
4. Temporary failures (no connection, 15-second timeout, HTTP 408/425/429/5xx) retry after about 2 s, 4 s, 8 s …
   capped at **5 minutes**, with ±20 % jitter, and never sooner than a `Retry-After` header.
5. While the browser is offline nothing is sent; the `online` event starts uploading at once.
6. Duplicates are impossible: the record `id` is the database PRIMARY KEY (`INSERT … ON CONFLICT DO NOTHING`).
7. If the session ends (401), uploads pause and the Backup card asks you to sign in. Nothing is retried in a
   loop, and points keep saving. If the device was removed (404), the card asks you to register again.
8. Only one tab uploads at a time (Web Locks).

## Automated tests

Two suites:

* `server/tests/`: API tests with Node's built-in test runner. Every test gets its own in-memory server; no
  browser needed.
* `tests/`: Playwright browser tests using **simulated** GPS positions and a fake clock, so a 60-second interval
  or a 5-minute retry is tested in milliseconds. Playwright starts the real server on port 4173 with throwaway
  in-memory databases and test-only settings (a test secret, test endpoints on). Accounts are throwaway
  `@example.test` users. Map tiles and place-name lookups are replaced with local stand-ins; Leaflet still loads
  from unpkg, so an internet connection is needed.

First time only, download Playwright's test browser (about 150 MB):

```bash
npx playwright install chromium
```

Run everything:

```bash
npm test
```

Or one suite at a time:

```bash
npm run test:server
```

```bash
npm run test:e2e
```

Open the detailed report from the last run:

```bash
npm run test:report
```

Covered: permission granted/denied, first point saved immediately, one record per interval despite live updates,
interval switching (and remembered after reload), stop clean-up, double-click and second-tab duplicate prevention,
invalid coordinates, refresh with auto-resume, history after reopening, low accuracy, GPS jump, data gaps,
clear-history confirm/cancel, storage unavailable, Phase 1 import, large-history paging, route/markers drawn without
per-point dots, follow mode, map tile failure, offline/online, and the phone layout.

Trip tests cover: starting with the form, recording, ending and reviewing the trip (route, facts, messages);
pause and resume in the same trip; stopped updates leading to a check-in request and "I'm OK"; a missed check-in
messaging contacts with factual wording and failures shown honestly; an offline journey uploading every point; a
trip started offline being registered later; delayed synchronization; a stale position never called current; and
cancelling. Server tests add privacy between users, idempotent actions, the arrival and no-update rules with each
escalation choice, pausing, ending after an alert, account deletion, and upgrading a Phase 5 database.

Offline tests cover: recording offline, refreshing offline (service worker), reconnecting and checking every
point was accepted exactly once with no duplicates; internet vs server unavailable; Sync now skipping the retry
wait; the last sync time surviving a refresh; an expired session keeping the queue; a rate-limited account check
not signing you out; storage full (points kept in memory, still uploaded, saved once space returns); another account
signed in from another tab receiving nothing; permission denied; and no recent GPS fix.

SOS tests cover (simulated notifications only): the emergency page needing sign-in; adding, editing, testing and
removing a contact (local numbers converted to +234); invalid numbers explained; no SOS button without contacts;
the countdown cancel sending nothing; a successful alert with simulated delivery shown as simulated; failed and
undeliverable alerts never shown as delivered; repeated activation not alerting twice; cancellation with an "I'm
safe" update; last-known location with its age; no location reported as unavailable; and an offline SOS sent when
the connection returns. The API tests add isolation between users, validation, rate limits, audit entries,
alerts stopped by cancellation, resuming after a restart, account deletion, and the Twilio adapter against a
mocked Twilio.

Account tests cover: sign-up, email verification, sign-in and sign-out through the pages; generic wrong-password
message; protected pages and API refusing visitors; registering a device and seeing it on the dashboard; the
HttpOnly cookie and nothing secret in `localStorage`; points recorded while signed out uploaded only on request;
two accounts on one browser kept apart; an expired session pausing backup and resuming after sign-in; password
reset signing out other sessions; device removal; account deletion (wrong and right password); and another user's
device ID granting nothing. Backup tests cover the Phase 3 behaviour (offline queue, retry timing, the 5-minute
cap, server errors, duplicates, rejected records). API tests add unsafe settings refused, CSRF, rate limits,
validation, size limits, suspect timestamps, database failure, pagination and the file whitelist.

Not covered (needs a real device): real GPS hardware, screen lock/background behaviour, real network drop-outs.

## Optional: CARTO dark map

The **Dark** map style looks best with CARTO's "Dark Matter" tiles, which need a free key.

1. Go to <https://carto.com/basemaps/apikey>, choose **Request a key** and enter your email. No account or password
   is needed; the key arrives by email within a minute. Free for non-commercial use up to 5 million tile requests a month.
2. In the project folder, copy `config.example.js` and name the copy `config.js`.
3. Paste the key between the quotes: `cartoApiKey: "your-key-here"`. Save and reload the page.
4. Choose **Dark** above the map. The attribution should read "© OpenStreetMap contributors, © CARTO".

If tiles show "API KEY REQUIRED", the key is missing or wrong (CARTO returns the stamped tile instead of an error).
Without `config.js`, Dark falls back to OpenStreetMap tiles recoloured in the browser, so the site still works.

**About the key:** any key used by a browser map is visible to anyone who opens the site's code — it cannot be truly
secret. `config.js` stays out of Git so the key isn't published in your repository. In the CARTO dashboard
(sign in with your email) you can add restrictions and watch usage. If you later publish on GitHub Pages, the site
will only use the CARTO style if `config.js` is deployed too — we'll decide how to handle that when we get there.

## How it works

### Live GPS vs. saved records

* **Live GPS feed** (`watchPosition`) runs while tracking. It only updates the "Live GPS" line. It never saves anything.
* **Recording scheduler** saves exactly one point per interval (default **60 seconds**; options 1, 2, 5, 10 minutes).
  It is a single `setTimeout` chain. The next reading is only scheduled after the current one finishes, so readings
  cannot overlap. If the live fix is older than 20 seconds, the scheduler makes **one** on-demand request instead.
* Changing the interval while tracking reschedules the next reading relative to the last one (no burst of readings).
* Stopping clears the GPS watch, the timer, the countdown and the cross-tab lock. A `runId` counter makes any late GPS
  callback from a stopped run be ignored.
* Only one tab can track at a time (Web Locks API). A second tab shows a message instead of starting.

### Saved record (IndexedDB database `safe-location`, store `locations`)

```text
id          unique ID (UUID)
sessionId   one ID per trip (Start → Stop)
latitude, longitude, accuracy (metres)
timestamp   when the GPS fix was taken
recordedAt  when it was saved
intervalMs  the interval in use when it was saved
flags       [] or "low-accuracy" / "implausible-jump"
syncState   "pending" — nothing is uploaded yet (no server exists); a later phase will set "synced"
```

Phase 1 history (in `localStorage`) is copied into IndexedDB automatically the first time Phase 2 loads, shown as
an "Imported from Phase 1" trip. The old copy is removed only after the copy succeeded.

### Quality checks

* Invalid coordinates (out of range, not numbers, or exactly 0,0) are rejected and never saved.
* Accuracy worse than **100 m** → saved but flagged **Low accuracy** and left off the route.
* Movement faster than **~250 km/h** from the previous reliable point (after allowing for both accuracy circles)
  → saved but flagged **GPS jump** and left off the route.
* If the next point agrees with a flagged jump, the jump is treated as real: the new point is accepted and the
  route breaks there (dashed) instead of drawing an impossible straight line.
* Tune these in `app.js` section 1 (`LOW_ACCURACY_METERS`, `IMPLAUSIBLE_SPEED_MPS`).

### Map

* The route is a line through reliable points of each trip. Separate trips are **never** joined.
* If no point was saved for more than 3 × the interval, the line breaks and a **dashed** line marks the gap.
  The real path during a gap is unknown.
* Green ring = trip start. Blue dot = latest saved point (amber if flagged), with its accuracy circle.
* **Follow** keeps the map on your latest point. Dragging the map turns Follow off so you can explore.
* **Dark** uses CARTO Dark Matter when `config.js` has a CARTO key; otherwise recoloured OpenStreetMap tiles.

### Distance

"Estimated distance" adds straight lines between reliable saved points in the current trip, excluding gaps.
**It is not road distance** — real travel along roads is usually longer.

### After a refresh

History reloads from IndexedDB. If tracking was running less than 10 minutes before the refresh and location
permission is already granted, tracking resumes in the same trip. Otherwise it asks you to press Start again, so
opening the page later never starts tracking on its own.

## Manual testing checklist (Phase 2)

Use Chrome or Edge on desktop. Simulated locations come from **DevTools → ⋮ → More tools → Sensors → Location**
(choose a city or "Other…" to type coordinates). Real GPS testing should be done on a phone over `https://`.

| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | Permission granted | Start Tracking → Allow | First point saved within seconds; status "Tracking active"; countdown shows "Next reading in 0:59" |
| 2 | Permission denied | Address-bar site icon → Location → Block → reload → Start | Red message explaining how to allow location; tracking stays off |
| 3 | Start / stop | Start, wait 2 readings, Stop | Stop clears countdown and "GPS idle"; no new points appear after stopping |
| 4 | 60-second recording | Track for 5 minutes | About 5–6 points, not hundreds |
| 5 | Interval switching | While tracking, choose 2 minutes | Message shows next reading time; points then arrive ~2 min apart; Statistics shows "2 minutes" |
| 6 | Interval persists | Choose 5 minutes, reload | Selector still shows 5 minutes |
| 7 | Page refresh | While tracking, press F5 | History still there; tracking resumes (or asks you to press Start if permission isn't "granted") |
| 8 | History persistence | Close the tab, reopen | All points and trips still listed; tracking does **not** restart by itself after 10+ minutes |
| 9 | Poor accuracy | Sensors: pick a location; on a phone, test indoors | Points worse than ±100 m show "Low accuracy" badge, amber marker, excluded from route |
| 10 | GPS jump | Sensors: switch from Lagos to London for one reading, then back to Lagos | The London point shows "GPS jump"; the route stays in Lagos |
| 11 | GPS unavailable | Sensors: "Location unavailable" | Amber "GPS position unavailable — retrying"; tracking keeps running; missed readings show as a dashed gap |
| 12 | Network loss | DevTools → Network → "Offline" | Header shows "Offline"; points still saved; place name says unavailable offline |
| 13 | Network restored | Set Network back to "No throttling" | "Back online" message; missing map tiles reload |
| 14 | Map loading error | DevTools → Network → Request blocking → add `tile.openstreetmap.org` → reload | Map shows "Map tiles could not be loaded…"; tracking and history still work |
| 15 | Duplicate tracking | Start in tab A, open tab B, press Start | Tab B: "Tracking is already running in another Safe Location tab" |
| 16 | Double click | Click Start rapidly | Only one trip starts; button disables immediately |
| 17 | Clear history | Clear history → Cancel, then → OK | Cancel keeps data; OK empties list, map and statistics |
| 18 | Storage failure | DevTools → Application → Storage → "Simulate custom storage quota" (e.g. 0.01 MB) → track | Amber banner: location could not be saved; tracking continues |
| 19 | Follow mode | While tracking, drag the map | Follow switches off; map no longer jumps; Recenter / Follow brings it back |
| 20 | Mobile layout | DevTools device toolbar (Ctrl+Shift+M), 375 px wide | No sideways scrolling; controls first, then map |

## Known limitations

* **Background tracking:** browsers pause GPS and timers when the screen locks or the tab is in the background,
  especially on phones. These periods appear as gaps. Reliable background tracking needs a native app.
* **Accuracy:** desktop computers usually locate by Wi-Fi/IP (often 100 m – several km). Phones outdoors are best.
* **Map data:** OpenStreetMap coverage varies across Nigeria; some streets have no name. The app never invents names.
* **Tile and Nominatim usage:** OpenStreetMap's free services are for light use. A public launch needs a commercial
  tile/geocoding provider and its API key, configured in `app.js` section 1.
* **Privacy:** history never leaves the browser, but OpenStreetMap (and CARTO, for the Dark style with a key)
  receives the map area you view; OpenStreetMap also receives the coordinates sent for place-name lookups.
* **Storage:** history is per browser and per device. Clearing site data deletes it. No backup or sync yet.
* **Emergency alerts (Phase 5):** simulated until Twilio is configured. The real Twilio path is tested only
  against a mocked Twilio, and email alerts are always simulated. There are no trusted-contact accounts (contacts
  get messages, not a live view), no duress PIN for forced cancellation, and no automatic SOS. A browser can't send
  an SOS while closed, or reliably in the background.
* **Accounts and backup (Phases 3–4):** local development only. The server runs on this computer, emails go to a
  local outbox, there's no HTTPS, and SQLite is used instead of a production database. There's no two-factor
  sign-in, data export or server backups yet. Clear history does not remove backed-up copies (delete them from the
  Account page).
* **Cross-tab protection** needs the Web Locks API (Chrome/Edge 69+, Firefox 96+, Safari 15.4+).
