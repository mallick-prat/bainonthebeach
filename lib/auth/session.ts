// Server-side session resolution for both modes.
// Supabase mode: validated user from the auth cookie.
// Demo mode: local cookie, no external calls.

import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DEMO_COOKIE, parseDemoSession } from "@/lib/data/demo";

export interface SessionUser {
  id: string;
  email: string | null;
  /** Best-effort name from the auth provider, for prefill only. */
  providerName: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (isDemoMode()) {
    const cookieStore = await cookies();
    const session = parseDemoSession(cookieStore.get(DEMO_COOKIE)?.value);
    if (!session) return null;
    return { id: session.id, email: session.email, providerName: null };
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const meta = data.user.user_metadata as Record<string, unknown> | null;
  const providerName =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    null;
  return { id: data.user.id, email: data.user.email ?? null, providerName };
}
