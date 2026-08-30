import type {
  AssistantModelMessage,
  ToolModelMessage,
  ToolResultPart,
} from 'ai';
import { describe, expect, it } from 'vitest';

import type {
  AgentMessage,
  AgentToolResultPart,
} from '../../domain/agent-message';
import {
  fromResponseMessages,
  toModelMessages,
  type ResponseMessage,
} from './message-mapper';

const assistantWithCall: AssistantModelMessage = {
  role: 'assistant',
  content: [
    { type: 'text', text: 'Looking it up. ' },
    { type: 'reasoning', text: 'internal' },
    {
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'searchNotes',
      input: { query: 'gtd' },
    },
  ],
};

const toolOutputCases: ReadonlyArray<{
  readonly name: string;
  readonly output: ToolResultPart['output'];
  readonly expected: Pick<AgentToolResultPart, 'output' | 'isError'>;
}> = [
  {
    name: 'text',
    output: { type: 'text', value: 'plain' },
    expected: { output: 'plain', isError: false },
  },
  {
    name: 'json',
    output: { type: 'json', value: { hits: [] } },
    expected: { output: { hits: [] }, isError: false },
  },
  {
    name: 'content',
    output: { type: 'content', value: [{ type: 'text', text: 'x' }] },
    expected: { output: [{ type: 'text', text: 'x' }], isError: false },
  },
  {
    name: 'error-text',
    output: { type: 'error-text', value: 'boom' },
    expected: { output: 'boom', isError: true },
  },
  {
    name: 'error-json',
    output: { type: 'error-json', value: { code: 'E' } },
    expected: { output: { code: 'E' }, isError: true },
  },
  {
    name: 'execution-denied with a reason',
    output: { type: 'execution-denied', reason: 'nope' },
    expected: { output: 'nope', isError: true },
  },
  {
    name: 'execution-denied without a reason',
    output: { type: 'execution-denied' },
    expected: { output: 'execution denied', isError: true },
  },
];

describe('fromResponseMessages', () => {
  it('maps assistant text and tool calls, dropping reasoning', () => {
    expect(fromResponseMessages([assistantWithCall])).toEqual([
      {
        role: 'assistant',
        content: 'Looking it up. ',
        parts: [
          { type: 'text', text: 'Looking it up. ' },
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'searchNotes',
            input: { query: 'gtd' },
          },
        ],
      },
    ]);
  });

  it('maps a plain-string assistant message without parts', () => {
    expect(
      fromResponseMessages([{ role: 'assistant', content: 'Done.' }])
    ).toEqual([{ role: 'assistant', content: 'Done.' }]);
  });

  it.each(toolOutputCases)(
    'maps tool result output $name',
    ({ output, expected }) => {
      const message: ToolModelMessage = {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'searchNotes',
            output,
          },
        ],
      };
      expect(fromResponseMessages([message])).toEqual([
        {
          role: 'tool',
          content: '',
          parts: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              toolName: 'searchNotes',
              ...expected,
            },
          ],
        },
      ]);
    }
  );
  it('omits a tool message that carries only approval responses', () => {
    const message: ToolModelMessage = {
      role: 'tool',
      content: [
        { type: 'tool-approval-response', approvalId: 'a1', approved: true },
      ],
    };
    expect(fromResponseMessages([message])).toEqual([]);
  });

  it('omits an assistant message left with no text and no tool calls', () => {
    const message: AssistantModelMessage = {
      role: 'assistant',
      content: [{ type: 'reasoning', text: 'internal' }],
    };
    expect(fromResponseMessages([message])).toEqual([]);
  });

  it('keeps the mappable messages of a step that also has empty ones', () => {
    const empty: AssistantModelMessage = {
      role: 'assistant',
      content: [{ type: 'reasoning', text: 'internal' }],
    };
    expect(fromResponseMessages([empty, assistantWithCall])).toHaveLength(1);
  });
});

describe('toModelMessages', () => {
  const history: AgentMessage[] = [
    { role: 'user', content: 'hi' },
    {
      role: 'assistant',
      content: 'Looking. ',
      parts: [
        { type: 'text', text: 'Looking. ' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'searchNotes',
          input: { query: 'gtd' },
        },
      ],
    },
    {
      role: 'tool',
      content: '',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'searchNotes',
          output: { hits: [] },
          isError: false,
        },
        {
          type: 'tool-result',
          toolCallId: 'c2',
          toolName: 'webFetch',
          output: 'timeout',
          isError: true,
        },
      ],
    },
    { role: 'assistant', content: 'Nothing found.' },
  ];

  it('rebuilds SDK messages with typed tool outputs', () => {
    expect(toModelMessages(history)).toEqual([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Looking. ' },
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'searchNotes',
            input: { query: 'gtd' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'searchNotes',
            output: { type: 'json', value: { hits: [] } },
          },
          {
            type: 'tool-result',
            toolCallId: 'c2',
            toolName: 'webFetch',
            output: { type: 'error-text', value: 'timeout' },
          },
        ],
      },
      { role: 'assistant', content: 'Nothing found.' },
    ]);
  });

  it('serialises a non-string error output as error-text', () => {
    const message: AgentMessage = {
      role: 'tool',
      content: '',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'searchNotes',
          output: { code: 'E' },
          isError: true,
        },
      ],
    };
    expect(toModelMessages([message])).toEqual([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'searchNotes',
            output: { type: 'error-text', value: '{"code":"E"}' },
          },
        ],
      },
    ]);
  });

  it('skips a tool message that holds no tool results', () => {
    expect(toModelMessages([{ role: 'tool', content: '' }])).toEqual([]);
  });

  it('keeps the assistant text when parts is empty', () => {
    expect(
      toModelMessages([{ role: 'assistant', content: 'Done.', parts: [] }])
    ).toEqual([{ role: 'assistant', content: 'Done.' }]);
  });

  it('round-trips through fromResponseMessages for the assistant/tool pair', () => {
    const sdk = toModelMessages(history.slice(1, 3)) as ResponseMessage[];
    expect(fromResponseMessages(sdk)).toEqual(history.slice(1, 3));
  });
});
