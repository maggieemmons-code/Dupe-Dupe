/**
 * Claude sometimes hands a nested object or list back as a JSON string inside
 * a tool call (seen Nov 15: the brief's visual_brief arrived as text, and the
 * signature details were lost). This turns any such string back into data,
 * one level down, so the agents' checks see the real structure.
 */
export function parseToolInput<T>(input: unknown): T | undefined {
  if (input == null) return undefined;
  const top = typeof input === "string" ? tryParse(input) : input;
  if (!top || typeof top !== "object" || Array.isArray(top)) return top as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(top as Record<string, unknown>)) {
    out[k] = typeof v === "string" && /^\s*[[{]/.test(v) ? (tryParse(v) ?? v) : v;
  }
  return out as T;
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
