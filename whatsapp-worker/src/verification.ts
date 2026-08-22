// Sends verification codes for pending requests: confirm the number is on
// WhatsApp, generate a secure code, store only its bcrypt hash, message the
// number from the dedicated account.

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { WhatsAppAdapter } from "./adapter";
import { setMembershipState, type Db } from "./db";
import { log } from "./log";

export async function processVerificationSends(
  db: Db,
  adapter: WhatsAppAdapter,
) {
  if (!adapter.isConnected()) return;
  const { data: pending } = await db
    .from("whatsapp_verification_codes")
    .select("id, user_id, phone_e164")
    .eq("send_state", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(10);
  for (const row of pending ?? []) {
    try {
      const identity = await adapter.checkNumber(row.phone_e164);
      if (!identity) {
        await db
          .from("whatsapp_verification_codes")
          .update({ send_state: "failed" })
          .eq("id", row.id);
        await setMembershipState(db, row.user_id, "failed", "not_on_whatsapp");
        log.warn("verification_number_not_on_whatsapp", {
          userId: row.user_id,
        });
        continue;
      }
      // Cryptographically secure six-digit code; only the hash is stored.
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const hash = bcrypt.hashSync(code, 10);
      const { data: updated } = await db
        .from("whatsapp_verification_codes")
        .update({ code_hash: hash, send_state: "sent" })
        .eq("id", row.id)
        .eq("send_state", "pending")
        .select("id");
      if (!updated || updated.length === 0) continue; // superseded meanwhile
      await adapter.sendVerificationCode(identity, code);
      log.info("verification_code_sent", { userId: row.user_id });
    } catch (e) {
      log.error("verification_send_failed", { message: String(e) });
    }
  }
}
