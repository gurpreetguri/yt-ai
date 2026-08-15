import { randomBytes } from 'node:crypto';

/**
 * Generates an opaque, type-prefixed platform identifier matching
 * `agents/agent-00-strategy/interfaces.ts` `PrefixedId`:
 * `^[a-z]{3}_[0-9A-HJKMNP-TV-Z]{26}$` (Crockford base32 alphabet — no
 * `I`, `L`, `O`, `U`, to avoid visual ambiguity and accidental profanity).
 *
 * The identifier is never parsed for meaning by any consumer (STD-000 §5.8);
 * this generator only needs to produce a value the pattern accepts.
 */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generatePrefixedId(prefix: string): string {
  const bytes = randomBytes(26);
  let suffix = '';
  for (let i = 0; i < 26; i += 1) {
    const charIndex = bytes.readUInt8(i) % CROCKFORD_ALPHABET.length;
    suffix += CROCKFORD_ALPHABET.charAt(charIndex);
  }
  return `${prefix}_${suffix}`;
}
