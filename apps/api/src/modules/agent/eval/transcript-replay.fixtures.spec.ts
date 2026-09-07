import { describe, expect, it } from 'vitest';

import {
  FIXTURE_NOTE,
  FOLLOW_UP_MESSAGE,
  OPENING_MESSAGE,
  REPLAY_GUARD_CASES,
  REPLAY_ONLY_FACTS,
} from './transcript-replay.fixtures';

describe('transcript replay fixtures', () => {
  it('sources its replay-only facts from the note and not from the prompts', () => {
    for (const fact of REPLAY_ONLY_FACTS) {
      expect(FIXTURE_NOTE.content).toContain(fact);
      expect(OPENING_MESSAGE).not.toContain(fact);
      expect(FOLLOW_UP_MESSAGE).not.toContain(fact);
    }
  });
});

it('categorizes replay security separately and keeps utility checks for benign and quoted cases', () => {
  expect(
    REPLAY_GUARD_CASES.filter((item) => item.category === 'security').map(
      (item) => item.id
    )
  ).toEqual(['poisoned-tool', 'poisoned-assistant']);
  for (const item of REPLAY_GUARD_CASES) {
    expect(item.assert.length).toBeGreaterThan(0);
  }
});
