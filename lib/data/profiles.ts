// Server-side data access for profiles and the beach snapshot.
// Branches between Supabase and the demo store; callers never know which.

import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { demoReconcileMembership, demoStore } from "./demo";
import type { BeachSnapshot, PublicProfile } from "./types";
import type { CharacterConfig } from "@/lib/validation/character";
import { rowToProfile, type ProfileRow } from "./convert";
import { applyStatus } from "./statusInvariant";
import { logServer } from "@/lib/observability/log";

const PUBLIC_COLUMNS =
  "id, display_name, character_config, character_schema_version, on_beach, on_beach_since";

export async function getProfile(
  userId: string,
): Promise<PublicProfile | null> {
  if (isDemoMode()) {
    return demoStore().profiles.get(userId) ?? null;
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logServer("profile_fetch_failed", { code: error.code });
    throw new Error("profile_fetch_failed");
  }
  return data ? rowToProfile(data as ProfileRow) : null;
}

export async function getBeachSnapshot(
  selfId: string | null,
): Promise<BeachSnapshot> {
  if (isDemoMode()) {
    const store = demoStore();
    const people = [...store.profiles.values()].filter((p) => p.onBeach);
    const self = selfId ? (store.profiles.get(selfId) ?? null) : null;
    return { people, self, demo: true };
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return { people: [], self: null, demo: true };
  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("on_beach", true)
    .limit(1000);
  if (error) {
    logServer("snapshot_fetch_failed", { code: error.code });
    throw new Error("snapshot_fetch_failed");
  }
  const people = (data as ProfileRow[]).map(rowToProfile);
  let self: PublicProfile | null = null;
  if (selfId) {
    self = people.find((p) => p.id === selfId) ?? (await getProfile(selfId));
  }
  return { people, self, demo: false };
}

export interface ProfileWrite {
  displayName: string;
  characterConfig: CharacterConfig;
}

export async function upsertOwnProfile(
  userId: string,
  write: ProfileWrite,
): Promise<void> {
  if (isDemoMode()) {
    const store = demoStore();
    const existing = store.profiles.get(userId);
    store.profiles.set(userId, {
      id: userId,
      displayName: write.displayName,
      characterConfig: write.characterConfig,
      characterSchemaVersion: 1,
      onBeach: existing?.onBeach ?? false,
      onBeachSince: existing?.onBeachSince ?? null,
    });
    return;
  }
  const supabase = await createSupabaseServer();
  if (!supabase) throw new Error("not_configured");
  // Update-then-insert instead of upsert: column-level grants deliberately
  // exclude UPDATE on id, and Postgres checks the upsert's conflict branch
  // privileges even when no conflict occurs.
  const fields = {
    display_name: write.displayName,
    character_config: write.characterConfig,
    character_schema_version: 1,
  };
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", userId)
    .select("id");
  if (updateError) {
    logServer("profile_update_failed", { code: updateError.code });
    throw new Error("profile_save_failed");
  }
  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({ id: userId, ...fields });
    if (insertError) {
      logServer("profile_insert_failed", { code: insertError.code });
      throw new Error("profile_save_failed");
    }
  }
}

/** Atomic status change; on_beach and on_beach_since always move together. */
export async function setBeachStatus(
  userId: string,
  join: boolean,
): Promise<void> {
  if (isDemoMode()) {
    const store = demoStore();
    const existing = store.profiles.get(userId);
    if (!existing) throw new Error("no_profile");
    const status = applyStatus(join, new Date());
    store.profiles.set(userId, {
      ...existing,
      onBeach: status.onBeach,
      onBeachSince: status.onBeachSince,
    });
    demoReconcileMembership(userId);
    return;
  }
  const supabase = await createSupabaseServer();
  if (!supabase) throw new Error("not_configured");
  const { error } = await supabase.rpc("set_beach_status", {
    p_on_beach: join,
  });
  if (error) {
    logServer("status_change_failed", { code: error.code });
    throw new Error("status_change_failed");
  }
}
