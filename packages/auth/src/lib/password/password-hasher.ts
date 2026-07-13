import bcrypt from 'bcryptjs';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export function createPasswordHasher(saltRounds = 12): PasswordHasher {
  return {
    async hash(password: string): Promise<string> {
      return bcrypt.hash(password, saltRounds);
    },
    async verify(password: string, hash: string): Promise<boolean> {
      return bcrypt.compare(password, hash);
    },
  };
}
