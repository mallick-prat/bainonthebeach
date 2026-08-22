// Supabase auth callback: OAuth code exchange and magic-link verification,
// then SERVER-SIDE domain enforcement. Client checks are cosmetic only.

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isEmailAllowed, parseAllowedDomains } from "@/lib/auth/domains";
import { getProfile } from "@/lib/data/profiles";
import { logServer } from "@/lib/observability/log";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const oauthError = url.searchParams.get("error");
  const origin = url.origin;

  const loginWith = (error: string) =>
    NextResponse.redirect(`${origin}/login?error=${error}`);

  if (oauthError) {
    logServer("auth_callback_provider_error", { code: oauthError });
    return loginWith(oauthError === "access_denied" ? "cancelled" : "provider");
  }

  const supabase = await createSupabaseServer();
  if (!supabase) return loginWith("config");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logServer("auth_callback_exchange_failed", {
        code: error.code ?? "unknown",
      });
      // A second open of the same link lands here; if a session already
      // exists, continue instead of showing an error.
      const { data } = await supabase.auth.getUser();
      if (!data.user) return loginWith("expired");
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      logServer("auth_callback_otp_failed", { code: error.code ?? "unknown" });
      const { data } = await supabase.auth.getUser();
      if (!data.user) return loginWith("expired");
    }
  }
  // No code/token: the client may have verified an OTP already, in which
  // case a session cookie exists and we just route the user onward.

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!data.user || !email) {
    return loginWith(code || tokenHash ? "expired" : "missing");
  }

  // Server-side allowlist enforcement. Fails closed on a malformed list.
  const allowlist = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS);
  if (!isEmailAllowed(email, allowlist)) {
    logServer("auth_callback_domain_denied", {});
    await supabase.auth.signOut();
    return loginWith("domain");
  }

  const profile = await getProfile(data.user.id).catch(() => null);
  return NextResponse.redirect(
    `${origin}${profile?.characterConfig ? "/beach" : "/create-character"}`,
  );
}
