import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ProviderParamDto } from './provider-param.dto';

describe('ProviderParamDto', () => {
  it('should accept openrouter as a BYOK provider', async () => {
    const dto = plainToInstance(ProviderParamDto, { provider: 'openrouter' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('should reject a provider outside the BYOK boundary', async () => {
    const dto = plainToInstance(ProviderParamDto, { provider: 'mistral' });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
