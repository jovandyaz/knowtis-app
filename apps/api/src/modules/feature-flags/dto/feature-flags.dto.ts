import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { IsStrictBoolean } from '../../../core/validation/is-strict-boolean.decorator';

export class UpsertFeatureFlagDto {
  @ApiProperty({
    description: 'Whether the feature flag is enabled',
    example: true,
  })
  @IsStrictBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description: 'Human-readable description of the feature flag',
    example: 'Enables AI-powered text completion',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
