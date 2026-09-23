import { ValidateBy, type ValidationOptions } from 'class-validator';

import { isStoredImageUrl } from '@knowtis/shared-util';

const IS_STORED_IMAGE_URL = 'isStoredImageUrl';

export function IsStoredImageUrl(
  options?: ValidationOptions
): PropertyDecorator {
  return ValidateBy(
    {
      name: IS_STORED_IMAGE_URL,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isStoredImageUrl(value),
      },
    },
    options
  );
}
