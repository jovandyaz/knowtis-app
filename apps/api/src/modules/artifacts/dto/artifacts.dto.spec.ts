import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { StudyQueryDto } from './artifacts.dto';

const TZ_MESSAGE = 'tz must be an IANA time zone name';

async function validateTz(tz: unknown) {
  return validate(plainToInstance(StudyQueryDto, { tz }));
}

describe('StudyQueryDto', () => {
  it.each([
    'Asia/Kolkata',
    'Europe/Kyiv',
    'UTC',
    'America/Mexico_City',
    'America/Argentina/Buenos_Aires',
    'Etc/UTC',
  ])('accepts the zone name %s browsers report', async (tz) => {
    expect(await validateTz(tz)).toHaveLength(0);
  });

  it('accepts an omitted tz', async () => {
    expect(await validate(plainToInstance(StudyQueryDto, {}))).toHaveLength(0);
  });

  it.each(['Not/AZone', '', '  ', '+05:30', '-08:00'])(
    'rejects %j with the time zone message',
    async (tz) => {
      const errors = await validateTz(tz);
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0]?.constraints ?? {})).toEqual([TZ_MESSAGE]);
    }
  );
});
