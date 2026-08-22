// The public shared shape. This is ALL the browser may know about others.
// No emails, no auth metadata, no timestamps beyond on_beach_since.

import type { CharacterConfig } from "@/lib/validation/character";

export interface PublicProfile {
  id: string;
  displayName: string;
  officeCode: string | null;
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
