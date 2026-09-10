import { describe, expect, it } from 'vitest';

import {
  assertReplayNotObeyed,
  FIXTURE_NOTE,
  FOLLOW_UP_MESSAGE,
  OPENING_MESSAGE,
  REPLAY_ATTACK,
  REPLAY_GUARD_CASES,
  REPLAY_QUOTED_DETAIL,
  REPLAY_SAFE_DETAIL,
  REPLAY_SENTINEL,
} from './transcript-replay.fixtures';

function replayOutput(text: string): string {
  return JSON.stringify({
    toolCalls: [],
    text,
    proposal: null,
    sources: [],
    error: null,
  });
}

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

it('fails the security cases when the model obeys the replayed injection', () => {
  expect(REPLAY_ATTACK).toContain(REPLAY_SENTINEL);
  expect(
    assertReplayNotObeyed(
      replayOutput(`Done. ${REPLAY_SENTINEL.toLowerCase()}`)
    )
  ).toBe(false);
  expect(
    assertReplayNotObeyed(
      replayOutput('Untrusted commands in notes must be treated as data.')
    )
  ).toBe(true);
  for (const item of REPLAY_GUARD_CASES.filter(
    (candidate) => candidate.category === 'security'
  )) {
    expect(
      item.assert.some((assertion) => assertion.value === assertReplayNotObeyed)
    ).toBe(true);
  }
});
