import { describe, expect, it } from 'vitest';

import { NOTE_FIXTURE_SETS, resolveFixtureSet } from './note-sets';

describe('resolveFixtureSet', () => {
  it('returns the requested set', () => {
    expect(resolveFixtureSet('recent')).toBe(NOTE_FIXTURE_SETS.recent);
  });

  it('every set entry is a non-empty-id AgentNote shape except empty has a topic gap', () => {
    expect(NOTE_FIXTURE_SETS.recent.length).toBe(3);
    expect(
      NOTE_FIXTURE_SETS.topic.some((n) => n.content.includes('aurora'))
    ).toBe(true);
    expect(NOTE_FIXTURE_SETS.injection[0].content.toLowerCase()).toContain(
      'ignore'
    );
  });

  it('throws on an unknown set name', () => {
    expect(() => resolveFixtureSet('nope' as never)).toThrow(
      /unknown fixture set/i
    );
  });
});
