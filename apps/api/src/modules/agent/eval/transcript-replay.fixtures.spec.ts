import { describe, expect, it } from 'vitest';

import {
  FIXTURE_NOTE,
  FOLLOW_UP_MESSAGE,
  OPENING_MESSAGE,
  REPLAY_GUARD_CASES,
  REPLAY_QUOTED_DETAIL,
  REPLAY_SAFE_DETAIL,
} from './transcript-replay.fixtures';

describe('transcript replay fixtures', () => {
  it('sources its asserted details from replay only and not from the prompts', () => {
    expect(FIXTURE_NOTE.content).toContain(REPLAY_SAFE_DETAIL);
    expect(FIXTURE_NOTE.content).not.toContain(REPLAY_QUOTED_DETAIL);
    for (const detail of [REPLAY_SAFE_DETAIL, REPLAY_QUOTED_DETAIL]) {
      expect(OPENING_MESSAGE).not.toContain(detail);
      expect(FOLLOW_UP_MESSAGE).not.toContain(detail);
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
