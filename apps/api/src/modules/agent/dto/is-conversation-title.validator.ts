import { ValidateBy, type ValidationArguments } from 'class-validator';

import {
  CONVERSATION_TITLE_MAX,
  isValidConversationTitle,
} from '@knowtis/shared-types';

const IS_CONVERSATION_TITLE = 'isConversationTitle';

// Counts code points as the client does: @MaxLength skips U+FE0E/U+FE0F, so
// it would accept a longer emoji title than the client allows.
export function IsConversationTitle(): PropertyDecorator {
  return ValidateBy({
    name: IS_CONVERSATION_TITLE,
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isValidConversationTitle(value),
      defaultMessage: (args?: ValidationArguments) =>
        `${args?.property ?? 'title'} must hold 1 to ${CONVERSATION_TITLE_MAX} characters`,
    },
  });
}
