// Baileys auth state persisted ENCRYPTED in Postgres, so credentials
// survive worker restarts on ephemeral filesystems. Modeled after
// useMultiFileAuthState, with the database as the store.

// Default-import + destructure: Baileys is CJS and Node's ESM named-export
// detection misses re-exports like `proto`.
import baileysPkg from "@whiskeysockets/baileys";
import type { AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";

const { initAuthCreds, BufferJSON, proto } = baileysPkg as unknown as Pick<
  typeof import("@whiskeysockets/baileys"),
  "initAuthCreds" | "BufferJSON" | "proto"
>;
import type { Db } from "./db";
import { decrypt, encrypt } from "./crypto";

async function readKey(db: Db, key: string): Promise<unknown | null> {
  const { data } = await db
    .from("whatsapp_auth_state")
    .select("value_encrypted")
    .eq("key", key)
    .maybeSingle();
  if (!data?.value_encrypted) return null;
  return JSON.parse(decrypt(data.value_encrypted), BufferJSON.reviver);
}

async function writeKey(db: Db, key: string, value: unknown): Promise<void> {
  const payload = encrypt(JSON.stringify(value, BufferJSON.replacer));
  await db
    .from("whatsapp_auth_state")
    .upsert({
      key,
      value_encrypted: payload,
      updated_at: new Date().toISOString(),
    });
}

async function removeKey(db: Db, key: string): Promise<void> {
  await db.from("whatsapp_auth_state").delete().eq("key", key);
}

export async function useDatabaseAuthState(db: Db): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAll: () => Promise<void>;
}> {
  const creds =
    ((await readKey(db, "creds")) as AuthenticationState["creds"] | null) ??
    initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ) => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          let value = (await readKey(db, `${type}-${id}`)) as
            SignalDataTypeMap[T] | null;
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value,
            ) as unknown as SignalDataTypeMap[T];
          }
          if (value) result[id] = value;
        }
        return result;
      },
      set: async (data) => {
        for (const type of Object.keys(data) as Array<
          keyof SignalDataTypeMap
        >) {
          const entries = data[type];
          if (!entries) continue;
          for (const id of Object.keys(entries)) {
            const value = entries[id];
            const key = `${type}-${id}`;
            if (value) await writeKey(db, key, value);
            else await removeKey(db, key);
          }
        }
      },
    },
  };

  return {
    state,
    saveCreds: () => writeKey(db, "creds", state.creds),
    clearAll: async () => {
      await db.from("whatsapp_auth_state").delete().neq("key", "");
    },
  };
}
