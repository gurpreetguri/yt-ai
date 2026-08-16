import { appendRepairGuidance, buildRepairGuidance } from './repair-guidance.util';

describe('buildRepairGuidance', () => {
  it('returns undefined for an empty or absent issue list', () => {
    expect(buildRepairGuidance(undefined)).toBeUndefined();
    expect(buildRepairGuidance([])).toBeUndefined();
  });

  it('formats a single issue with its path', () => {
    const result = buildRepairGuidance([
      { message: 'must NOT have fewer than 2 items', details: [{ path: '$.successMetrics' }] },
    ]);
    expect(result).toBe('- $.successMetrics: must NOT have fewer than 2 items');
  });

  it('formats an issue with no path/details as a bare message line', () => {
    const result = buildRepairGuidance([{ message: 'Something went wrong.' }]);
    expect(result).toBe('- Something went wrong.');
  });

  it('joins multiple issues with newlines, one per line', () => {
    const result = buildRepairGuidance([
      { message: 'first problem', details: [{ path: '$.a' }] },
      { message: 'second problem', details: [{ path: '$.b' }] },
    ]);
    expect(result).toBe('- $.a: first problem\n- $.b: second problem');
  });
});

describe('appendRepairGuidance', () => {
  it('returns the system prompt unchanged when guidance is undefined', () => {
    expect(appendRepairGuidance('base prompt', undefined)).toBe('base prompt');
  });

  it('returns the system prompt unchanged when guidance is blank', () => {
    expect(appendRepairGuidance('base prompt', '   ')).toBe('base prompt');
  });

  it('appends a clearly delimited repair section when guidance is present', () => {
    const result = appendRepairGuidance('base prompt', '- $.x: bad');
    expect(result).toContain('base prompt');
    expect(result).toContain('## RUNTIME REPAIR GUIDANCE');
    expect(result).toContain('- $.x: bad');
    expect(result.indexOf('base prompt')).toBeLessThan(result.indexOf('RUNTIME REPAIR GUIDANCE'));
  });
});
