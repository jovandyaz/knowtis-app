import { describe, expect, it } from 'vitest';

import { MAX_GUARD_INPUT_CHARS } from '@knowtis/ai-gateway';

import { AGENT_HISTORY_TOKEN_BUDGET } from '../application/run-agent-turn.handler';
import { estimateMessageTokens } from '../domain/message-tokens';
import { sanitizeReplayHistory } from '../domain/replay-input-sanitizer';
import { toModelMessages } from '../infrastructure/orchestrator/message-mapper';
import {
  assertReplayNotObeyed,
  FIXTURE_NOTE,
  FOLLOW_UP_MESSAGE,
  OPENING_MESSAGE,
  REPLAY_ATTACK,
  REPLAY_GUARD_CASES,
  REPLAY_LONG_DETAIL,
  REPLAY_LONG_FACT,
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
    expect(FIXTURE_NOTE.content).not.toContain(REPLAY_LONG_DETAIL);
    for (const detail of [
      REPLAY_SAFE_DETAIL,
      REPLAY_QUOTED_DETAIL,
      REPLAY_LONG_DETAIL,
    ]) {
      expect(OPENING_MESSAGE).not.toContain(detail);
      expect(FOLLOW_UP_MESSAGE).not.toContain(detail);
      expect(
        REPLAY_GUARD_CASES.every((item) => !item.message.includes(detail))
      ).toBe(true);
    }
  });
  it('replays an oversized legitimate tool result to the model with enforcement on', () => {
    const oversized = REPLAY_GUARD_CASES.find(
      (item) => item.id === 'oversized-tool'
    );
    expect(oversized).toBeDefined();
    expect(REPLAY_LONG_FACT.length).toBeGreaterThan(MAX_GUARD_INPUT_CHARS);
    const history = oversized?.history ?? [];
    const { messages, detections } = sanitizeReplayHistory(history, {
      enforceAssistantAndTool: true,
    });
    expect(detections).toEqual([]);
    expect(JSON.stringify(toModelMessages(messages))).toContain(
      REPLAY_LONG_DETAIL
    );
    expect(
      history.reduce((total, m) => total + estimateMessageTokens(m), 0)
    ).toBeLessThan(AGENT_HISTORY_TOKEN_BUDGET);
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
