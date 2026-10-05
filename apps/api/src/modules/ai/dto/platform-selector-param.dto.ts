import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import {
  PLATFORM_SELECTOR_KEYS,
  type PlatformSelectorKey,
} from '@knowtis/shared-types';

export class PlatformSelectorParamDto {
  @ApiProperty({ enum: PLATFORM_SELECTOR_KEYS, example: 'platform.fast' })
  @IsIn([...PLATFORM_SELECTOR_KEYS])
  selectorKey!: PlatformSelectorKey;
}
