// Notification providers. Each one has:
//   submit({ to, subject, body })  -> { ok: true, providerMessageId } | { ok: false, temporary, error }
//   checkDelivery({ providerMessageId, destination, submittedAt })
//                                   -> { state: "pending" | "delivered" | "failed", error? }
// "delivered" is only ever reported when the provider itself confirms delivery.
import crypto from "node:crypto";

/* ---------- Simulated (development) ---------- */
// Nothing is sent. The message is written to the development outbox (data/dev-outbox) marked SIMULATED.
// Test addresses choose the outcome:
//   phone ending 0000 or email with "+fail"          -> the provider rejects it (retried, then "failed")
//   phone ending 9999 or email with "+undeliverable" -> accepted, then delivery fails
//   anything else                                     -> accepted, then simulated delivery confirmation
const SIM_SUBMIT_FAILS = /(0000$|\+fail@)/i;
const SIM_DELIVERY_FAILS = /(9999$|\+undeliverable@)/i;

export function createSimulatedProvider({ channel, deliveryDelayMs, mailer }) {
  return {
    name: `simulated-${channel}`,
    channel,
    simulated: true,

    async submit({ to, subject, body }) {
      if (SIM_SUBMIT_FAILS.test(to)) {
        return { ok: false, temporary: true, error: "Simulated provider error (test address ending 0000 / containing +fail)." };
      }
      await mailer.send({
        to,
        subject: `[SIMULATED ${channel.toUpperCase()} - NOT SENT] ${subject}`,
        text: `This ${channel === "sms" ? "SMS" : "email"} was NOT sent. Development mode simulates notifications.\nTo: ${to}\n\n${body}`
      });
      return { ok: true, providerMessageId: `sim_${crypto.randomUUID()}` };
    },

    async checkDelivery({ destination, submittedAt }) {
      if (Date.now() - submittedAt < deliveryDelayMs) return { state: "pending" };
      if (SIM_DELIVERY_FAILS.test(destination)) return { state: "failed", error: "Simulated: the phone or inbox could not be reached." };
      return { state: "delivered" };
    }
  };
}

/* ---------- Twilio SMS (real) ---------- */
// Uses Twilio's REST API directly (no SDK). Delivery is confirmed by asking Twilio for the message
// status, because this local server cannot receive Twilio's status callbacks.
// Twilio statuses: queued/accepted/scheduled/sending/sent = not confirmed yet ("sent" only means handed
// to the mobile network); delivered = confirmed; undelivered/failed/canceled = failed.
export function mapTwilioStatus(status, errorCode) {
  if (status === "delivered") return { state: "delivered" };
  if (["undelivered", "failed", "canceled"].includes(status)) {
    return { state: "failed", error: `Twilio reported "${status}"${errorCode ? ` (error ${errorCode})` : ""}.` };
  }
  return { state: "pending" };
}

export function createTwilioSmsProvider({ accountSid, authToken, fromNumber, messagingServiceSid, fetchImpl = fetch }) {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;
  const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

  async function call(url, init = {}) {
    const response = await fetchImpl(url, {
      ...init,
      headers: { Authorization: authorization, ...(init.headers || {}) },
      signal: AbortSignal.timeout(15000)
    });
    let data = {};
    try { data = await response.json(); } catch { /* keep empty */ }
    return { response, data };
  }

  return {
    name: "twilio-sms",
    channel: "sms",
    simulated: false,

    async submit({ to, body }) {
      const form = new URLSearchParams({ To: to, Body: body });
      if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
      else form.set("From", fromNumber);
      let result;
      try {
        result = await call(`${base}/Messages.json`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form
        });
      } catch {
        return { ok: false, temporary: true, error: "Could not reach Twilio." };
      }
      const { response, data } = result;
      if (!response.ok) {
        return {
          ok: false,
          temporary: response.status >= 500 || response.status === 429,
          error: `Twilio refused the message (HTTP ${response.status}${data.code ? `, error ${data.code}` : ""}).`
        };
      }
      return { ok: true, providerMessageId: data.sid };
    },

    async checkDelivery({ providerMessageId }) {
      try {
        const { response, data } = await call(`${base}/Messages/${encodeURIComponent(providerMessageId)}.json`);
        if (!response.ok) return { state: "pending" }; // try again later
        return mapTwilioStatus(data.status, data.error_code);
      } catch {
        return { state: "pending" };
      }
    }
  };
}

/* ---------- Choose providers from config ---------- */
export function createProviders({ config, mailer }) {
  const email = createSimulatedProvider({ channel: "email", deliveryDelayMs: config.simulatedDeliveryDelayMs, mailer });
  if (config.notifyMode === "live") {
    return {
      mode: "live",
      sms: createTwilioSmsProvider(config.twilio),
      email // no real email provider yet: email alerts stay simulated and are labelled so
    };
  }
  return {
    mode: "simulated",
    sms: createSimulatedProvider({ channel: "sms", deliveryDelayMs: config.simulatedDeliveryDelayMs, mailer }),
    email
  };
}
