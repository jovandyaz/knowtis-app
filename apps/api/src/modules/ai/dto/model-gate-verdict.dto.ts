import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

import {
  AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
  MODEL_ID_MAX_LENGTH,
  PLATFORM_SELECTOR_KEYS,
  type PlatformSelectorKey,
} from '@knowtis/shared-types';

import { IsStrictBoolean } from '../../../core/validation/is-strict-boolean.decorator';

const RUN_URL_PROTOCOLS = ['https'];

export class ModelGateVerdictDto {
  @ApiProperty({ enum: PLATFORM_SELECTOR_KEYS, example: 'platform.fast' })
  @IsIn([...PLATFORM_SELECTOR_KEYS])
  selectorKey!: PlatformSelectorKey;

  @ApiProperty({
    description: 'The pending model the verdict is for',
    maxLength: MODEL_ID_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MODEL_ID_MAX_LENGTH)
  modelId!: string;

  @ApiProperty({ description: 'Whether the model passed the eval gate' })
  @IsStrictBoolean()
  passed!: boolean;

  @ApiProperty({
    description: 'The CI run that produced the verdict',
    maxLength: AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
  })
  @IsUrl({ protocols: RUN_URL_PROTOCOLS, require_protocol: true })
  @MaxLength(AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH)
  runUrl!: string;

  @ApiPropertyOptional({
    description: 'Why the model failed; ignored for a pass',
    maxLength: AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH)
  detail?: string;
}
