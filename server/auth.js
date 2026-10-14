// Accounts and sessions, provided by Better Auth (https://www.better-auth.com), an established
// open-source authentication library. It handles registration, sign-in/out, email verification,
// password reset, sessions and account deletion. We configure it here instead of writing our own.
//
// - Passwords are stored only as scrypt hashes (Better Auth default), never as plain text.
// - Sessions live in an HttpOnly, SameSite=Lax cookie, so page scripts (and localStorage) never see them.
// - Its tables (user, session, account, verification) live in their own SQLite file.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders } from "better-auth/node";

function openSqlite(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA foreign_keys = ON;");
  if (file !== ":memory:") database.exec("PRAGMA journal_mode = WAL;");
  return database;
}

function verificationEmail(url) {
  return [
    "Welcome to Safe Location.",
    "",
    "Confirm your email address by opening this link (it expires in 24 hours):",
    url,
    "",
    "If you did not create an account, ignore this email."
  ].join("\n");
}

function resetEmail(url) {
  return [
    "Someone asked to reset the password for your Safe Location account.",
    "",
    "Open this link to choose a new password (it expires in 1 hour):",
    url,
    "",
    "After the reset, every device signed in to your account is signed out.",
    "If you did not ask for this, ignore this email; your password has not changed."
  ].join("\n");
}

export async function createAuth({ config, mailer, onDeleteUser }) {
  const database = openSqlite(config.authDatabasePath);
  const limit = { window: 60, max: config.authRateLimitPerMinute };

  const options = {
    appName: "Safe Location",
    database,
    secret: config.authSecret,
    baseURL: config.publicUrl,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins,
    telemetry: { enabled: false },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({ to: user.email, subject: "Reset your Safe Location password", text: resetEmail(url) });
      }
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true, // signing in before verifying sends a fresh link
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({ to: user.email, subject: "Confirm your Safe Location email", text: verificationEmail(url) });
      }
    },

    session: {
      expiresIn: config.sessionDays * 24 * 60 * 60,
      updateAge: 24 * 60 * 60 // an active session is extended at most once a day
    },

    user: {
      deleteUser: {
        enabled: true,
        // Delete the person's devices and location history before the account itself is removed.
        beforeDelete: async (user) => onDeleteUser(user.id)
      }
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: config.authGeneralRateLimitPerMinute, // everything else under /api/auth, e.g. "who is signed in?"
      customRules: {
        "/sign-in/email": limit,
        "/sign-up/email": limit,
        "/request-password-reset": limit,
        "/reset-password": limit,
        "/send-verification-email": limit,
        "/delete-user": limit
      }
    },

    advanced: {
      cookiePrefix: "safe-location",
      useSecureCookies: config.publicUrl.startsWith("https://"),
      // app.js sets this header from the real connection, so clients cannot fake their address.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] }
    }
  };

  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  const auth = betterAuth(options);

  return {
    auth,
    database,

    // Returns { user, session } for a valid, unexpired session cookie, otherwise null.
    getSession(request) {
      return auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    },

    // Development tests only: makes the given session expire now.
    expireSession(sessionId) {
      database.prepare("UPDATE session SET expiresAt = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), sessionId);
    },

    // Development tool only (scripts/create-test-account.js).
    markEmailVerified(email) {
      return database.prepare("UPDATE user SET emailVerified = 1 WHERE email = ?").run(email.toLowerCase()).changes === 1;
    },

    close() {
      database.close();
    }
  };
}
