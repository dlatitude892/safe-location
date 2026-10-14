// Wires the pieces together: location database, development mailer, accounts, and the web server.
// Used by index.js (the real server), the API tests, and the test-account script.
import { openDatabase } from "./db.js";
import { createAuth } from "./auth.js";
import { createOutboxMailer } from "./mailer.js";
import { buildApp } from "./app.js";
import { createProviders } from "./notify/providers.js";
import { createDispatcher } from "./notify/dispatcher.js";
import { createTripWatchdog } from "./trips/watchdog.js";

// resumeNotifications: false for tools (like the test-account script) that must not send messages
// while the real server is running.
export async function createServices({ config, log = console, logger = true, resumeNotifications = true }) {
  const db = openDatabase(config.databasePath, { log });
  const mailer = createOutboxMailer({ dir: config.mailOutboxDir || null, log });
  const authService = await createAuth({
    config,
    mailer,
    // Account deletion: remove everything the person owns first (devices, locations, contacts, SOS history).
    onDeleteUser: (userId) => {
      db.deleteAllForOwner(userId);
    }
  });
  const providers = createProviders({ config, mailer });
  let app;
  const dispatcher = createDispatcher({
    db,
    providers,
    log: { error: (details, message) => (log.warn || console.warn)(`${message}: ${details?.err?.message ?? ""}`) },
    pollIntervalMs: config.notifyPollIntervalMs,
    maxPollMs: config.notifyPollMaxMs,
    retryBaseMs: config.notifyRetryBaseMs,
    onSentAfterCancel: (row) => app.emergency.sendLateCancellation(row)
  });
  app = buildApp({ config, db, authService, mailer, providers, dispatcher, logger });
  const watchdogLog = { error: (details, message) => (log.warn || console.warn)(`${message}: ${details?.err?.message ?? ""}`) };
  const watchdog = createTripWatchdog({ db, dispatcher, config, log: watchdogLog });
  if (resumeNotifications) {
    dispatcher.resume(); // continue sending/checking anything left from before a restart
    watchdog.start(); // keep an eye on open trips (missed arrival, stopped updates)
  }

  return {
    app,
    db,
    authService,
    mailer,
    providers,
    dispatcher,
    watchdog,
    async close() {
      watchdog.stop();
      dispatcher.stop();
      await app.close();
      authService.close();
      db.close();
    }
  };
}
