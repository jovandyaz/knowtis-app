import { ApiProperty } from '@nestjs/swagger';
import { Matches, MaxLength } from 'class-validator';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

export class FeatureFlagKeyParam {
  @ApiProperty({
    description:
      'The feature flag key (lowercase alphanumeric with underscores)',
    example: FEATURE_FLAG_KEYS.AI_ENABLED,
    pattern: '^[a-z0-9_]+$',
    maxLength: 100,
  })
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Flag key must contain only lowercase letters, numbers, and underscores',
  })
  @MaxLength(100)
  key!: string;
}
