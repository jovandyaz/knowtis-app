import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SetSystemProviderDto } from './set-system-provider.dto';

function errorsFor(payload: object) {
  return validate(plainToInstance(SetSystemProviderDto, payload));
}

describe('SetSystemProviderDto', () => {
  it('should accept a key on its own', async () => {
    expect(await errorsFor({ apiKey: 'sk-ant-1234' })).toHaveLength(0);
  });

  it('should accept enablement on its own', async () => {
    expect(await errorsFor({ enabled: false })).toHaveLength(0);
  });

  it('should accept an omitted field', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each(['apiKey', 'enabled'])(
    'should reject an explicit null %s',
    async (field) => {
      const errors = await errorsFor({ [field]: null });

      expect(errors.map((e) => e.property)).toEqual([field]);
    }
  );

  it('should reject a key shorter than the minimum', async () => {
    expect(await errorsFor({ apiKey: 'short' })).toHaveLength(1);
  });
});
