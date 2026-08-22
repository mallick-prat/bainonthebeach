// Gateless entry: visitors get an anonymous session and land in the game.
// Email sign-in remains at /login for admins only.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/env";
import { DEMO_COOKIE, demoIdForEmail } from "@/lib/data/demo";
import { logServer } from "@/lib/observability/log";
import { track } from "@/lib/observability/analytics";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  const existing = await getSessionUser();
  if (existing) {
    const profile = await getProfile(existing.id).catch(() => null);
    return NextResponse.redirect(
      `${origin}${profile?.characterConfig ? "/beach" : "/create-character"}`,
    );
  }

  if (isDemoMode()) {
    const email = `guest-${randomUUID()}@guest.local`;
    const cookieStore = await cookies();
    cookieStore.set(
      DEMO_COOKIE,
      JSON.stringify({ id: demoIdForEmail(email), email }),
      { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 },
    );
    track("login_started");
    return NextResponse.redirect(`${origin}/create-character`);
  }

  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.redirect(`${origin}/login?error=config`);
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    logServer("guest_signin_failed", { code: error?.code ?? "unknown" });
    return NextResponse.redirect(`${origin}/login?error=provider`);
  }
  track("login_started");
  return NextResponse.redirect(`${origin}/create-character`);
}
