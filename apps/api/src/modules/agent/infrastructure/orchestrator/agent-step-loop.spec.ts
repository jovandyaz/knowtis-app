import { describe, expect, it } from 'vitest';

import {
  GLOBAL_REASONING_EFFORTS,
  REASONING_EFFORTS,
} from '@knowtis/shared-types';

import { CURATED_MODELS } from '../../../ai/domain/model-catalog/selectable-models.catalog';
import { TOOL_FREE_REASONING_EFFORT } from './agent-step-loop';

describe('TOOL_FREE_REASONING_EFFORT', () => {
  it('is the lowest effort level, so lowering a turn to it never raises one', () => {
    expect(TOOL_FREE_REASONING_EFFORT).toBe(REASONING_EFFORTS[0]);
  });

  it('is on every effort ladder the curated catalog declares, and on the global one', () => {
    const ladders: { id: string; levels: readonly string[] }[] = [
      { id: 'global', levels: GLOBAL_REASONING_EFFORTS },
      ...CURATED_MODELS.flatMap((model) =>
        model.reasoning?.levels.length
          ? [{ id: model.id, levels: model.reasoning.levels }]
          : []
      ),
    ];

    expect(ladders.length).toBeGreaterThan(1);
    expect(
      ladders.filter(
        ({ levels }) => !levels.includes(TOOL_FREE_REASONING_EFFORT)
      )
    ).toEqual([]);
  });
});
