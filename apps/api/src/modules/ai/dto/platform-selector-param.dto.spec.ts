import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { createValidationPipe } from '../../../config/validation-pipe';
import { PlatformSelectorParamDto } from './platform-selector-param.dto';

const PARAM = { type: 'param', metatype: PlatformSelectorParamDto } as const;

describe('PlatformSelectorParamDto', () => {
  it('accepts a platform selector key', async () => {
    expect(
      await createValidationPipe().transform(
        { selectorKey: 'platform.powerful' },
        PARAM
      )
    ).toEqual({ selectorKey: 'platform.powerful' });
  });

  it('answers 400 to a selector key outside the platform intents', async () => {
    const error: unknown = await createValidationPipe()
      .transform({ selectorKey: 'byok.fast' }, PARAM)
      .catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
