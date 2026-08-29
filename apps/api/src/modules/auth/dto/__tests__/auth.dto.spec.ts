import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth/server';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RegisterDto, VerifyEmailCodeDto } from '../auth.dto';

describe('RegisterDto i18n validation', () => {
  it('should return validation error keys for empty fields', async () => {
    const dto = plainToInstance(RegisterDto, {});
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);

    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
    // The message will be an i18n key pattern, not a hardcoded string
    const constraints = Object.values(emailError!.constraints || {});
    expect(constraints.some((c) => c.includes('validation.'))).toBe(true);
  });
});

// main.ts sets these on the global pipe; without them the spec would validate a
// shape production never sees.
const PIPE_TRANSFORM_OPTIONS = { enableImplicitConversion: true };

const VALID_CODE = '1'.repeat(VERIFICATION_CODE_LENGTH);

describe('VerifyEmailCodeDto', () => {
  it('accepts a code of the configured length', async () => {
    const dto = plainToInstance(
      VerifyEmailCodeDto,
      { code: VALID_CODE },
      PIPE_TRANSFORM_OPTIONS
    );

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('accepts a JSON number of the configured length, normalised to a string', async () => {
    const dto = plainToInstance(
      VerifyEmailCodeDto,
      { code: Number(VALID_CODE) },
      PIPE_TRANSFORM_OPTIONS
    );

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.code).toBe(VALID_CODE);
  });

  it.each([
    ['one digit short', VALID_CODE.slice(1)],
    ['one digit long', `${VALID_CODE}1`],
    ['letters', 'a'.repeat(VERIFICATION_CODE_LENGTH)],
    ['a trailing newline', `${VALID_CODE}\n`],
    ['surrounding whitespace', ` ${VALID_CODE} `],
    ['an empty string', ''],
    ['a boolean', true],
    ['null', null],
    ['nothing at all', undefined],
  ])('rejects %s', async (_label, code) => {
    const dto = plainToInstance(
      VerifyEmailCodeDto,
      { code },
      PIPE_TRANSFORM_OPTIONS
    );
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('code');
  });
});
