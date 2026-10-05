import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { MODEL_ID_MAX_LENGTH } from '@knowtis/shared-types';

import { createValidationPipe } from '../../../config/validation-pipe';
import { RollbackResolutionDto } from './rollback-resolution.dto';

const BODY = { type: 'body', metatype: RollbackResolutionDto } as const;
const PAIR = {
  activeModelId: 'openrouter:z-ai/glm-5.3',
  previousModelId: 'openrouter:moonshotai/kimi-k2.5',
};

async function statusOf(payload: object): Promise<number | null> {
  const outcome: unknown = await createValidationPipe()
    .transform(payload, BODY)
    .catch((rejection: unknown) => rejection);
  return outcome instanceof HttpException ? outcome.getStatus() : null;
}

describe('RollbackResolutionDto', () => {
  it('accepts the active and previous models the admin confirmed', async () => {
    expect(await createValidationPipe().transform(PAIR, BODY)).toEqual(PAIR);
  });

  it.each(['activeModelId', 'previousModelId'])(
    'answers 400 without %s',
    async (field) => {
      expect(await statusOf({ ...PAIR, [field]: undefined })).toBe(
        HttpStatus.BAD_REQUEST
      );
    }
  );

  it.each(['activeModelId', 'previousModelId'])(
    'answers 400 to an empty or overlong %s',
    async (field) => {
      for (const value of ['', 'x'.repeat(MODEL_ID_MAX_LENGTH + 1)]) {
        expect(await statusOf({ ...PAIR, [field]: value })).toBe(
          HttpStatus.BAD_REQUEST
        );
      }
    }
  );

  it('answers 400 to a field it does not know', async () => {
    expect(await statusOf({ ...PAIR, selectorKey: 'platform.fast' })).toBe(
      HttpStatus.BAD_REQUEST
    );
  });
});
