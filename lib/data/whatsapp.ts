// Server-side access to the user's OWN WhatsApp connection state.
// Real mode reads the private whatsapp_profiles table under RLS (own row
// only); nothing here ever returns another user's phone data.

import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  DEMO_VERIFICATION_CODE,
  demoReconcileMembership,
  demoStore,
} from "./demo";
import type { SelfWhatsApp } from "./types";
import {
  CONSENT_VERSION,
  type MembershipState,
} from "@/lib/whatsapp/membership";
import type { NormalizedPhone } from "@/lib/whatsapp/phone";
import { logServer } from "@/lib/observability/log";

const DISCONNECTED: SelfWhatsApp = {
  connected: false,
  lastFour: null,
  countryCode: null,
  verified: false,
  optedIn: false,
  membershipState: "not_connected",
  inviteUrl: null,
};

export async function getSelfWhatsApp(userId: string): Promise<SelfWhatsApp> {
  if (isDemoMode()) {
    const wa = demoStore().whatsapp.get(userId);
    if (!wa) return DISCONNECTED;
    const onBeach = demoStore().profiles.get(userId)?.onBeach ?? false;
    return {
      connected: true,
      lastFour: wa.lastFour,
      countryCode: wa.countryCode,
      verified: wa.verifiedAt !== null,
      optedIn: wa.optInAt !== null,
      membershipState: wa.membershipState,
      inviteUrl:
        onBeach &&
        (wa.membershipState === "invite_required" ||
          wa.membershipState === "member")
          ? "https://chat.whatsapp.com/demo-invite"
          : null,
    };
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return DISCONNECTED;
  const { data, error } = await supabase
    .from("whatsapp_profiles")
    .select(
      "phone_country_code, phone_last_four, phone_verified_at, whatsapp_opt_in_at, whatsapp_sync_enabled, whatsapp_membership_state",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) logServer("whatsapp_self_fetch_failed", { code: error.code });
    return DISCONNECTED;
  }
  const state = (data.whatsapp_membership_state ??
    "not_connected") as MembershipState;
  let inviteUrl: string | null = null;
  if (state === "invite_required" || state === "member") {
    // SECURITY DEFINER function; returns null unless verified + opted in +
    // currently on the beach.
    const { data: invite } = await supabase.rpc("whatsapp_get_invite");
    inviteUrl = typeof invite === "string" ? invite : null;
  }
  return {
    connected: true,
    lastFour: data.phone_last_four,
    countryCode: data.phone_country_code,
    verified: data.phone_verified_at !== null,
    optedIn: data.whatsapp_opt_in_at !== null && data.whatsapp_sync_enabled,
    membershipState: state,
    inviteUrl,
  };
}

/* ----------------------- demo-mode mutations ----------------------- */

export function demoSavePhone(
  userId: string,
  phone: NormalizedPhone,
  consent: boolean,
) {
  const store = demoStore();
  // Duplicate numbers attached to another user are rejected.
  for (const [otherId, wa] of store.whatsapp) {
    if (otherId !== userId && wa.phoneE164 === phone.e164) {
      throw new Error("duplicate_number");
    }
  }
  store.whatsapp.set(userId, {
    phoneE164: phone.e164,
    countryCode: phone.countryCode,
    lastFour: phone.lastFour,
    verifiedAt: null,
    optInAt: consent ? new Date().toISOString() : null,
    consentVersion: consent ? CONSENT_VERSION : null,
    syncEnabled: consent,
    membershipState: "verification_pending",
  });
}

export function demoVerifyCode(userId: string, code: string): boolean {
  const store = demoStore();
  const wa = store.whatsapp.get(userId);
  if (!wa || code.trim() !== DEMO_VERIFICATION_CODE) return false;
  wa.verifiedAt = new Date().toISOString();
  demoReconcileMembership(userId);
  return true;
}

export function demoDisconnect(userId: string) {
  demoStore().whatsapp.delete(userId);
}
