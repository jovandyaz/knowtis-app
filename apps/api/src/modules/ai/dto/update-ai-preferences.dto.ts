import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  BYOK_PROVIDERS,
  MODEL_ID_MAX_LENGTH,
  MODEL_INTENTS,
} from '@knowtis/shared-types';
import type { ByokProvider, ModelIntent } from '@knowtis/shared-types';

import { IsOptionalStrictBoolean } from '../../../core/validation/is-strict-boolean.decorator';

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

  @ApiPropertyOptional({
    description:
      'Provider whose key intents prefer; null restores the default, the first key added',
    enum: BYOK_PROVIDERS,
    nullable: true,
  })
  @IsOptional()
  @IsIn(BYOK_PROVIDERS)
  primaryProvider?: ByokProvider | null;

  @ApiPropertyOptional({
    description: 'Inline AI autocomplete (ghost text) in the editor',
  })
  @IsOptionalStrictBoolean()
  ghostTextEnabled?: boolean;
}
