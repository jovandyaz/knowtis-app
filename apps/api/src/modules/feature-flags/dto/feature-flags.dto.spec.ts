import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpsertFeatureFlagDto } from './feature-flags.dto';

function errorsFor(payload: object) {
  return validate(
    plainToInstance(UpsertFeatureFlagDto, payload, {
      enableImplicitConversion: true,
    })
  );
}

describe('UpsertFeatureFlagDto', () => {
  it.each([true, false])('should accept the boolean %s', async (enabled) => {
    expect(await errorsFor({ enabled })).toHaveLength(0);
  });

  it('should keep the flag state the caller asked for', async () => {
    const dto = plainToInstance(
      UpsertFeatureFlagDto,
      { enabled: false },
      { enableImplicitConversion: true }
    );

    expect(dto.enabled).toBe(false);
  });

  it('should reject a missing flag state', async () => {
    const errors = await errorsFor({ description: 'no state given' });

    expect(errors.map((e) => e.property)).toEqual(['enabled']);
  });

  it('should reject an explicit null flag state', async () => {
    const errors = await errorsFor({ enabled: null });

    expect(errors.map((e) => e.property)).toEqual(['enabled']);
  });

  it.each(['no', 'false', 0, 1, [], 'off'])(
    'should reject the non-boolean %p rather than coerce it',
    async (enabled) => {
      const errors = await errorsFor({ enabled });

      expect(errors.map((e) => e.property)).toEqual(['enabled']);
    }
  );

  it('should still accept a description alongside the state', async () => {
    expect(
      await errorsFor({ enabled: true, description: 'Enables AI' })
    ).toHaveLength(0);
  });
});
