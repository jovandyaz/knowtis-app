import { describe, expect, it } from 'vitest';

import { MODEL_INDEX_SNAPSHOT } from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  GLOBAL_REASONING_EFFORTS,
  MODEL_INTENTS,
  REASONING_EFFORTS,
} from '@knowtis/shared-types';

import { toModelReasoning } from '../../../ai/domain/model-catalog/index-reasoning';
import { resolveByokIntent } from '../../../ai/domain/model-catalog/model-selectors';
import { SNAPSHOT_DATE } from '../../../ai/testing/snapshot-index';
import { TOOL_FREE_REASONING_EFFORT } from './agent-step-loop';

describe('TOOL_FREE_REASONING_EFFORT', () => {
  it('is the lowest effort level, so lowering a turn to it never raises one', () => {
    expect(TOOL_FREE_REASONING_EFFORT).toBe(REASONING_EFFORTS[0]);
  });

  it('is on every BYOK floor route’s index ladder in the vendored snapshot, and on the global one', () => {
    const routes = BYOK_PROVIDERS.flatMap((provider) =>
      MODEL_INTENTS.map((intent) =>
        resolveByokIntent(intent, provider, MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE)
      )
    );
    const ladders: { id: string; levels: readonly string[] }[] = [
      { id: 'global', levels: GLOBAL_REASONING_EFFORTS },
      ...routes.flatMap((row) => {
        const reasoning = row && toModelReasoning(row.reasoning);
        return row && reasoning
          ? [{ id: row.id, levels: reasoning.levels }]
          : [];
      }),
    ];

    expect(routes).not.toContain(null);
    expect(ladders.length).toBeGreaterThan(1);
    expect(
      ladders.filter(
        ({ levels }) => !levels.includes(TOOL_FREE_REASONING_EFFORT)
      )
    ).toEqual([]);
  });
});
