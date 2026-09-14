import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateNoteDto } from './notes.dto';

function errorsFor(payload: object) {
  return validate(
    plainToInstance(UpdateNoteDto, payload, {
      enableImplicitConversion: true,
    })
  );
}

describe('UpdateNoteDto editorsCanShare', () => {
  it('should accept a patch that leaves the setting alone', async () => {
    expect(await errorsFor({ title: 'Renamed' })).toHaveLength(0);
  });

  it.each([true, false])('should accept the boolean %s', async (value) => {
    expect(await errorsFor({ editorsCanShare: value })).toHaveLength(0);
  });

  it('should keep the setting the caller asked for', async () => {
    const dto = plainToInstance(
      UpdateNoteDto,
      { editorsCanShare: false },
      { enableImplicitConversion: true }
    );

    expect(dto.editorsCanShare).toBe(false);
  });

  it('should reject an explicit null, which the column cannot hold', async () => {
    const errors = await errorsFor({ editorsCanShare: null });

    expect(errors.map((e) => e.property)).toEqual(['editorsCanShare']);
  });

  it.each(['no', 'false', 0, 1, []])(
    'should reject the non-boolean %p rather than coerce it',
    async (editorsCanShare) => {
      const errors = await errorsFor({ editorsCanShare });

      expect(errors.map((e) => e.property)).toEqual(['editorsCanShare']);
    }
  );
});
