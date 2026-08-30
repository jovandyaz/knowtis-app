import { describe, expect, it } from 'vitest';

import type { AgentSource } from './agent-event';
import type { AgentMessage } from './agent-message';
import { buildTurnRows, type TurnRowsInput } from './turn-transcript';

const USER_CONTENT = 'what is in N1?';
const SOURCES: readonly AgentSource[] = [{ id: 'n1', title: 'N1' }];

const call = {
  type: 'tool-call' as const,
  toolCallId: 'c1',
  toolName: 'getNote',
  input: { id: 'n1' },
};
const result = {
  type: 'tool-result' as const,
  toolCallId: 'c1',
  toolName: 'getNote',
  output: 'body',
  isError: false,
};
const toolStep: readonly AgentMessage[] = [
  { role: 'assistant', content: '', parts: [call] },
  { role: 'tool', content: '', parts: [result] },
];

const input = (over: Partial<TurnRowsInput>): TurnRowsInput => ({
  userContent: USER_CONTENT,
  turnMessages: [],
  assistantText: '',
  sources: SOURCES,
  stopReason: 'completed',
  ...over,
});

describe('buildTurnRows', () => {
  it('persists the user row and the streamed answer when no step ran', () => {
    const rows = buildTurnRows(input({ assistantText: 'N1 says hi' }));

    expect(rows).toEqual([
      { role: 'user', content: USER_CONTENT },
      {
        role: 'assistant',
        content: 'N1 says hi',
        sources: SOURCES,
        stopReason: 'completed',
      },
    ]);
  });

  it('persists only the user row when the turn produced no text', () => {
    const rows = buildTurnRows(input({}));

    expect(rows).toEqual([{ role: 'user', content: USER_CONTENT }]);
  });

  it('stamps the stop reason on the last step row when the step carried all the text', () => {
    const rows = buildTurnRows(
      input({
        turnMessages: [
          ...toolStep,
          { role: 'assistant', content: 'N1 says hi' },
        ],
        assistantText: 'N1 says hi',
      })
    );

    expect(rows).toEqual([
      { role: 'user', content: USER_CONTENT },
      { role: 'assistant', content: '', parts: [call] },
      { role: 'tool', content: '', parts: [result] },
      {
        role: 'assistant',
        content: 'N1 says hi',
        sources: SOURCES,
        stopReason: 'completed',
      },
    ]);
  });

  it('persists the text streamed after the last step as its own terminal row', () => {
    const rows = buildTurnRows(
      input({
        turnMessages: [...toolStep, { role: 'assistant', content: 'N1 ' }],
        assistantText: 'N1 says hi',
      })
    );

    expect(rows).toEqual([
      { role: 'user', content: USER_CONTENT },
      { role: 'assistant', content: '', parts: [call] },
      { role: 'tool', content: '', parts: [result] },
      { role: 'assistant', content: 'N1 ' },
      {
        role: 'assistant',
        content: 'says hi',
        sources: SOURCES,
        stopReason: 'completed',
      },
    ]);
  });

  it('adds no row when the streamed text diverges from the step rows', () => {
    const rows = buildTurnRows(
      input({
        turnMessages: [{ role: 'assistant', content: 'Hola' }],
        assistantText: 'ErrorHola',
      })
    );

    expect(rows).toEqual([
      { role: 'user', content: USER_CONTENT },
      {
        role: 'assistant',
        content: 'Hola',
        sources: SOURCES,
        stopReason: 'completed',
      },
    ]);
  });

  it('adds no row and stamps nothing when the turn ends on a tool row', () => {
    const rows = buildTurnRows(
      input({ turnMessages: toolStep, stopReason: 'max_steps' })
    );

    expect(rows).toEqual([
      { role: 'user', content: USER_CONTENT },
      { role: 'assistant', content: '', parts: [call] },
      { role: 'tool', content: '', parts: [result] },
    ]);
  });
});
