// Demo mode: everything local, no external services. Used when Supabase env
// vars are missing (development, e2e tests). The store is per-server-process
// and seeded with deterministic fixture beachgoers.

import { fnv1a, hash01 } from "@/game/movement/hash";
import { randomCharacter, type CharacterConfig } from "@/lib/validation/character";
import type { PublicProfile } from "./types";

export const DEMO_COOKIE = "botb_demo_session";

const FIXTURES: Array<{ name: string; office: string | null }> = [
  { name: "Priya", office: "BOS" },
  { name: "Casey", office: "NYC" },
  { name: "Jordan", office: "SF" },
  { name: "Álvaro", office: "LON" },
  { name: "Sam O.", office: "BOS" },
  { name: "Devon", office: "CHI" },
  { name: "Riley", office: "SYD" },
  { name: "Morgan", office: null },
  { name: "Taylor", office: "NYC" },
  { name: "Jamie", office: "LON" },
  { name: "Avery", office: null },
  { name: "Jordan", office: "BOS" }, // duplicate display name on purpose
];

function seededRand(seed: string): () => number {
  let i = 0;
  return () => hash01(seed, i++ + 100);
}

function fixtureProfile(index: number): PublicProfile {
  const f = FIXTURES[index]!;
  const id = `demo-${index}-${fnv1a(f.name, index).toString(16)}`;
  const config: CharacterConfig = randomCharacter(seededRand(id));
  return {
    id,
    displayName: f.name,
    officeCode: f.office,
    characterConfig: config,
    characterSchemaVersion: 1,
    onBeach: index < 9, // a few fixtures stay off-beach
    onBeachSince: index < 9 ? new Date(2026, 0, 1 + index).toISOString() : null,
  };
}

interface DemoStore {
  profiles: Map<string, PublicProfile>;
}

const globalStore = globalThis as unknown as { __botbDemoStore?: DemoStore };

export function demoStore(): DemoStore {
  if (!globalStore.__botbDemoStore) {
    const profiles = new Map<string, PublicProfile>();
    for (let i = 0; i < FIXTURES.length; i++) {
      const p = fixtureProfile(i);
      profiles.set(p.id, p);
    }
    globalStore.__botbDemoStore = { profiles };
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
      return { id: (parsed as DemoSession).id, email: (parsed as DemoSession).email };
    }
  } catch {
    // fall through
  }
  return null;
}

export function demoIdForEmail(email: string): string {
  return `demo-user-${fnv1a(email.toLowerCase(), 42).toString(16)}`;
}
