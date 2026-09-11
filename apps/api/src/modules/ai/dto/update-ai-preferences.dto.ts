import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { MODEL_ID_MAX_LENGTH, MODEL_INTENTS } from '@knowtis/shared-types';
import type { ModelIntent } from '@knowtis/shared-types';

const isProvided = (_: unknown, value: unknown) => value !== undefined;

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
    description: 'Inline AI autocomplete (ghost text) in the editor',
  })
  // The pipe's enableImplicitConversion coerces anything to a boolean, and
  // @IsOptional() would skip null onto a NOT NULL column.
  @ValidateIf(isProvided)
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  ghostTextEnabled?: boolean;
}
