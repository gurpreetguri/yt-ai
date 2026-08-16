import manifestOutputSchema from '@agents/agent-00-strategy/output.schema.json';
import topicSetOutputSchema from '@agents/agent-01-topic-discovery/output.schema.json';
import researchPackageOutputSchema from '@agents/agent-02-research/output.schema.json';
import verificationPackageOutputSchema from '@agents/agent-03-fact-verification/output.schema.json';
import storyArchitectureOutputSchema from '@agents/agent-04-story-architect/output.schema.json';
import narrationScriptOutputSchema from '@agents/agent-05-script-writer/output.schema.json';
import reviewReportOutputSchema from '@agents/agent-06-script-reviewer/output.schema.json';
import scenePlanOutputSchema from '@agents/agent-07-scene-planner/output.schema.json';

import { toGeminiSchema } from './gemini-schema.util';

describe('toGeminiSchema', () => {
  it('converts a simple object schema with properties, required, and enum', () => {
    const result = toGeminiSchema(
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { enum: ['A', 'B'] },
        },
        required: ['name'],
      },
      {},
    );

    expect(result).toEqual({
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        status: { type: 'STRING', enum: ['A', 'B'] },
      },
      required: ['name'],
    });
  });

  it('converts a string const to type STRING with enum (the common case, e.g. discriminator values)', () => {
    const result = toGeminiSchema({ const: 'INITIAL' }, {});
    expect(result).toEqual({ type: 'STRING', enum: ['INITIAL'] });
  });

  it('converts a NUMBER const to its real numeric type with an explicit description, never a stringified enum', () => {
    const result = toGeminiSchema({ const: 0.15 }, {});
    expect(result).toEqual({ type: 'NUMBER', description: 'Must be exactly 0.15.' });
    expect(result.enum).toBeUndefined();
  });

  it('converts an INTEGER const to type INTEGER', () => {
    const result = toGeminiSchema({ const: 3 }, {});
    expect(result).toEqual({ type: 'INTEGER', description: 'Must be exactly 3.' });
  });

  it('converts a BOOLEAN const to type BOOLEAN with an explicit description', () => {
    const result = toGeminiSchema({ const: true }, {});
    expect(result).toEqual({ type: 'BOOLEAN', description: 'Must be exactly true.' });
  });

  it('resolves a $ref against the supplied defs map', () => {
    const result = toGeminiSchema(
      { type: 'object', properties: { key: { $ref: '#/$defs/localKey' } }, required: ['key'] },
      { localKey: { type: 'string' } },
    );

    expect(result).toEqual({
      type: 'OBJECT',
      properties: { key: { type: 'STRING' } },
      required: ['key'],
    });
  });

  it('converts oneOf into anyOf, resolving each branch', () => {
    const result = toGeminiSchema(
      {
        oneOf: [
          { $ref: '#/$defs/a' },
          { $ref: '#/$defs/b' },
        ],
      },
      {
        a: { type: 'object', required: ['cycle'], properties: { cycle: { const: 'INITIAL' } } },
        b: { type: 'object', required: ['cycle'], properties: { cycle: { const: 'REVISION' } } },
      },
    );

    expect(result).toEqual({
      anyOf: [
        { type: 'OBJECT', required: ['cycle'], properties: { cycle: { type: 'STRING', enum: ['INITIAL'] } } },
        { type: 'OBJECT', required: ['cycle'], properties: { cycle: { type: 'STRING', enum: ['REVISION'] } } },
      ],
    });
  });

  it('converts an array with items', () => {
    const result = toGeminiSchema({ type: 'array', items: { type: 'string' } }, {});
    expect(result).toEqual({ type: 'ARRAY', items: { type: 'STRING' } });
  });

  it('carries minLength/maxLength/pattern on string nodes, string-encoding the numeric bounds, and reinforces minLength in the description', () => {
    const result = toGeminiSchema({ type: 'string', minLength: 15, maxLength: 120, pattern: '^[A-Z]+$' }, {});
    expect(result).toEqual({
      type: 'STRING',
      minLength: '15',
      maxLength: '120',
      pattern: '^[A-Z]+$',
      description: 'Must be between 15 and 120 characters.',
    });
  });

  it('omits minLength/maxLength/pattern/description when the source schema does not declare them', () => {
    const result = toGeminiSchema({ type: 'string' }, {});
    expect(result).toEqual({ type: 'STRING' });
  });

  it('reinforces a minLength-only string with an "at least" description, combined with any existing description', () => {
    const result = toGeminiSchema(
      { type: 'string', description: 'Why this claim is supported.', minLength: 15 },
      {},
    );
    expect(result).toEqual({
      type: 'STRING',
      minLength: '15',
      description: 'Why this claim is supported. Must be at least 15 characters.',
    });
  });

  it('does NOT set minItems/maxItems as real Gemini schema fields (confirmed to make Gemini reject the whole request)', () => {
    const result = toGeminiSchema({ type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 }, {});
    expect(result).not.toHaveProperty('minItems');
    expect(result).not.toHaveProperty('maxItems');
  });

  it('appends a cardinality sentence to an array\'s description instead, when both minItems and maxItems are present', () => {
    const result = toGeminiSchema({ type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 }, {});
    expect(result).toEqual({
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Must contain between 2 and 8 items.',
    });
  });

  it('appends an at-least sentence when only minItems is present', () => {
    const result = toGeminiSchema({ type: 'array', items: { type: 'string' }, minItems: 1 }, {});
    expect(result.description).toBe('Must contain at least 1 items.');
  });

  it('combines the cardinality sentence with an existing description rather than overwriting it', () => {
    const result = toGeminiSchema(
      { type: 'array', description: 'Success metrics for this strategy.', items: { type: 'string' }, minItems: 2 },
      {},
    );
    expect(result.description).toBe('Success metrics for this strategy. Must contain at least 2 items.');
  });

  it('does not add a description when neither minItems nor maxItems is present', () => {
    const result = toGeminiSchema({ type: 'array', items: { type: 'string' } }, {});
    expect(result.description).toBeUndefined();
  });

  it('throws on an unresolvable $ref, so callers can catch and fall back rather than silently produce a broken schema', () => {
    expect(() => toGeminiSchema({ $ref: '#/$defs/missing' }, {})).toThrow(/unresolved \$ref/);
  });

  describe('every agent\'s real output schema converts end-to-end without throwing', () => {
    const cases: ReadonlyArray<{ agent: string; schema: unknown; rootKey: string }> = [
      { agent: 'agent-00-strategy', schema: manifestOutputSchema, rootKey: 'strategyManifest' },
      { agent: 'agent-01-topic-discovery', schema: topicSetOutputSchema, rootKey: 'topicOpportunitySet' },
      { agent: 'agent-02-research', schema: researchPackageOutputSchema, rootKey: 'researchPackage' },
      { agent: 'agent-03-fact-verification', schema: verificationPackageOutputSchema, rootKey: 'verificationPackage' },
      { agent: 'agent-04-story-architect', schema: storyArchitectureOutputSchema, rootKey: 'storyArchitecture' },
      { agent: 'agent-05-script-writer', schema: narrationScriptOutputSchema, rootKey: 'narrationScript' },
      { agent: 'agent-06-script-reviewer', schema: reviewReportOutputSchema, rootKey: 'reviewReport' },
      { agent: 'agent-07-scene-planner', schema: scenePlanOutputSchema, rootKey: 'scenePlan' },
    ];

    it.each(cases)('$agent', ({ schema, rootKey }) => {
      const { $defs } = schema as { $defs: Record<string, unknown> };
      const root = $defs[rootKey];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising the real production schema documents, not hand-built fixtures.
      expect(() => toGeminiSchema(root as any, $defs as any)).not.toThrow();
    });
  });

  describe('no agent\'s converted Gemini schema ever gives a non-string const an `enum` (the original bug: a numeric/boolean const forced through {type: STRING, enum: [stringified value]}, so a schema-conformant model response failed this codebase\'s own runtime validation on type alone)', () => {
    const cases: ReadonlyArray<{ agent: string; schema: unknown; rootKey: string }> = [
      { agent: 'agent-00-strategy', schema: manifestOutputSchema, rootKey: 'strategyManifest' },
      { agent: 'agent-01-topic-discovery', schema: topicSetOutputSchema, rootKey: 'topicOpportunitySet' },
      { agent: 'agent-02-research', schema: researchPackageOutputSchema, rootKey: 'researchPackage' },
      { agent: 'agent-03-fact-verification', schema: verificationPackageOutputSchema, rootKey: 'verificationPackage' },
      { agent: 'agent-04-story-architect', schema: storyArchitectureOutputSchema, rootKey: 'storyArchitecture' },
      { agent: 'agent-05-script-writer', schema: narrationScriptOutputSchema, rootKey: 'narrationScript' },
      { agent: 'agent-06-script-reviewer', schema: reviewReportOutputSchema, rootKey: 'reviewReport' },
      { agent: 'agent-07-scene-planner', schema: scenePlanOutputSchema, rootKey: 'scenePlan' },
    ];

    it.each(cases)('$agent', ({ schema, rootKey }) => {
      const { $defs } = schema as { $defs: Record<string, unknown> };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising the real production schema documents, not hand-built fixtures.
      const converted = toGeminiSchema($defs[rootKey] as any, $defs as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking the converter's own output shape.
      function walk(node: any): void {
        if (node === null || typeof node !== 'object') return;
        if (Array.isArray(node.enum)) {
          expect(node.type).toBe('STRING');
          expect(node.enum.every((value: unknown) => typeof value === 'string')).toBe(true);
        }
        if (Array.isArray(node.anyOf)) node.anyOf.forEach(walk);
        if (node.items) walk(node.items);
        if (node.properties) Object.values(node.properties).forEach(walk);
      }
      walk(converted);
    });
  });
});
