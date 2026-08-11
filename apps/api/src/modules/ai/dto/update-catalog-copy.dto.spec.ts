import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_LABEL_MAX_LENGTH,
} from '@knowtis/shared-types';

import { UpdateCatalogCopyDto } from './update-catalog-copy.dto';

function errorsFor(payload: object) {
  return validate(plainToInstance(UpdateCatalogCopyDto, payload));
}

describe('UpdateCatalogCopyDto', () => {
  it('should accept a label on its own', async () => {
    expect(await errorsFor({ label: 'Kimi K3' })).toHaveLength(0);
  });

  it('should accept a description on its own', async () => {
    expect(
      await errorsFor({ description: 'Long-context open model' })
    ).toHaveLength(0);
  });

  it('should accept an omitted field', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each(['label', 'description'])(
    'should reject an explicit null %s instead of letting it reach the non-null column',
    async (field) => {
      const errors = await errorsFor({ [field]: null });

      expect(errors.map((e) => e.property)).toEqual([field]);
    }
  );

  it('should reject a label longer than the column allows', async () => {
    expect(
      await errorsFor({ label: 'x'.repeat(CATALOG_LABEL_MAX_LENGTH + 1) })
    ).toHaveLength(1);
  });

  it('should reject a description longer than the column allows', async () => {
    expect(
      await errorsFor({
        description: 'x'.repeat(CATALOG_DESCRIPTION_MAX_LENGTH + 1),
      })
    ).toHaveLength(1);
  });
});
