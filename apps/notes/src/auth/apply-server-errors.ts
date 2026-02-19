import type {
  FieldValues,
  Path,
  UseFormSetError,
  UseFormSetFocus,
} from 'react-hook-form';

import { ApiClientError } from '@knowtis/api-client';

export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  setFocus: UseFormSetFocus<T>
): boolean {
  if (!ApiClientError.isApiClientError(error) || !error.errors?.length) {
    return false;
  }

  const fields = error.errors.map((e) => e.field as Path<T>);

  for (const fieldError of error.errors) {
    setError(fieldError.field as Path<T>, {
      type: 'server',
      message: fieldError.message,
    });
  }

  setFocus(fields[0]);
  return true;
}
