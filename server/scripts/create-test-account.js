// Creates a DEVELOPMENT test account with a random password, already email-verified.
//
//   npm run dev:test-account                         (random address like tester-ab12cd@example.test)
//   npm run dev:test-account -- someone@example.test (choose the address)
//
// Safety: refuses to run when NODE_ENV=production, uses only your local .env settings, prints the
// password once (it is never saved anywhere), and only accepts reserved test domains so a real
// person's address cannot be used by accident. Delete the account from its Account page when done.
import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { createServices } from "../services.js";

const TEST_DOMAINS = /@(example\.(test|com|org|net)|[a-z0-9-]+\.test|localhost)$/i;

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to create a test account: NODE_ENV is production.");
  process.exit(1);
}

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const email = (process.argv[2] || `tester-${crypto.randomBytes(3).toString("hex")}@example.test`).toLowerCase();
if (!TEST_DOMAINS.test(email)) {
  console.error("Use a reserved test address such as name@example.test (real email addresses are not allowed here).");
  process.exit(1);
}
const password = crypto.randomBytes(15).toString("base64url"); // 20 random characters

const quiet = { info: () => {}, warn: () => {} };
const services = await createServices({ config, log: quiet, logger: false, resumeNotifications: false });
try {
  const response = await services.authService.auth.api.signUpEmail({
    body: { name: "Test account", email, password },
    asResponse: true
  });
  if (!response.ok) throw new Error(`Sign-up failed (${response.status}): ${await response.text()}`);
  if (!services.authService.markEmailVerified(email)) {
    throw new Error("That address already has an account. Choose another address or delete the old account.");
  }
  console.log("\nDevelopment test account created (shown once, not saved anywhere):\n");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}\n`);
  console.log(`Sign in at ${config.publicUrl}/signin while \`npm run dev\` is running.`);
  console.log("Delete it when finished: Account page -> Delete account.\n");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await services.close();
}
