// The WhatsApp boundary. Baileys stays behind this interface; tests use a
// fake implementation and never need a real account.

export interface WhatsAppIdentity {
  /** Canonical JID reported by WhatsApp. */
  jid: string;
}

export interface WhatsAppGroup {
  jid: string;
  subject: string;
}

export interface ParticipantResult {
  jid: string;
  /** WhatsApp status code as a string, e.g. "200", "403", "409". */
  status: string;
}

export interface WhatsAppAdapter {
  isConnected(): boolean;

  /** Null when the number is not registered with WhatsApp. */
  checkNumber(phoneE164: string): Promise<WhatsAppIdentity | null>;

  sendVerificationCode(identity: WhatsAppIdentity, code: string): Promise<void>;

  /** Idempotent: finds or creates the single persistent group. */
  ensureGroup(): Promise<WhatsAppGroup>;

  getGroupMembers(groupJid: string): Promise<string[]>;

  addParticipants(
    groupJid: string,
    participantJids: string[],
  ): Promise<ParticipantResult[]>;

  removeParticipants(
    groupJid: string,
    participantJids: string[],
  ): Promise<ParticipantResult[]>;

  getInviteLink(groupJid: string): Promise<string>;
}
