// Turns one message into one notification per contact and channel (SMS and/or email).
// Shared by SOS alerts (Phase 5) and trip messages (Phase 7).
import crypto from "node:crypto";

export function channelsFor(contact) {
  const list = [];
  if (contact.phone) list.push({ channel: "sms", destination: contact.phone });
  if (contact.email) list.push({ channel: "email", destination: contact.email });
  return list;
}

export function notificationsFor({ ownerId, contacts, kind, message, eventId = null, tripId = null }) {
  return contacts.flatMap((contact) =>
    channelsFor(contact).map(({ channel, destination }) => ({
      id: crypto.randomUUID(),
      ownerId,
      eventId,
      tripId,
      contactId: contact.id,
      contactName: contact.name,
      kind,
      channel,
      destination,
      subject: message.subject,
      body: message.body
    }))
  );
}
