import { describe, expect, it, vi } from 'vitest';

import {
  BYOK_KEY_FAILURE_KIND,
  BYOK_KEY_FAILURE_KINDS,
} from '@knowtis/shared-types';

import { ByokKeyFailedEvent } from '../../domain/events/byok-key-failed.event';
import type { ByokModelsService } from '../services/byok-models.service';
import { ByokModelNotFoundListener } from './byok-model-not-found.listener';

const USER_ID = 'u1';

function makeListener() {
  const reportModelNotFound = vi
    .fn<ByokModelsService['reportModelNotFound']>()
    .mockResolvedValue(undefined);
  const listener = new ByokModelNotFoundListener({
    reportModelNotFound,
  } as unknown as ByokModelsService);
  return { listener, reportModelNotFound };
}

describe('ByokModelNotFoundListener', () => {
  it('marks the listing stale and re-lists on a model failure', async () => {
    const { listener, reportModelNotFound } = makeListener();

    await listener.onKeyFailed(
      new ByokKeyFailedEvent(USER_ID, 'openai', BYOK_KEY_FAILURE_KIND.MODEL)
    );

    expect(reportModelNotFound.mock.calls).toEqual([[USER_ID, 'openai']]);
  });

  it.each(
    BYOK_KEY_FAILURE_KINDS.filter(
      (kind) => kind !== BYOK_KEY_FAILURE_KIND.MODEL
    )
  )('ignores the other kinds (%s)', async (kind) => {
    const { listener, reportModelNotFound } = makeListener();

    await listener.onKeyFailed(new ByokKeyFailedEvent(USER_ID, 'openai', kind));

    expect(reportModelNotFound).not.toHaveBeenCalled();
  });

  it('awaits the re-list before settling', async () => {
    const { listener, reportModelNotFound } = makeListener();
    let finishRelist: () => void = () => undefined;
    reportModelNotFound.mockReturnValue(
      new Promise<void>((resolve) => {
        finishRelist = resolve;
      })
    );
    let handled = false;

    const handling = listener
      .onKeyFailed(
        new ByokKeyFailedEvent(
          USER_ID,
          'anthropic',
          BYOK_KEY_FAILURE_KIND.MODEL
        )
      )
      .then(() => {
        handled = true;
      });
    await Promise.resolve();

    expect(handled).toBe(false);
    finishRelist();
    await expect(handling).resolves.toBeUndefined();
    expect(handled).toBe(true);
  });
});
