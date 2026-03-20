import type { AnimationEvent } from 'react';
import { useCallback } from 'react';
import type { UseFormSetValue } from 'react-hook-form';

export function useAutofillDetect<T extends Record<string, string>>(
  setValue: UseFormSetValue<T>
) {
  return useCallback(
    (e: AnimationEvent<HTMLInputElement>) => {
      if (e.animationName === 'onAutoFillStart') {
        const input = e.target as HTMLInputElement;
        const name = input.name as keyof T;
        if (name && input.value) {
          setValue(name as never, input.value as never, {
            shouldValidate: false,
          });
        }
      }
    },
    [setValue]
  );
}
