// Starts the Safe Location server: website, accounts and API on one local address.
// Run with: npm run dev   (reads settings from .env)
import { loadConfig } from "./config.js";
import { createServices } from "./services.js";

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  console.error("\nCopy .env.example to .env, fill it in, then run: npm run dev");
  process.exit(1);
}

// Simple console logger for start-up messages (database upgrade notices, development emails).
const say = (write) => (first, second) => write(`[safe-location] ${typeof first === "string" ? first : second}`);
const services = await createServices({ config, log: { info: say(console.log), warn: say(console.warn) } });
const { app } = services;

const shutdown = async (signal) => {
  app.log.info(`${signal} received, shutting down`);
  await services.close();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
app.log.info(`Safe Location is running at ${config.publicUrl}`);
if (config.mailOutboxDir) app.log.warn(`Emails are not sent: they are saved in ${config.mailOutboxDir} (development only).`);
if (services.providers.mode === "simulated") {
  app.log.warn("Emergency notifications are SIMULATED: nothing is really sent. Messages are saved to the dev outbox.");
} else {
  app.log.warn("Emergency SMS are LIVE through Twilio. Email alerts are still simulated.");
}
if (config.devTestEndpoints) app.log.warn("DEV_TEST_ENDPOINTS is on: /dev/outbox and /dev/expire-my-session exist. Never use this setting outside local testing.");
