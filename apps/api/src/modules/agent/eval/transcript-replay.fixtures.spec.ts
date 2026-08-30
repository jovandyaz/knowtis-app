import { describe, expect, it } from 'vitest';

import {
  FIXTURE_NOTE,
  FOLLOW_UP_MESSAGE,
  OPENING_MESSAGE,
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
