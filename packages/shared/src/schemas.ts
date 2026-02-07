// Minimal runtime validation helpers (no external deps for hackathon)
// If you want stronger validation, swap this to zod / valibot.

export function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

export function isIsoString(s: unknown): s is string {
  return typeof s === "string" && /\d{4}-\d{2}-\d{2}T/.test(s);
}
