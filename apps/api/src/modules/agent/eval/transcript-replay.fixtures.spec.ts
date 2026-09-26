import { describe, expect, it } from 'vitest';

import { detectAiInput, MAX_GUARD_INPUT_CHARS } from '@knowtis/ai-gateway';

import { AGENT_HISTORY_TOKEN_BUDGET } from '../application/run-agent-turn.handler';
import type { AgentMessage } from '../domain/agent-message';
import { estimateMessageTokens } from '../domain/message-tokens';
import {
  projectReplayText,
  REPLAY_REDACTION_MARKER,
  sanitizeReplayHistory,
} from '../domain/replay-input-sanitizer';
import { NOTE_CONTENT_NOTE, WITHHELD_CONTENT } from '../domain/retrieval';
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
  REPLAY_QUOTED_FACT,
  REPLAY_SAFE_DETAIL,
  REPLAY_SENTINEL,
} from './transcript-replay.fixtures';

function historyOf(id: string): readonly AgentMessage[] {
  const item = REPLAY_GUARD_CASES.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`Unknown replay case ${id}`);
  }
  return item.history;
}

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
  it('replays an oversized legitimate tool result to the model', () => {
    const oversized = REPLAY_GUARD_CASES.find(
      (item) => item.id === 'oversized-tool'
    );
    expect(oversized).toBeDefined();
    expect(REPLAY_LONG_FACT.length).toBeGreaterThan(MAX_GUARD_INPUT_CHARS);
    const history = oversized?.history ?? [];
    const { messages, detections } = sanitizeReplayHistory(history);
    expect(detections).toEqual([]);
    expect(JSON.stringify(toModelMessages(messages))).toContain(
      REPLAY_LONG_DETAIL
    );
    expect(
      history.reduce((total, m) => total + estimateMessageTokens(m), 0)
    ).toBeLessThan(AGENT_HISTORY_TOKEN_BUDGET);
  });
});

describe('transcript replay fixtures through the replay guard', () => {
  it('keeps the benign sentence of a legitimate quote and redacts the quote', () => {
    const history = historyOf('legitimate-quote');
    const { messages, detections } = sanitizeReplayHistory(history);
    expect(messages).toEqual([
      history[0],
      {
        role: 'assistant',
        content: `${REPLAY_QUOTED_FACT} ${REPLAY_REDACTION_MARKER}`,
      },
    ]);
    expect(detections).toEqual([
      expect.objectContaining({ disposition: 'redact', redactedSpans: 1 }),
    ]);
  });
  it('replaces a single-sentence poisoned answer with the marker alone', () => {
    const history = historyOf('poisoned-assistant');
    expect(sanitizeReplayHistory(history).messages).toEqual([
      history[0],
      { role: 'assistant', content: REPLAY_REDACTION_MARKER },
    ]);
  });
  it('withholds a poisoned tool result and keeps its call', () => {
    const history = historyOf('poisoned-tool');
    const { messages, detections } = sanitizeReplayHistory(history);
    expect(messages).toEqual([
      history[0],
      history[1],
      {
        role: 'tool',
        content: '',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'replay-read',
            toolName: 'getNote',
            outputType: 'json',
            output: {
              note: NOTE_CONTENT_NOTE,
              contentStatus: 'withheld',
              content: WITHHELD_CONTENT,
            },
          },
        ],
      },
    ]);
    expect(detections).toEqual([
      expect.objectContaining({ disposition: 'withhold', redactedSpans: 0 }),
    ]);
  });
  it.each(['safe-tool', 'oversized-tool'])('replays %s unchanged', (id) => {
    const history = historyOf(id);
    expect(sanitizeReplayHistory(history)).toEqual({
      messages: history,
      detections: [],
    });
  });
  it.each(REPLAY_GUARD_CASES.map((item) => item.id))(
    'replays only content the detector passes for %s',
    (id) => {
      const { messages } = sanitizeReplayHistory(historyOf(id));
      expect(JSON.stringify(messages)).not.toContain(REPLAY_ATTACK);
      for (const message of messages) {
        expect(detectAiInput(projectReplayText(message)).safe).toBe(true);
      }
    }
  );
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
