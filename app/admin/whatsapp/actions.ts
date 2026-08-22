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

const USER_COMMANDS = ["delete", "beach_on", "beach_off", "disconnect"] as const;

export async function adminUserAction(
  rawCommand: unknown,
  rawUserId: unknown,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Signed out." };
  const limited = rateLimit(`wa-admin-user:${user.id}`, 30, 60_000);
  if (!limited.ok) return { ok: false, error: "Easy. Try again in a moment." };
  const command = z.enum(USER_COMMANDS).safeParse(rawCommand);
  const userId = z.uuid().safeParse(rawUserId);
  if (!command.success || !userId.success) {
    return { ok: false, error: "Bad request." };
  }
  if (isDemoMode()) return { ok: false, error: "Demo mode." };
  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, error: "Not configured." };
  // Authorization enforced inside each SQL function (whatsapp_is_admin).
  const call =
    command.data === "delete"
      ? supabase.rpc("admin_delete_user", { p_user_id: userId.data })
      : command.data === "disconnect"
        ? supabase.rpc("admin_disconnect_whatsapp", { p_user_id: userId.data })
        : supabase.rpc("admin_set_beach", {
            p_user_id: userId.data,
            p_on_beach: command.data === "beach_on",
          });
  const { error } = await call;
  if (error) {
    return {
      ok: false,
      error: error.message.includes("not_yourself")
        ? "Not yourself. Ask another admin."
        : "Not authorized.",
    };
  }
  return { ok: true };
}
