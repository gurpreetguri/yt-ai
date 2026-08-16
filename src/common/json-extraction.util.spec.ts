import { extractJsonPayload } from './json-extraction.util';

describe('extractJsonPayload', () => {
  it('returns bare JSON unchanged', () => {
    expect(extractJsonPayload('{"a":1}')).toBe('{"a":1}');
  });

  it('trims surrounding whitespace/newlines around bare JSON', () => {
    expect(extractJsonPayload('\n  {"a":1}  \n')).toBe('{"a":1}');
  });

  it('strips a ```json fenced code block', () => {
    expect(extractJsonPayload('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a bare ``` fenced code block (no language tag)', () => {
    expect(extractJsonPayload('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('extracts JSON prefixed by conversational prose', () => {
    expect(extractJsonPayload('Based on the requirements, here is the manifest:\n{"a":1}')).toBe('{"a":1}');
  });

  it('a stray brace in prose BEFORE the real JSON is a known, accepted limitation — the heuristic locates the FIRST bracket, so it can grab the wrong one and fail parsing', () => {
    const raw = 'Here is the result (see {details} below):\n{"a":1,"b":{"c":2}}';
    // Pins the actual, documented, honest behavior rather than silently
    // assuming perfection: extraction still fails cleanly (JSON.parse
    // throws exactly as it would have without this utility), it never
    // returns something that looks successful but is actually wrong data.
    expect(() => JSON.parse(extractJsonPayload(raw))).toThrow();
  });

  it('correctly matches nested braces, never grabbing a trailing brace from unrelated trailing prose', () => {
    const raw = '{"a":{"b":{"c":1}}}\n\nLet me know if you need anything else (like {this}).';
    expect(extractJsonPayload(raw)).toBe('{"a":{"b":{"c":1}}}');
  });

  it('does not mistake a brace inside a quoted string value for structure', () => {
    const raw = 'Sure, here you go:\n{"note":"use {curly} braces carefully","n":1}';
    expect(extractJsonPayload(raw)).toBe('{"note":"use {curly} braces carefully","n":1}');
  });

  it('handles escaped quotes inside string values without losing track of string state', () => {
    const raw = '{"quote":"she said \\"hi\\""}';
    expect(extractJsonPayload(raw)).toBe(raw);
    expect(() => JSON.parse(extractJsonPayload(raw))).not.toThrow();
  });

  it('extracts a top-level JSON array', () => {
    expect(extractJsonPayload('Here:\n[1,2,3]')).toBe('[1,2,3]');
  });

  it('returns the original text unchanged when no JSON-like content exists (JSON.parse still fails honestly downstream)', () => {
    expect(extractJsonPayload('I cannot help with that.')).toBe('I cannot help with that.');
  });

  it('never silently repairs genuinely malformed JSON — the caller still sees a parse failure', () => {
    const raw = 'Here is the result:\n{"a":1,';
    expect(() => JSON.parse(extractJsonPayload(raw))).toThrow();
  });
});
