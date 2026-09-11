import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateAiPreferencesDto } from './update-ai-preferences.dto';

function errorsFor(payload: object) {
  return validate(
    plainToInstance(UpdateAiPreferencesDto, payload, {
      enableImplicitConversion: true,
    })
  );
}

describe('UpdateAiPreferencesDto', () => {
  it('should accept an omitted ghost text preference', async () => {
    expect(await errorsFor({ preferredIntent: 'fast' })).toHaveLength(0);
  });

  it.each([true, false])(
    'should accept the boolean %s',
    async (ghostTextEnabled) => {
      expect(await errorsFor({ ghostTextEnabled })).toHaveLength(0);
    }
  );

  it('should reject an explicit null ghost text preference', async () => {
    const errors = await errorsFor({ ghostTextEnabled: null });

    expect(errors.map((e) => e.property)).toEqual(['ghostTextEnabled']);
  });

  it.each(['no', 0, 1, 'true', []])(
    'should reject the non-boolean %p',
    async (ghostTextEnabled) => {
      const errors = await errorsFor({ ghostTextEnabled });

      expect(errors.map((e) => e.property)).toEqual(['ghostTextEnabled']);
    }
  );

  it('should still clear a preferred model with null', async () => {
    expect(await errorsFor({ preferredModel: null })).toHaveLength(0);
  });
});
