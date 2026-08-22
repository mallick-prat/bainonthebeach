// Demo mode: everything local, no external services. Used when Supabase env
// vars are missing (development, e2e tests). The store is per-server-process
// and seeded with deterministic fixture beachgoers.
//
// WhatsApp in demo mode is fully simulated: the verification code is always
// 424242 and membership resolves instantly. Real mode uses the worker.

import { fnv1a, hash01 } from "@/game/movement/hash";
import {
  randomCharacter,
  type CharacterConfig,
} from "@/lib/validation/character";
import type { MembershipState } from "@/lib/whatsapp/membership";
import type { PublicProfile } from "./types";

export const DEMO_COOKIE = "botb_demo_session";
export const DEMO_VERIFICATION_CODE = "424242";

const FIXTURES: string[] = [
  "Priya",
  "Casey",
  "Jordan",
  "Álvaro",
  "Sam O.",
  "Devon",
  "Riley",
  "Morgan",
  "Taylor",
  "Jamie",
  "Avery",
  "Jordan", // duplicate display name on purpose
];

function seededRand(seed: string): () => number {
  let i = 0;
  return () => hash01(seed, i++ + 100);
}

function fixtureProfile(index: number): PublicProfile {
  const name = FIXTURES[index]!;
  const id = `demo-${index}-${fnv1a(name, index).toString(16)}`;
  const config: CharacterConfig = randomCharacter(seededRand(id));
  return {
    id,
    displayName: name,
    characterConfig: config,
    characterSchemaVersion: 1,
    onBeach: index < 9, // a few fixtures stay off-beach
    onBeachSince: index < 9 ? new Date(2026, 0, 1 + index).toISOString() : null,
  };
}

export interface DemoWhatsApp {
  phoneE164: string;
  countryCode: string;
  lastFour: string;
  verifiedAt: string | null;
  optInAt: string | null;
  consentVersion: string | null;
  syncEnabled: boolean;
  membershipState: MembershipState;
}

interface DemoStore {
  profiles: Map<string, PublicProfile>;
  whatsapp: Map<string, DemoWhatsApp>;
}

const globalStore = globalThis as unknown as { __botbDemoStore?: DemoStore };

export function demoStore(): DemoStore {
  if (!globalStore.__botbDemoStore) {
    const profiles = new Map<string, PublicProfile>();
    for (let i = 0; i < FIXTURES.length; i++) {
      const p = fixtureProfile(i);
      profiles.set(p.id, p);
    }
    globalStore.__botbDemoStore = { profiles, whatsapp: new Map() };
  }
  // Self-heal stores created by an older module version (dev HMR).
  if (!globalStore.__botbDemoStore.whatsapp) {
    globalStore.__botbDemoStore.whatsapp = new Map();
  }
  return globalStore.__botbDemoStore;
}

export interface DemoSession {
  id: string;
  email: string;
}

export function parseDemoSession(raw: string | undefined): DemoSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as DemoSession).id === "string" &&
      typeof (parsed as DemoSession).email === "string" &&
      (parsed as DemoSession).id.length > 0 &&
      (parsed as DemoSession).id.length < 128
    ) {
      return {
        id: (parsed as DemoSession).id,
        email: (parsed as DemoSession).email,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export function demoIdForEmail(email: string): string {
  return `demo-user-${fnv1a(email.toLowerCase(), 42).toString(16)}`;
}

/** Recomputes a demo user's membership state from the authoritative rules. */
export function demoReconcileMembership(userId: string): void {
  const store = demoStore();
  const wa = store.whatsapp.get(userId);
  const profile = store.profiles.get(userId);
  if (!wa || !profile) return;
  const eligible =
    wa.verifiedAt !== null && wa.optInAt !== null && wa.syncEnabled;
  if (!eligible) {
    wa.membershipState = wa.verifiedAt ? "not_connected" : wa.membershipState;
    return;
  }
  wa.membershipState = profile.onBeach ? "member" : "not_member";
}
