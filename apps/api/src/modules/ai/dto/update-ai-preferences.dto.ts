import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { MODEL_ID_MAX_LENGTH, MODEL_INTENTS } from '@knowtis/shared-types';
import type { ModelIntent } from '@knowtis/shared-types';

export class UpdateAiPreferencesDto {
  @ApiPropertyOptional({
    description:
      'Curated model id to pin as the account default; null clears it',
    maxLength: MODEL_ID_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MODEL_ID_MAX_LENGTH)
  preferredModel?: string | null;

  @ApiPropertyOptional({
    description: 'Capability intent backing the default model choice',
    enum: MODEL_INTENTS,
    nullable: true,
  })
  @IsOptional()
  @IsIn(MODEL_INTENTS)
  preferredIntent?: ModelIntent | null;
}
