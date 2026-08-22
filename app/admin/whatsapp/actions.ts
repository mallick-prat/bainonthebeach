"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/env";
import { rateLimit } from "@/lib/security/rateLimit";
import type { ActionResult } from "@/app/actions";

const COMMANDS = [
  "reconcile",
  "retry_failed",
  "disconnect_account",
  "rotate_qr",
] as const;

export async function adminWhatsAppCommandAction(
  raw: unknown,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Signed out." };
  const limited = rateLimit(`wa-admin:${user.id}`, 10, 60_000);
  if (!limited.ok) return { ok: false, error: "Easy. Try again in a moment." };
  const command = z.enum(COMMANDS).safeParse(raw);
  if (!command.success) return { ok: false, error: "Unknown command." };
  if (isDemoMode()) return { ok: false, error: "Demo mode has no worker." };
  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, error: "Not configured." };
  // Authorization happens inside the SQL function (whatsapp_admins).
  const { error } = await supabase.rpc("whatsapp_admin_command", {
    p_command: command.data,
  });
  if (error) return { ok: false, error: "Not authorized." };
  return { ok: true };
}
