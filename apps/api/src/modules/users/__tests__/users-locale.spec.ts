import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateProfileDto } from '../dto/update-profile.dto';

describe('Users locale support', () => {
  it('should accept locale field in update profile DTO', async () => {
    const dto = plainToInstance(UpdateProfileDto, { locale: 'es' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept en locale', async () => {
    const dto = plainToInstance(UpdateProfileDto, { locale: 'en' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid locale', async () => {
    const dto = plainToInstance(UpdateProfileDto, { locale: 'invalid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should allow omitting locale', async () => {
    const dto = plainToInstance(UpdateProfileDto, { name: 'Test User' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
