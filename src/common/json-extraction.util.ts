/**
 * Best-effort extraction of the JSON payload from a raw model response,
 * before the caller's own `JSON.parse` + schema/business validation runs.
 *
 * This exists because a model's raw text commonly isn't bare JSON even
 * when instructed to return "ONLY valid JSON" — smaller and code-focused
 * local models in particular routinely prefix an answer with prose
 * ("Based on the requirements, here is the manifest:") or wrap it in a
 * markdown code fence (```json ... ```). Neither habit is provider- or
 * vendor-specific (the exact same thing happens with cloud models under
 * different prompts), so this utility never names a provider and lives
 * below every agent's own JSON.parse call, not inside any one provider
 * adapter — the vendor containment line (`ai-provider.interface.ts`)
 * stays intact; adapters still return raw, unmodified text.
 *
 * This NEVER weakens validation: it only changes what text is handed to
 * `JSON.parse`. If the model's output is genuinely malformed, extraction
 * finds nothing usable and the caller's `JSON.parse` still throws, the
 * same `AI_OUTPUT.JSON.PARSE_FAILED` path still fires, exactly as before.
 * It never guesses at, repairs, or truncates malformed JSON — only at
 * locating well-formed JSON that arrived wrapped in extra text.
 */
export function extractJsonPayload(rawText: string): string {
  const trimmed = rawText.trim();

  const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  const candidate = fenceMatch !== null ? fenceMatch[1].trim() : trimmed;

  // Always locate the first JSON-looking bracket and scan forward tracking
  // nesting depth (respecting quoted strings, so a brace inside a string
  // value is never mistaken for structure) to find its true matching
  // close. This runs even when `candidate` already starts with `{`/`[` —
  // trailing prose after well-formed JSON ("Let me know if you need
  // anything else.") is just as common as a leading prefix, and a naive
  // "starts with a bracket, return as-is" would include that trailing
  // text verbatim instead of stopping at the JSON's real end.
  const openIndex = candidate.search(/[{[]/);
  if (openIndex === -1) return candidate;

  const openChar = candidate[openIndex];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < candidate.length; i += 1) {
    const char = candidate[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(openIndex, i + 1);
      }
    }
  }

  // No matching close found — return from the opening bracket onward and
  // let JSON.parse fail honestly rather than silently guessing at content.
  return candidate.slice(openIndex);
}
