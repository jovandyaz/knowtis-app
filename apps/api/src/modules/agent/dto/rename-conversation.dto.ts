import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';

import {
  CONVERSATION_TITLE_MAX,
  normalizeConversationTitle,
} from '@knowtis/shared-types';

import { IsConversationTitle } from './is-conversation-title.validator';

export class RenameConversationDto {
  @ApiProperty({ minLength: 1, maxLength: CONVERSATION_TITLE_MAX })
  // Implicit conversion has already turned 123 into "123" by the time `value`
  // arrives, so read the untouched request value or @IsString can never refuse.
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
      const raw = obj[key];
      return typeof raw === 'string' ? normalizeConversationTitle(raw) : raw;
    },
    { toClassOnly: true }
  )
  @IsString()
  @IsConversationTitle()
  title!: string;
}
