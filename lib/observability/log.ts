// Structured server logging. Context only; never tokens, emails, or names.

type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logServer(event: string, fields: LogFields = {}) {
  const entry = { event, at: new Date().toISOString(), ...fields };
  console.log(JSON.stringify(entry));
}
