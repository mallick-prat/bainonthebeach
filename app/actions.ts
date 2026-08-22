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
import { isValidOffice } from "@/lib/config/offices";
import { getProfile, setBeachStatus, upsertOwnProfile } from "@/lib/data/profiles";
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
  invalid_office: "Unknown office.",
  no_profile: "Make your character first.",
  save_failed: "Save failed. Try again.",
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
    officeCode: z.string().nullable(),
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
  const office = parsed.data.officeCode;
  if (office !== null && !isValidOffice(office)) return fail("invalid_office");

  const existing = await getProfile(auth.id).catch(() => null);
  try {
    await upsertOwnProfile(auth.id, {
      displayName: name.name,
      officeCode: office,
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
    await setBeachStatus(auth.id, join);
  } catch {
    return fail("save_failed");
  }
  track(join ? "joined_beach" : "left_beach");
  if (navigateToBeach) redirect("/beach");
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
