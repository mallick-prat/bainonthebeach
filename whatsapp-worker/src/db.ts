// Supabase service-role access for the worker. This key never leaves the
// worker environment.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export type Db = SupabaseClient;

export function createDb(): Db {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface GroupConfig {
  id: string;
  group_jid: string | null;
  subject: string;
  invite_url: string | null;
  connection_state: string;
  member_count: number | null;
  last_reconciled_at: string | null;
}

export async function getGroupConfig(db: Db): Promise<GroupConfig> {
  const { data, error } = await db
    .from("whatsapp_group_config")
    .select("*")
    .eq("id", "bain_on_the_beach")
    .single();
  if (error) throw new Error(`group config read failed: ${error.code}`);
  return data as GroupConfig;
}

export async function updateGroupConfig(
  db: Db,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("whatsapp_group_config")
    .update(patch)
    .eq("id", "bain_on_the_beach");
  if (error) throw new Error(`group config update failed: ${error.code}`);
}

export interface MembershipJob {
  id: string;
  user_id: string;
  phone_e164: string;
  desired_membership: boolean;
  state: string;
  attempts: number;
}

/** Optimistic claim; safe with a single dedicated worker (documented). */
export async function claimNextJob(db: Db): Promise<MembershipJob | null> {
  const { data: candidates } = await db
    .from("whatsapp_membership_jobs")
    .select("id, user_id, phone_e164, desired_membership, state, attempts")
    .eq("state", "queued")
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1);
  const job = candidates?.[0] as MembershipJob | undefined;
  if (!job) return null;
  const { data: claimed } = await db
    .from("whatsapp_membership_jobs")
    .update({ state: "running", locked_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("state", "queued")
    .select("id, user_id, phone_e164, desired_membership, state, attempts");
  return (claimed?.[0] as MembershipJob | undefined) ?? null;
}

export async function finishJob(
  db: Db,
  id: string,
  state: "done" | "failed" | "superseded" | "queued",
  patch: Record<string, unknown> = {},
): Promise<void> {
  await db
    .from("whatsapp_membership_jobs")
    .update({
      state,
      completed_at:
        state === "done" || state === "failed"
          ? new Date().toISOString()
          : null,
      ...patch,
    })
    .eq("id", id);
}

export interface WaProfile {
  user_id: string;
  phone_e164: string | null;
  phone_verified_at: string | null;
  whatsapp_opt_in_at: string | null;
  whatsapp_sync_enabled: boolean;
  whatsapp_membership_state: string;
}

export async function getWaProfile(
  db: Db,
  userId: string,
): Promise<WaProfile | null> {
  const { data } = await db
    .from("whatsapp_profiles")
    .select(
      "user_id, phone_e164, phone_verified_at, whatsapp_opt_in_at, whatsapp_sync_enabled, whatsapp_membership_state",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return (data as WaProfile | null) ?? null;
}

export async function setMembershipState(
  db: Db,
  userId: string,
  state: string,
  errorCode: string | null = null,
): Promise<void> {
  await db
    .from("whatsapp_profiles")
    .update({
      whatsapp_membership_state: state,
      whatsapp_membership_error: errorCode,
      whatsapp_membership_updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function isOnBeach(db: Db, userId: string): Promise<boolean> {
  const { data } = await db
    .from("profiles")
    .select("on_beach")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.on_beach);
}

export interface WaProfileByPhone {
  user_id: string;
  phone_verified_at: string | null;
  whatsapp_opt_in_at: string | null;
  whatsapp_sync_enabled: boolean;
}

export async function getWaProfileByPhone(
  db: Db,
  phoneE164: string,
): Promise<WaProfileByPhone | null> {
  const { data } = await db
    .from("whatsapp_profiles")
    .select("user_id, phone_verified_at, whatsapp_opt_in_at, whatsapp_sync_enabled")
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  return (data as WaProfileByPhone | null) ?? null;
}

/** Worker-authoritative beach flip (used by the WhatsApp -> app direction). */
export async function setBeachDirect(db: Db, userId: string, on: boolean): Promise<void> {
  await db
    .from("profiles")
    .update({
      on_beach: on,
      on_beach_since: on ? new Date().toISOString() : null,
    })
    .eq("id", userId);
}
