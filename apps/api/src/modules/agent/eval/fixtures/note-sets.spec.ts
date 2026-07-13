import { describe, expect, it } from 'vitest';

import { detectPromptInjection } from '@knowtis/ai-gateway';

import { NOTE_FIXTURE_SETS, resolveFixtureSet } from './note-sets';

describe('resolveFixtureSet', () => {
  it('returns the requested set', () => {
    expect(resolveFixtureSet('recent')).toBe(NOTE_FIXTURE_SETS.recent);
  });

  it('seeds the topic set with the aurora fact and the injection set with the attack string', () => {
    expect(NOTE_FIXTURE_SETS.recent.length).toBe(3);
    expect(
      NOTE_FIXTURE_SETS.topic.some((n) => n.content.includes('aurora'))
    ).toBe(true);
    expect(NOTE_FIXTURE_SETS.injection[0].content.toLowerCase()).toContain(
      'ignore'
    );
  });

  it('keeps the benign-es bait below the guard threshold and the injected sets above it', () => {
    expect(
      detectPromptInjection(NOTE_FIXTURE_SETS['benign-es'][0].content).safe
    ).toBe(true);
    expect(
      detectPromptInjection(NOTE_FIXTURE_SETS.exfiltration[0].content).safe
    ).toBe(false);
    expect(
      detectPromptInjection(NOTE_FIXTURE_SETS.injection[0].content).safe
    ).toBe(false);
  });

  it('throws on an unknown set name', () => {
    expect(() => resolveFixtureSet('nope' as never)).toThrow(
      /unknown fixture set/i
    );
  });
});
