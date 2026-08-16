/**
 * Converts a plain JSON Schema (2020-12) fragment into Gemini's native
 * `responseSchema` format (a restricted OpenAPI-3.0-like subset —
 * ai.google.dev/api/generate-content#Schema), so Gemini's structured-output
 * decoding is actually constrained to the real schema instead of the model
 * only ever seeing a prose description of it.
 *
 * `defs` is the sibling `$defs` map a `$ref` may point into (this codebase's
 * manifest schemas keep shared leaf definitions — `localKey`, `calendarDate`,
 * etc. — outside the fragment passed to `convert`, so refs must be resolved
 * against the full document, not just the fragment itself).
 *
 * Carries `minLength`/`maxLength`/`pattern` (confirmed by direct testing to
 * be accepted by Gemini's schema — dropping the manifest schema's violation
 * count from several dozen to zero on a real end-to-end run). Deliberately
 * DROPS `minItems`/`maxItems`: confirmed by the same direct testing to make
 * Gemini reject the ENTIRE request outright (`400 INVALID_ARGUMENT`) the
 * instant they're present anywhere in the schema, unlike the string-level
 * constraints above. Runtime JSON Schema validation (unchanged, unweakened)
 * is what actually enforces every constraint regardless — this converter
 * only narrows what the model is guided to produce in the first place; it
 * is never a substitute for that validation, which is exactly why an array
 * cardinality miss (e.g. `successMetrics` needing >=2 entries) can still
 * surface as a normal, retryable validation failure.
 *
 * Since `minItems`/`maxItems` can't be set as real constraint fields, the
 * cardinality requirement is instead appended to the array's own
 * `description` (e.g. "Must contain between 2 and 8 items.") — real testing
 * showed the model defaulting to a single item on some fields across
 * repeated attempts when the schema gave no cardinality signal at all; a
 * description is genuinely read by the model during decoding, unlike a
 * rule buried among dozens of others in the system prompt's prose, even
 * though it remains a guide rather than the hard guarantee `minItems`
 * itself would be.
 */

interface JsonSchemaNode {
  readonly $ref?: string;
  readonly description?: string;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly oneOf?: readonly JsonSchemaNode[];
  readonly type?: string;
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchemaNode;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export interface GeminiSchemaNode {
  /** Absent only when `anyOf` is present (Gemini's schema has no `type` at a `oneOf`-derived union node). */
  readonly type?: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly properties?: Readonly<Record<string, GeminiSchemaNode>>;
  readonly required?: readonly string[];
  readonly items?: GeminiSchemaNode;
  readonly anyOf?: readonly GeminiSchemaNode[];
  /** Gemini's `Schema.minLength`/`maxLength` are STRING-encoded integers, per the API's own JSON representation. */
  readonly minLength?: string;
  readonly maxLength?: string;
  readonly pattern?: string;
}

export function toGeminiSchema(
  root: JsonSchemaNode,
  defs: Readonly<Record<string, JsonSchemaNode>>,
): GeminiSchemaNode {
  return convert(root, defs);
}

function describeCardinality(minItems: number | undefined, maxItems: number | undefined): string | undefined {
  if (minItems === undefined && maxItems === undefined) return undefined;
  if (minItems !== undefined && maxItems !== undefined) {
    return `Must contain between ${minItems} and ${maxItems} items.`;
  }
  if (minItems !== undefined) return `Must contain at least ${minItems} items.`;
  return `Must contain at most ${String(maxItems)} items.`;
}

/**
 * Mirrors `describeCardinality` for string length: `minLength` alone (no
 * accompanying `description`) proved insufficient in practice — a real
 * end-to-end run against `agent-03-fact-verification`'s schema showed a
 * `rationale` field with `minLength: 15` and no description text getting
 * violated on most claims, across every retry, while the same constraint
 * paired with explicit description text (as the cardinality fix already
 * demonstrated for arrays) held. `minLength` remains set as a real
 * constraint field too — this is additive reinforcement, not a
 * replacement.
 */
function describeLength(minLength: number | undefined, maxLength: number | undefined): string | undefined {
  if (minLength === undefined) return undefined;
  return maxLength === undefined
    ? `Must be at least ${minLength} characters.`
    : `Must be between ${minLength} and ${maxLength} characters.`;
}

function appendToDescription(existing: { description?: string }, extra: string | undefined): { description?: string } {
  if (extra === undefined) return existing;
  return { description: existing.description !== undefined ? `${existing.description} ${extra}` : extra };
}

function convert(node: JsonSchemaNode, defs: Readonly<Record<string, JsonSchemaNode>>): GeminiSchemaNode {
  if (node.$ref !== undefined) {
    const key = node.$ref.replace('#/$defs/', '');
    const target = defs[key];
    if (target === undefined) {
      throw new Error(`toGeminiSchema: unresolved $ref "${node.$ref}"`);
    }
    return convert(target, defs);
  }

  const description = typeof node.description === 'string' ? { description: node.description } : {};

  if (node.const !== undefined) {
    // Gemini's `enum` is documented/observed to work for STRING values — a
    // numeric or boolean const forced through `{type: 'STRING', enum:
    // [String(value)]}` (the original, buggy version of this branch) told
    // Gemini the field must be the STRING "0.15" rather than the NUMBER
    // 0.15, so a schema-conformant model response failed this codebase's
    // own (correct) runtime validation on type alone. Non-string consts
    // instead get their real type plus an explicit description, mirroring
    // the same reinforcement pattern already proven for length/cardinality.
    if (typeof node.const === 'string') {
      return { ...description, type: 'STRING', enum: [node.const] };
    }
    if (typeof node.const === 'number') {
      return {
        ...appendToDescription(description, `Must be exactly ${node.const}.`),
        type: Number.isInteger(node.const) ? 'INTEGER' : 'NUMBER',
      };
    }
    if (typeof node.const === 'boolean') {
      return { ...appendToDescription(description, `Must be exactly ${String(node.const)}.`), type: 'BOOLEAN' };
    }
    return { ...description, type: 'STRING', enum: [String(node.const)] };
  }
  if (Array.isArray(node.enum)) {
    return { ...description, type: 'STRING', enum: node.enum.map(String) };
  }
  if (Array.isArray(node.oneOf)) {
    return { ...description, anyOf: node.oneOf.map((branch) => convert(branch, defs)) };
  }

  switch (node.type) {
    case 'object': {
      const properties: Record<string, GeminiSchemaNode> = {};
      if (node.properties) {
        for (const [key, value] of Object.entries(node.properties)) {
          properties[key] = convert(value, defs);
        }
      }
      return {
        ...description,
        type: 'OBJECT',
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
        ...(node.required && node.required.length > 0 ? { required: node.required } : {}),
      };
    }
    case 'array': {
      const cardinality = describeCardinality(node.minItems, node.maxItems);
      return {
        ...appendToDescription(description, cardinality),
        type: 'ARRAY',
        ...(node.items ? { items: convert(node.items, defs) } : {}),
      };
    }
    case 'string': {
      const length = describeLength(node.minLength, node.maxLength);
      return {
        ...appendToDescription(description, length),
        type: 'STRING',
        ...(typeof node.minLength === 'number' ? { minLength: String(node.minLength) } : {}),
        ...(typeof node.maxLength === 'number' ? { maxLength: String(node.maxLength) } : {}),
        ...(typeof node.pattern === 'string' ? { pattern: node.pattern } : {}),
      };
    }
    case 'number':
      return { ...description, type: 'NUMBER' };
    case 'integer':
      return { ...description, type: 'INTEGER' };
    case 'boolean':
      return { ...description, type: 'BOOLEAN' };
    default:
      return { ...description, type: 'STRING' };
  }
}
