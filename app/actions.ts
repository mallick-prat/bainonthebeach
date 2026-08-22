"use server";

// All mutations go through these actions: auth check, domain eligibility,
// rate limit, Zod validation, then the data layer. Typed, user-safe errors.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { isEmailAllowed, parseAllowedDomains } from "@/lib/auth/domains";
import { characterConfigSchema } from "@/lib/validation/character";
import { normalizeDisplayName } from "@/lib/validation/names";
import {
  getProfile,
  setBeachStatus,
  upsertOwnProfile,
} from "@/lib/data/profiles";
import {
  demoDisconnect,
  demoSavePhone,
  demoVerifyCode,
} from "@/lib/data/whatsapp";
import { isClearlyTestNumber, normalizePhone } from "@/lib/whatsapp/phone";
import { rateLimit } from "@/lib/security/rateLimit";
import { isDemoMode } from "@/lib/env";
import { DEMO_COOKIE, demoIdForEmail } from "@/lib/data/demo";
import { createSupabaseServer } from "@/lib/supabase/server";
import { logServer } from "@/lib/observability/log";
import { track } from "@/lib/observability/analytics";

export type ActionResult = { ok: true } | { ok: false; error: string };

const FRIENDLY: Record<string, string> = {
  not_signed_in: "You are signed out. Head back to the door.",
  domain: "That email is not on the list for this beach.",
  rate_limited: "Easy. Try again in a moment.",
  invalid_name: "That name will not fit on a tiny sign.",
  invalid_config: "That outfit does not exist here.",
  no_profile: "Make your character first.",
  save_failed: "Save failed. Try again.",
  invalid_phone: "That number does not parse. Include the country code.",
  duplicate_number: "That number is already connected to someone else.",
  consent_required: "The consent box stays unchecked until you check it.",
  bad_code: "That code did not work. Check it or send a new one.",
  not_configured: "WhatsApp sync is not configured on this deployment.",
};

function fail(code: string): { ok: false; error: string } {
  return { ok: false, error: FRIENDLY[code] ?? "Something broke. Try again." };
}

async function requireEligibleUser(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return fail("not_signed_in");
  const allowlist = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS);
  if (!isDemoMode() && user.email && !isEmailAllowed(user.email, allowlist)) {
    logServer("mutation_blocked_domain", {});
    return fail("domain");
  }
  return { ok: true, id: user.id };
}

/* ------------------------- demo sign in --------------------------- */

export async function demoSignInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!isDemoMode()) return fail("save_failed");
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .safeParse(formData.get("email"));
  if (!email.success) return { ok: false, error: "That is not an email." };
  const cookieStore = await cookies();
  cookieStore.set(
    DEMO_COOKIE,
    JSON.stringify({ id: demoIdForEmail(email.data), email: email.data }),
    { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 },
  );
  track("login_started");
  const profile = await getProfile(demoIdForEmail(email.data));
  redirect(profile?.characterConfig ? "/beach" : "/create-character");
}

/* ------------------------- character save ------------------------- */

const saveInput = z
  .object({
    displayName: z.string(),
    config: characterConfigSchema,
  })
  .strict();

export async function saveCharacterAction(raw: unknown): Promise<ActionResult> {
  const auth = await requireEligibleUser();
  if (!auth.ok) return auth;
  const limited = rateLimit(`save:${auth.id}`, 10, 60_000);
  if (!limited.ok) return fail("rate_limited");

  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) return fail("invalid_config");
  const name = normalizeDisplayName(parsed.data.displayName);
  if (!name.ok) return fail("invalid_name");

  const existing = await getProfile(auth.id).catch(() => null);
  try {
    await upsertOwnProfile(auth.id, {
      displayName: name.name,
      characterConfig: parsed.data.config,
    });
  } catch {
    return fail("save_failed");
  }
  track("character_completed");
  redirect(existing?.characterConfig ? "/beach" : "/status");
}

/* ------------------------- beach status --------------------------- */

export async function setBeachStatusAction(
  join: boolean,
  navigateToBeach = false,
): Promise<ActionResult> {
  const auth = await requireEligibleUser();
  if (!auth.ok) return auth;
  const limited = rateLimit(`status:${auth.id}`, 12, 60_000);
  if (!limited.ok) return fail("rate_limited");
  const profile = await getProfile(auth.id).catch(() => null);
  if (!profile?.characterConfig) return fail("no_profile");
  try {
    // Real mode: the SQL function updates status AND enqueues the WhatsApp
    // membership job in the same transaction. Demo mode simulates both.
    await setBeachStatus(auth.id, join);
  } catch {
    return fail("save_failed");
  }
  track(join ? "joined_beach" : "left_beach");
  if (navigateToBeach) redirect("/beach");
  return { ok: true };
}

/* ------------------------- whatsapp ------------------------------- */

const phoneInput = z
  .object({ phone: z.string().max(32), consent: z.boolean() })
  .strict();

export async function savePhoneAction(raw: unknown): Promise<ActionResult> {
  const auth = await requireEligibleUser();
  if (!auth.ok) return auth;
  const limited = rateLimit(`phone:${auth.id}`, 5, 10 * 60_000);
  if (!limited.ok) return fail("rate_limited");

  const parsed = phoneInput.safeParse(raw);
  if (!parsed.success) return fail("invalid_phone");
  if (!parsed.data.consent) return fail("consent_required");
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return fail("invalid_phone");
  if (
    process.env.NODE_ENV === "production" &&
    isClearlyTestNumber(phone.e164)
  ) {
    return fail("invalid_phone");
  }

  if (isDemoMode()) {
    try {
      demoSavePhone(auth.id, phone, parsed.data.consent);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "save_failed");
    }
    return { ok: true };
  }

  const supabase = await createSupabaseServer();
  if (!supabase) return fail("not_configured");
  const { error } = await supabase.rpc("whatsapp_request_verification", {
    p_phone_e164: phone.e164,
    p_country_code: phone.countryCode,
    p_consent_version: parsed.data.consent ? "current" : null,
  });
  if (error) {
    logServer("whatsapp_request_failed", { code: error.code });
    if (error.message?.includes("duplicate")) return fail("duplicate_number");
    if (error.message?.includes("rate")) return fail("rate_limited");
    return fail("save_failed");
  }
  return { ok: true };
}

export async function verifyPhoneCodeAction(
  rawCode: unknown,
): Promise<ActionResult> {
  const auth = await requireEligibleUser();
  if (!auth.ok) return auth;
  const limited = rateLimit(`verify:${auth.id}`, 8, 10 * 60_000);
  if (!limited.ok) return fail("rate_limited");
  const code = z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .safeParse(rawCode);
  if (!code.success) return fail("bad_code");

  if (isDemoMode()) {
    return demoVerifyCode(auth.id, code.data) ? { ok: true } : fail("bad_code");
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return fail("not_configured");
  const { data, error } = await supabase.rpc("whatsapp_verify_code", {
    p_code: code.data,
  });
  if (error) {
    logServer("whatsapp_verify_failed", { code: error.code });
    return fail("bad_code");
  }
  return data === true ? { ok: true } : fail("bad_code");
}

export async function disconnectWhatsAppAction(): Promise<ActionResult> {
  const auth = await requireEligibleUser();
  if (!auth.ok) return auth;
  const limited = rateLimit(`wa-disc:${auth.id}`, 6, 60_000);
  if (!limited.ok) return fail("rate_limited");
  if (isDemoMode()) {
    demoDisconnect(auth.id);
    return { ok: true };
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return fail("not_configured");
  const { error } = await supabase.rpc("whatsapp_disconnect");
  if (error) {
    logServer("whatsapp_disconnect_failed", { code: error.code });
    return fail("save_failed");
  }
  return { ok: true };
}

/* ------------------------- sign out ------------------------------- */

export async function signOutAction(): Promise<void> {
  if (isDemoMode()) {
    const cookieStore = await cookies();
    cookieStore.delete(DEMO_COOKIE);
  } else {
    const supabase = await createSupabaseServer();
    await supabase?.auth.signOut();
  }
  redirect("/");
}
