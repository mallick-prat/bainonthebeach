// Structured logging with phone/JID redaction baked in. State transitions,
// never secrets: no session material, codes, invite links, or full numbers.

import pino from "pino";
import { redactPhones } from "../../lib/whatsapp/phone";

const base = pino({ level: process.env.LOG_LEVEL ?? "info" });

type Fields = Record<string, string | number | boolean | null | undefined>;

function clean(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = typeof v === "string" ? redactPhones(v) : v;
  }
  return out;
}

export const log = {
  info: (event: string, fields: Fields = {}) => base.info(clean(fields), event),
  warn: (event: string, fields: Fields = {}) => base.warn(clean(fields), event),
  error: (event: string, fields: Fields = {}) =>
    base.error(clean(fields), event),
};
