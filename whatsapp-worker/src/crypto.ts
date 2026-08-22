// AES-256-GCM encryption for Baileys auth state at rest.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

function key(): Buffer {
  const buf = Buffer.from(env.authEncryptionKey, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "WHATSAPP_AUTH_ENCRYPTION_KEY must be 32 bytes of hex (64 chars)",
    );
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || !data) throw new Error("malformed encrypted payload");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
