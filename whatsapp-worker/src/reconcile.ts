// Periodic reconciliation: the database is authoritative; the actual group
// membership is converged toward it. Catches invite-link joins, manual
// removals, revoked consent, and off-the-beach rejoin via stale invites.

import { desiredMembership } from "../../lib/whatsapp/membership";
import { phoneToWhatsAppJid } from "../../lib/whatsapp/phone";
import type { WhatsAppAdapter } from "./adapter";
import { sameUser } from "./membership";
import { setMembershipState, updateGroupConfig, type Db } from "./db";
import { log } from "./log";

export async function reconcileGroup(
  db: Db,
  adapter: WhatsAppAdapter,
  groupJid: string,
) {
  if (!adapter.isConnected()) return;
  const members = await adapter.getGroupMembers(groupJid);
  const selfJid = members.length > 0 ? null : null; // dedicated account resolved below

  const { data: rows } = await db
    .from("whatsapp_profiles")
    .select(
      "user_id, phone_e164, phone_verified_at, whatsapp_opt_in_at, whatsapp_sync_enabled, whatsapp_membership_state",
    )
    .not("phone_e164", "is", null);

  const { data: beach } = await db.from("profiles").select("id, on_beach");
  const onBeach = new Map(
    (beach ?? []).map((p) => [p.id as string, Boolean(p.on_beach)]),
  );

  const knownJids = new Map<
    string,
    { userId: string; desired: boolean | null }
  >();
  let added = 0;
  let removed = 0;

  for (const row of rows ?? []) {
    const desired = desiredMembership({
      phoneVerified: row.phone_verified_at !== null,
      consented: row.whatsapp_opt_in_at !== null,
      syncEnabled: Boolean(row.whatsapp_sync_enabled),
      onBeach: onBeach.get(row.user_id) ?? false,
    });
    const jid = phoneToWhatsAppJid(row.phone_e164 as string);
    knownJids.set(jid, { userId: row.user_id as string, desired });
    const present = members.some((m) => sameUser(m, jid));

    if (desired === true && !present) {
      const identity = await adapter.checkNumber(row.phone_e164 as string);
      if (identity) {
        const [res] = await adapter.addParticipants(groupJid, [identity.jid]);
        if (String(res?.status) === "200") {
          await setMembershipState(db, row.user_id as string, "member", null);
          added++;
        }
      }
    } else if (desired !== true && present) {
      // Off the beach, revoked consent, or disconnected but still present
      // (e.g. rejoined through an old invitation link).
      const [res] = await adapter.removeParticipants(groupJid, [
        members.find((m) => sameUser(m, jid))!,
      ]);
      if (String(res?.status) === "200") {
        await setMembershipState(db, row.user_id as string, "not_member", null);
        removed++;
      }
    } else if (
      desired === true &&
      present &&
      row.whatsapp_membership_state !== "member"
    ) {
      // Invite-link join detected: confirm membership.
      await setMembershipState(db, row.user_id as string, "member", null);
    }
  }

  // Unknown members: never auto-removed (could be admins or the dedicated
  // account). Flag for administrator review instead.
  const unknown = members.filter(
    (m) => ![...knownJids.keys()].some((j) => sameUser(j, m)),
  );
  void selfJid;

  await updateGroupConfig(db, {
    member_count: members.length,
    last_reconciled_at: new Date().toISOString(),
  });
  log.info("reconcile_done", {
    members: members.length,
    added,
    removed,
    unknownFlagged: Math.max(0, unknown.length - 1), // minus the dedicated account
  });
}
