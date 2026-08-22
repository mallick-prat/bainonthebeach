// Environment access. Public values are safe for the client; everything else
// stays server-only. Missing Supabase config switches the app to demo mode
// instead of crashing.

export function supabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

export function supabaseAnonKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
}

/** Demo mode: no Supabase configured. Local fixtures, local-only sign-in. */
export function isDemoMode(): boolean {
  return !supabaseUrl() || !supabaseAnonKey();
}

export function siteUrl(): string | null {
  return process.env.NEXT_PUBLIC_SITE_URL || null;
}

export function footerNote(): string {
  return process.env.NEXT_PUBLIC_FOOTER_NOTE ?? "Unofficial and just for fun";
}

export function devOverlayEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_OVERLAY === "1"
  );
}
