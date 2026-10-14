// Sign in, create account, forgot password and reset password pages (Phase 4).
// These pages talk to Better Auth's endpoints under /api/auth. The session is an HttpOnly cookie set by
// the server: this script never sees or stores it.
"use strict";

const page = document.body.dataset.page;
const form = document.querySelector("#auth-form");
const notice = document.querySelector("#notice");
const params = new URLSearchParams(location.search);

function showNotice(text, type = "info") {
  notice.textContent = text;
  notice.className = `notice is-${type}`;
  notice.hidden = false;
  if (type === "error") notice.setAttribute("role", "alert");
  else notice.setAttribute("role", "status");
}

// Only allow redirects to a path on this site (never "//other-site" or "https://…").
function safeNext() {
  const next = params.get("next") || "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

async function authRequest(path, body) {
  try {
    const response = await fetch(`/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
    let data = null;
    try { data = await response.json(); } catch { /* empty reply */ }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function describeFailure(result, fallback) {
  if (result.status === 0) return "Can't reach the server. Check your connection and that the Safe Location server is running.";
  if (result.status === 429) return "Too many attempts. Please wait a minute and try again.";
  const code = result.data && result.data.code;
  if (code === "PASSWORD_TOO_SHORT") return "The password must be at least 10 characters.";
  if (code === "PASSWORD_TOO_LONG") return "The password must be at most 128 characters.";
  if (code === "INVALID_EMAIL") return "Enter a valid email address.";
  return fallback;
}

function setBusy(busy) {
  form.querySelectorAll("input, button").forEach((element) => { element.disabled = busy; });
  form.setAttribute("aria-busy", String(busy));
}

const value = (id) => document.querySelector(`#${id}`).value.trim();

// Show/hide password buttons.
document.querySelectorAll(".toggle-password").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.getAttribute("aria-controls"));
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(show));
  });
});

// Development hint about the email outbox (only on this computer).
if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
  const hint = document.querySelector("#dev-hint");
  if (hint) hint.hidden = false;
}

/* ---------- Sign in ---------- */
async function initSignIn() {
  const session = await authRequest("/get-session");
  if (session.ok && session.data && session.data.user) {
    location.replace(safeNext());
    return;
  }

  if (params.has("verified")) showNotice("Email confirmed. You can sign in now.", "success");
  if (params.has("reset")) showNotice("Password changed. Sign in with your new password.", "success");
  if (params.has("signedOut")) showNotice("You have signed out.", "info");
  if (params.has("deleted")) showNotice("Your account and its uploaded data were deleted.", "info");
  if (params.has("expired")) showNotice("Your session has ended. Please sign in again.", "info");
  if (params.has("error")) showNotice("That link is invalid or has expired. Sign in to get a new confirmation link, or request a new password reset.", "error");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = value("email");
    const password = document.querySelector("#password").value;
    if (!email || !password) return showNotice("Enter your email and password.", "error");

    setBusy(true);
    const result = await authRequest("/sign-in/email", {
      email,
      password,
      rememberMe: document.querySelector("#remember").checked,
      callbackURL: "/account?welcome=1" // where a fresh confirmation link leads, if the email isn't confirmed yet
    });
    setBusy(false);
    if (result.ok) {
      location.assign(safeNext());
      return;
    }
    if (result.data && result.data.code === "EMAIL_NOT_VERIFIED") {
      showNotice(`Please confirm your email first. We sent a new confirmation link to ${email}.`, "info");
    } else {
      showNotice(describeFailure(result, "Email or password is incorrect."), "error");
    }
  });
}

/* ---------- Create account ---------- */
function initSignUp() {
  const done = document.querySelector("#done");
  const callbackURL = "/account?welcome=1";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = value("name");
    const email = value("email");
    const password = document.querySelector("#password").value;
    if (!name || !email) return showNotice("Enter your name and email address.", "error");
    if (password.length < 10) return showNotice("The password must be at least 10 characters.", "error");

    setBusy(true);
    const result = await authRequest("/sign-up/email", { name, email, password, callbackURL });
    setBusy(false);
    if (!result.ok) return showNotice(describeFailure(result, "The account could not be created. Check the details and try again."), "error");

    // The same message appears whether or not the address already had an account (protects privacy).
    form.hidden = true;
    notice.hidden = true;
    document.querySelector("#done-email").textContent = email;
    done.hidden = false;
  });

  document.querySelector("#resend").addEventListener("click", async () => {
    const result = await authRequest("/send-verification-email", { email: document.querySelector("#done-email").textContent, callbackURL });
    showNotice(result.ok ? "Sent. Check your inbox (and spam folder)." : describeFailure(result, "Could not send the link. Try again shortly."), result.ok ? "success" : "error");
  });
}

/* ---------- Forgot password ---------- */
function initForgot() {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = value("email");
    if (!email) return showNotice("Enter your email address.", "error");
    setBusy(true);
    const result = await authRequest("/request-password-reset", { email, redirectTo: "/reset-password" });
    setBusy(false);
    if (!result.ok && result.status !== 200) return showNotice(describeFailure(result, "Could not send the link. Try again shortly."), "error");
    showNotice("If that email has an account, a reset link is on its way. It expires in 1 hour.", "success");
  });
}

/* ---------- Reset password ---------- */
function initReset() {
  const token = params.get("token");
  if (!token || params.has("error")) {
    form.hidden = true;
    showNotice("This reset link is invalid or has expired. Request a new one.", "error");
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = document.querySelector("#password").value;
    if (newPassword.length < 10) return showNotice("The password must be at least 10 characters.", "error");
    if (newPassword !== document.querySelector("#confirm").value) return showNotice("The two passwords don't match.", "error");

    setBusy(true);
    const result = await authRequest("/reset-password", { newPassword, token });
    setBusy(false);
    if (result.ok) {
      location.assign("/signin?reset=1");
      return;
    }
    if (result.data && /TOKEN/.test(result.data.code || "")) {
      form.hidden = true;
      showNotice("This reset link is invalid, already used, or has expired. Request a new one.", "error");
    } else {
      showNotice(describeFailure(result, "The password could not be changed. Try again."), "error");
    }
  });
}

({ signin: initSignIn, signup: initSignUp, forgot: initForgot, reset: initReset })[page]();
