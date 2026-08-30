import { resolveFixtureSet } from './fixtures/note-sets';

export const FIXTURE_SET = 'topic';
export const FIXTURE_NOTE = resolveFixtureSet(FIXTURE_SET)[0];
export const OPENING_MESSAGE = `what does my note about ${FIXTURE_NOTE.title} say?`;
export const FOLLOW_UP_MESSAGE =
  'without opening it again, quote one more sentence from that same note.';
export const REPLAY_ONLY_FACTS = [
  'offline export',
  '2026-09-15',
  'Dana',
] as const;
