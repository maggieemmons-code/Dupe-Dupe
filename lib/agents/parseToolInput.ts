/**
 * Claude sometimes hands a nested object or list back as a JSON string inside
 * a tool call (seen Nov 15: the brief's visual_brief arrived as text, and the
 * signature details were lost), sometimes wrapped in extra quotes or with text
 * around it. This turns any such string back into data, so the agents' checks
 * see the real structure. Strings that aren't data are left alone.
 */
export function parseToolInput<T>(input: unknown): T | undefined {
  if (input == null) return undefined;
  const top = asData(input);
  if (!top || typeof top !== "object" || Array.isArray(top)) return top as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(top as Record<string, unknown>)) out[k] = asData(v);
  return out as T;
}

/** A string holding JSON (possibly quoted twice, or with words around it) becomes data; anything else is returned as is. */
function asData(v: unknown): unknown {
  let cur = v;
  for (let i = 0; i < 3 && typeof cur === "string"; i++) {
    const s = cur.trim();
    const parsed = tryParse(s);
    if (parsed !== undefined && parsed !== s) {
      cur = parsed;
      continue;
    }
    // Text around a JSON object: take the outermost braces.
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a && (a > 0 || b < s.length - 1)) {
      const inner = tryParse(s.slice(a, b + 1));
      if (inner !== undefined) {
        cur = inner;
        continue;
      }
    }
    break;
  }
  return cur;
}

function tryParse(s: string): unknown {
  if (!/^\s*["[{]/.test(s)) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    // Seen Nov 15: the text was complete except for its last closing brace.
    const closed = closeBrackets(s);
    if (closed === s) return undefined;
    try {
      return JSON.parse(closed);
    } catch {
      return undefined;
    }
  }
}

/** Adds the closing } and ] that a JSON text is missing at its end (outside strings). */
function closeBrackets(s: string) {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inString) return s;
  return s.trimEnd() + stack.reverse().join("");
}
