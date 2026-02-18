import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../schemas/auth.schemas';

describe('loginSchema', () => {
  it('should validate a correct login input', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const validInput = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'StrongP@ss1',
    confirmPassword: 'StrongP@ss1',
  };

  it('should validate correct registration input', () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject short name', () => {
    const result = registerSchema.safeParse({ ...validInput, name: 'A' });
    expect(result.success).toBe(false);
  });

  it('should reject mismatched passwords', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      confirmPassword: 'different',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no uppercase)', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'weakpass1!',
      confirmPassword: 'weakpass1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no number)', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'WeakPass!',
      confirmPassword: 'WeakPass!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no special char)', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'WeakPass1',
      confirmPassword: 'WeakPass1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short password', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'Sh1!',
      confirmPassword: 'Sh1!',
    });
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('should validate correct email', () => {
    const result = forgotPasswordSchema.safeParse({
      email: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty email', () => {
    const result = forgotPasswordSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('should validate correct reset input', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'NewP@ssw0rd',
      confirmPassword: 'NewP@ssw0rd',
    });
    expect(result.success).toBe(true);
  });

  it('should reject mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'NewP@ssw0rd',
      confirmPassword: 'Different1!',
    });
    expect(result.success).toBe(false);
  });
});
