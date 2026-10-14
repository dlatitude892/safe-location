// Development email "outbox".
//
// No real email is sent yet. Verification and password-reset emails are kept in memory (and, if
// MAIL_OUTBOX_DIR is set, written as .txt files there) so you can open the links while testing.
// Before deployment, replace this with a real email provider (SMTP or an email API); the rest of the
// code only calls `mailer.send({ to, subject, text })`.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const KEEP_IN_MEMORY = 200;

export function createOutboxMailer({ dir, log }) {
  const messages = [];

  return {
    async send({ to, subject, text }) {
      const message = { id: crypto.randomUUID(), to, subject, text, sentAt: Date.now() };
      messages.push(message);
      if (messages.length > KEEP_IN_MEMORY) messages.shift();

      if (dir) {
        await fs.promises.mkdir(dir, { recursive: true });
        const stamp = new Date(message.sentAt).toISOString().replace(/[:.]/g, "-");
        const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        await fs.promises.writeFile(
          path.join(dir, `${stamp}-${slug}.txt`),
          `To: ${to}\nSubject: ${subject}\nDate: ${new Date(message.sentAt).toISOString()}\n\n${text}\n`,
          "utf8"
        );
      }
      // The address and link are not logged; they are only in the outbox.
      log.info({ subject }, `Development email saved to the outbox${dir ? ` (${dir})` : ""}`);
    },

    list(to) {
      return messages.filter((message) => !to || message.to === to.toLowerCase());
    }
  };
}
