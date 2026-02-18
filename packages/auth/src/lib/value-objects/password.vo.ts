import { err, ok, type Result } from 'neverthrow';

import { AuthErrors, type AuthDomainError } from '../errors/auth.errors';
import { getPasswordChecks } from '../types/auth.types';

export const Password = {
  create(password: string): Result<void, AuthDomainError> {
    if (!password) {
      return err(AuthErrors.weakPassword());
    }

    for (const check of getPasswordChecks()) {
      if (!check.test(password)) {
        return err(AuthErrors.weakPasswordDetail(check.label));
      }
    }

    return ok(undefined);
  },
};
