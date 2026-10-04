import { describe, expect, it } from 'vitest';

import type { IndexedReasoning } from '@knowtis/ai-gateway';

import { createSnapshotIndex } from '../../testing/snapshot-index';
import { toModelReasoning } from './index-reasoning';

const SNAPSHOT = createSnapshotIndex().catalog();
const FULL_LADDER = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

function snapshotReasoning(modelId: string): IndexedReasoning | null {
  const row = SNAPSHOT.get(modelId);
  if (row === undefined) {
    throw new Error(`${modelId} is not in the model index snapshot`);
  }
  return row.reasoning;
}

describe('toModelReasoning', () => {
  it('reads a listed none as optional reasoning, whatever the source marks mandatory', () => {
    expect(snapshotReasoning('openai:gpt-6-luna')).toEqual({
      levels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      mandatory: true,
    });
    expect(toModelReasoning(snapshotReasoning('openai:gpt-6-luna'))).toEqual({
      levels: FULL_LADDER,
      mandatory: false,
    });
  });

  it('orders a highest-first ladder canonically', () => {
    expect(snapshotReasoning('openrouter:openai/gpt-6-luna')?.levels).toEqual([
      'max',
      'xhigh',
      'high',
      'medium',
      'low',
    ]);
    expect(
      toModelReasoning(snapshotReasoning('openrouter:openai/gpt-6-luna'))
    ).toEqual({ levels: FULL_LADDER, mandatory: false });
  });

  it('drops levels outside the effort control and keeps a ladder with no none mandatory', () => {
    expect(snapshotReasoning('google:gemini-3.5-flash-lite')?.levels[0]).toBe(
      'minimal'
    );
    expect(
      toModelReasoning(snapshotReasoning('google:gemini-3.5-flash-lite'))
    ).toEqual({ levels: ['low', 'medium', 'high'], mandatory: true });
  });

  it('gives no ladder to a model that lists no level', () => {
    expect(snapshotReasoning('anthropic:claude-haiku-4-5')?.levels).toEqual([]);
    expect(
      toModelReasoning(snapshotReasoning('anthropic:claude-haiku-4-5'))
    ).toBeUndefined();
  });

  it('gives no ladder to a model with no reasoning', () => {
    expect(toModelReasoning(null)).toBeUndefined();
  });

  it('gives no ladder when only levels outside the effort control are listed', () => {
    expect(
      toModelReasoning({ levels: ['none', 'minimal'], mandatory: false })
    ).toBeUndefined();
  });

  it('keeps a partial ladder to exactly the levels the route lists', () => {
    expect(
      toModelReasoning(snapshotReasoning('openrouter:z-ai/glm-5.2'))
    ).toEqual({ levels: ['high', 'xhigh'], mandatory: false });
  });
});
