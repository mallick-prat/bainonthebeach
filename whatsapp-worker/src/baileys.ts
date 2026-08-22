// Baileys-backed adapter. The ONLY file that touches the WhatsApp socket.
// Baileys is an unofficial client; use a dedicated account (see README).

// Default-import + destructure: Baileys is CJS; under Node's ESM loader the
// callable socket factory lives on module.exports.default.
import baileysPkg from "@whiskeysockets/baileys";
import pino from "pino";

type BaileysModule = typeof import("@whiskeysockets/baileys");
const B = baileysPkg as unknown as BaileysModule & { default?: BaileysModule["default"] };
const makeWASocket = B.default ?? (baileysPkg as unknown as BaileysModule["default"]);
const { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = B;
import type { Boom } from "@hapi/boom";
import NodeCache from "node-cache";
import qrterm from "qrcode-terminal";
import { phoneToWhatsAppJid } from "../../lib/whatsapp/phone";
import type {
  ParticipantResult,
  WhatsAppAdapter,
  WhatsAppGroup,
  WhatsAppIdentity,
} from "./adapter";
import { useDatabaseAuthState } from "./auth-state";
import { updateGroupConfig, getGroupConfig, type Db } from "./db";
import { env } from "./env";
import { log } from "./log";

const GROUP_SUBJECT = "Bain on the Beach";
const GROUP_DESCRIPTION =
  "People currently marked on the beach in bainonthebeach.com. " +
  "Membership is synchronized automatically.";

type Socket = ReturnType<typeof makeWASocket>;

export class BaileysAdapter implements WhatsAppAdapter {
  private sock: Socket | null = null;
  private connected = false;
  private db: Db;
  private metaCache = new NodeCache({ stdTTL: 60 });
  private reconnectDelay = 2_000;
  onReconnected: (() => void) | null = null;
  onParticipantsChange:
    | ((groupJid: string, participants: string[], action: string) => void)
    | null = null;

  constructor(db: Db) {
    this.db = db;
  }

  async connect(): Promise<void> {
    const { state, saveCreds, clearAll } = await useDatabaseAuthState(this.db);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({ level: "silent" }) as never,
        ),
      },
      // Recommended group metadata cache.
      cachedGroupMetadata: async (jid) => this.metaCache.get(jid),
      markOnlineOnConnect: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", () => void saveCreds());

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        // Short-lived QR for the protected admin page. Never logged.
        void updateGroupConfig(this.db, {
          connection_state: "waiting_for_qr",
          qr_data: qr,
          qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
        if (env.qrToTerminal) qrterm.generate(qr, { small: true });
        log.info("qr_issued", {});
      }
      if (connection === "open") {
        this.connected = true;
        this.reconnectDelay = 2_000;
        void updateGroupConfig(this.db, {
          connection_state: "connected",
          connected_account_name: sock.user?.name ?? null,
          last_connected_at: new Date().toISOString(),
          qr_data: null,
          qr_expires_at: null,
        });
        log.info("whatsapp_connected", {});
        this.onReconnected?.();
      }
      if (connection === "close") {
        this.connected = false;
        const code = (lastDisconnect?.error as Boom | undefined)?.output
          ?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        void updateGroupConfig(this.db, {
          connection_state: loggedOut ? "action_required" : "reconnecting",
        });
        log.warn("whatsapp_disconnected", { code: code ?? null, loggedOut });
        if (loggedOut) {
          // Session revoked: wipe credentials and wait for a new QR scan.
          void clearAll().then(() => this.scheduleReconnect());
        } else {
          this.scheduleReconnect();
        }
      }
    });

    sock.ev.on("groups.update", (updates) => {
      for (const u of updates) if (u.id) this.metaCache.del(u.id);
    });
    sock.ev.on("group-participants.update", (u) => {
      this.metaCache.del(u.id);
      this.onParticipantsChange?.(u.id, u.participants ?? [], u.action);
    });
  }

  private scheduleReconnect() {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
    setTimeout(() => {
      this.connect().catch((e) =>
        log.error("reconnect_failed", { message: String(e) }),
      );
    }, delay);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private socket(): Socket {
    if (!this.sock || !this.connected)
      throw new Error("whatsapp_not_connected");
    return this.sock;
  }

  async checkNumber(phoneE164: string): Promise<WhatsAppIdentity | null> {
    const results = await this.socket().onWhatsApp(
      phoneE164.replace(/^\+/, ""),
    );
    const hit = results?.find((r) => r.exists);
    return hit ? { jid: hit.jid } : null;
  }

  async sendVerificationCode(
    identity: WhatsAppIdentity,
    code: string,
  ): Promise<void> {
    await this.socket().sendMessage(identity.jid, {
      text: `Your Bain on the Beach verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
    });
  }

  async ensureGroup(): Promise<WhatsAppGroup> {
    const sock = this.socket();
    const cfg = await getGroupConfig(this.db);

    // 1-4: stored JID still valid, we are a member and an admin?
    if (cfg.group_jid) {
      try {
        const meta = await sock.groupMetadata(cfg.group_jid);
        const me = sock.user?.id?.split(":")[0];
        const self = meta.participants.find((p) => p.id.startsWith(me ?? "never-matches"));
        if (self && (self.admin === "admin" || self.admin === "superadmin")) {
          this.metaCache.set(cfg.group_jid, meta);
          return { jid: meta.id, subject: meta.subject };
        }
        log.warn("group_admin_rights_missing", {});
        await updateGroupConfig(this.db, {
          connection_state: "action_required",
        });
        return { jid: meta.id, subject: meta.subject };
      } catch {
        log.warn("stored_group_unreachable", {});
      }
    }

    // 5: search groups we already participate in before creating.
    const all = await sock.groupFetchAllParticipating();
    for (const meta of Object.values(all)) {
      if (meta.subject === GROUP_SUBJECT) {
        await updateGroupConfig(this.db, { group_jid: meta.id });
        return { jid: meta.id, subject: meta.subject };
      }
    }

    // 6-10: create once, guarded by an optimistic claim on the config row.
    const { data: claim } = await this.db
      .from("whatsapp_group_config")
      .update({ connection_state: "creating_group" })
      .eq("id", "bain_on_the_beach")
      .is("group_jid", null)
      .select("id");
    if (!claim || claim.length === 0) {
      const again = await getGroupConfig(this.db);
      if (again.group_jid)
        return { jid: again.group_jid, subject: GROUP_SUBJECT };
    }
    const created = await sock.groupCreate(GROUP_SUBJECT, []);
    await updateGroupConfig(this.db, {
      group_jid: created.id,
      connection_state: "connected",
    });
    await sock.groupUpdateDescription(created.id, GROUP_DESCRIPTION);
    // Only admins may change group info; messaging stays open to all.
    await sock.groupSettingUpdate(created.id, "locked");
    const invite = await sock.groupInviteCode(created.id);
    await updateGroupConfig(this.db, {
      invite_url: `https://chat.whatsapp.com/${invite}`,
    });
    log.info("group_created", {});
    return { jid: created.id, subject: GROUP_SUBJECT };
  }

  async getGroupMembers(groupJid: string): Promise<string[]> {
    const sock = this.socket();
    let meta =
      this.metaCache.get<Awaited<ReturnType<Socket["groupMetadata"]>>>(
        groupJid,
      );
    if (!meta) {
      meta = await sock.groupMetadata(groupJid);
      this.metaCache.set(groupJid, meta);
    }
    return meta.participants.map((p) => p.id);
  }

  async addParticipants(
    groupJid: string,
    participantJids: string[],
  ): Promise<ParticipantResult[]> {
    const res = await this.socket().groupParticipantsUpdate(
      groupJid,
      participantJids,
      "add",
    );
    this.metaCache.del(groupJid);
    return res.map((r) => ({ jid: r.jid, status: String(r.status) }));
  }

  async removeParticipants(
    groupJid: string,
    participantJids: string[],
  ): Promise<ParticipantResult[]> {
    const res = await this.socket().groupParticipantsUpdate(
      groupJid,
      participantJids,
      "remove",
    );
    this.metaCache.del(groupJid);
    return res.map((r) => ({ jid: r.jid, status: String(r.status) }));
  }

  async getInviteLink(groupJid: string): Promise<string> {
    const code = await this.socket().groupInviteCode(groupJid);
    return `https://chat.whatsapp.com/${code}`;
  }
}

export { phoneToWhatsAppJid };
