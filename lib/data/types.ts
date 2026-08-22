// The public shared shape. This is ALL the browser may know about others.
// No emails, no phone numbers, no auth metadata.

import type { CharacterConfig } from "@/lib/validation/character";
import type { MembershipState } from "@/lib/whatsapp/membership";

export interface PublicProfile {
  id: string;
  displayName: string;
  characterConfig: CharacterConfig | null; // null = unknown/future schema
  characterSchemaVersion: number;
  onBeach: boolean;
  onBeachSince: string | null;
}

export interface BeachSnapshot {
  people: PublicProfile[];
  self: PublicProfile | null;
  demo: boolean;
}

/** Private, self-only WhatsApp status. Never contains the full number. */
export interface SelfWhatsApp {
  connected: boolean;
  lastFour: string | null;
  countryCode: string | null;
  verified: boolean;
  optedIn: boolean;
  membershipState: MembershipState;
  /** Present only when the user must approve the invite AND is on the beach. */
  inviteUrl: string | null;
}
