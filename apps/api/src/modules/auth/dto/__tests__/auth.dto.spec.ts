import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RegisterDto } from '../auth.dto';

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
