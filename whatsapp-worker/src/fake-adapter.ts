// In-memory WhatsAppAdapter for tests and local dry runs. No real account,
// no network. Behavior is configurable per phone number.

import type {
  ParticipantResult,
  WhatsAppAdapter,
  WhatsAppGroup,
  WhatsAppIdentity,
} from "./adapter";
import { phoneToWhatsAppJid } from "../../lib/whatsapp/phone";

export class FakeWhatsAppAdapter implements WhatsAppAdapter {
  connected = true;
  group: WhatsAppGroup = {
    jid: "12345-67890@g.us",
    subject: "Bain on the Beach",
  };
  members = new Set<string>();
  /** Numbers that are not registered on WhatsApp. */
  notOnWhatsApp = new Set<string>();
  /** Numbers whose privacy settings require an invite. */
  privacyBlocked = new Set<string>();
  /** Numbers that fail transiently. */
  flaky = new Set<string>();
  inviteLink = "https://chat.whatsapp.com/fake-invite";
  sentCodes: Array<{ jid: string; code: string }> = [];
  addCalls = 0;
  removeCalls = 0;

  isConnected(): boolean {
    return this.connected;
  }

  async checkNumber(phoneE164: string): Promise<WhatsAppIdentity | null> {
    if (this.notOnWhatsApp.has(phoneE164)) return null;
    return { jid: phoneToWhatsAppJid(phoneE164) };
  }

  async sendVerificationCode(
    identity: WhatsAppIdentity,
    code: string,
  ): Promise<void> {
    this.sentCodes.push({ jid: identity.jid, code });
  }

  async ensureGroup(): Promise<WhatsAppGroup> {
    return this.group;
  }

  async getGroupMembers(): Promise<string[]> {
    return [...this.members];
  }

  private phoneOf(jid: string): string {
    return `+${jid.split("@")[0]}`;
  }

  async addParticipants(
    _groupJid: string,
    participantJids: string[],
  ): Promise<ParticipantResult[]> {
    this.addCalls++;
    return participantJids.map((jid) => {
      const phone = this.phoneOf(jid);
      if (this.flaky.has(phone)) return { jid, status: "500" };
      if (this.privacyBlocked.has(phone)) return { jid, status: "403" };
      if (this.notOnWhatsApp.has(phone)) return { jid, status: "401" };
      if (this.members.has(jid)) return { jid, status: "409" };
      this.members.add(jid);
      return { jid, status: "200" };
    });
  }

  async removeParticipants(
    _groupJid: string,
    participantJids: string[],
  ): Promise<ParticipantResult[]> {
    this.removeCalls++;
    return participantJids.map((jid) => {
      const phone = this.phoneOf(jid);
      if (this.flaky.has(phone)) return { jid, status: "500" };
      this.members.delete(jid);
      return { jid, status: "200" };
    });
  }

  async getInviteLink(): Promise<string> {
    return this.inviteLink;
  }
}
