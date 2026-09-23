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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeConversationTitle(value) : value
  )
  @IsString()
  @IsConversationTitle()
  title!: string;
}
