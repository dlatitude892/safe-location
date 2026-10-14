// Sends notifications in the background, retries temporary failures, and checks delivery.
//
// Each notification moves through:
//   submission: pending -> submitted (the provider accepted it) | failed | cancelled (SOS cancelled first)
//   delivery:   unknown -> delivered (provider confirmed) | failed | unconfirmed (no answer before giving up)
// Everything is stored, so a server restart resumes where it stopped (see resume()).

const MAX_ATTEMPTS = 3; // first try + 2 retries for temporary provider errors

// onSentAfterCancel(notificationRow) is called when an alert was accepted by the provider at the same moment
// the SOS was cancelled, so that contact can still be told the person is safe.
export function createDispatcher({ db, providers, log, pollIntervalMs, maxPollMs, retryBaseMs = 2000, onSentAfterCancel = () => {} }) {
  const retryDelaysMs = [retryBaseMs, retryBaseMs * 5]; // 2 s, then 10 s by default
  const timers = new Set();
  let stopped = false;

  function later(ms, task) {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      task().catch((error) => log.error({ err: error }, "Notification task failed"));
    }, ms);
    timers.add(timer);
  }

  function auditSystem(notification, action, details) {
    db.addAudit({ ownerId: notification.owner_id, actor: "system", action, targetId: notification.event_id || notification.trip_id || notification.id, details });
  }

  async function attempt(id) {
    const notification = db.notificationForSending(id);
    if (!notification || notification.submission_status !== "pending") return; // already handled or cancelled
    const provider = providers[notification.channel];
    if (!provider) {
      db.markSubmissionFailed(id, { error: `No ${notification.channel} provider is configured.` });
      return;
    }

    let result;
    try {
      result = await provider.submit({ to: notification.destination, subject: notification.subject, body: notification.body });
    } catch {
      result = { ok: false, temporary: true, error: "The provider could not be reached." };
    }

    if (result.ok) {
      // The SOS may have been cancelled while the provider was accepting this alert.
      const cancelledMeanwhile = db.notificationForSending(id)?.submission_status === "cancelled";
      db.markSubmitted(id, { provider: provider.name, simulated: provider.simulated, providerMessageId: result.providerMessageId, now: Date.now() });
      db.recordAttempt(id, null);
      if (cancelledMeanwhile) onSentAfterCancel(notification);
      later(pollIntervalMs, () => checkDelivery(id));
      return;
    }

    db.recordAttempt(id, result.error);
    const attempts = notification.attempts + 1;
    if (result.temporary && attempts < MAX_ATTEMPTS) {
      later(retryDelaysMs[attempts - 1], () => attempt(id));
    } else if (db.markSubmissionFailed(id, { provider: provider.name, simulated: provider.simulated, error: result.error })) {
      auditSystem(notification, "notification.failed", { kind: notification.kind, channel: notification.channel, attempts });
    }
  }

  async function checkDelivery(id) {
    const notification = db.notificationForSending(id);
    if (!notification || notification.submission_status !== "submitted" || notification.delivery_status !== "unknown") return;
    const provider = providers[notification.channel];
    if (!provider || Date.now() - notification.submitted_at > maxPollMs) {
      db.markDelivery(id, "unconfirmed", "The provider did not confirm delivery in time.", Date.now());
      return;
    }
    const result = await provider.checkDelivery({
      providerMessageId: notification.provider_message_id,
      destination: notification.destination,
      submittedAt: notification.submitted_at
    });
    if (result.state === "delivered") {
      db.markDelivery(id, "delivered", null, Date.now());
    } else if (result.state === "failed") {
      if (db.markDelivery(id, "failed", result.error, Date.now())) {
        auditSystem(notification, "notification.undelivered", { kind: notification.kind, channel: notification.channel });
      }
    } else {
      later(pollIntervalMs, () => checkDelivery(id));
    }
  }

  return {
    enqueue(ids) {
      ids.forEach((id) => later(0, () => attempt(id)));
    },
    // After a restart: send what was waiting, and keep checking what was sent.
    resume() {
      for (const notification of db.openNotifications()) {
        if (notification.submission_status === "pending") later(0, () => attempt(notification.id));
        else later(0, () => checkDelivery(notification.id));
      }
    },
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
      timers.clear();
    }
  };
}
