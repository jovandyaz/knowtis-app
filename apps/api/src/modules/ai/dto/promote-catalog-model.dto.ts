import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import {
  MODEL_TIERS,
  type ModelTier,
  type PromoteCatalogModelInput,
} from '@knowtis/shared-types';

export class PromoteCatalogModelDto implements PromoteCatalogModelInput {
  @ApiProperty({
    enum: MODEL_TIERS,
    description:
      'Pool the model joins. `open` is the free pool, capped by the free-tier price ceiling; the others need the caller’s own provider key.',
    example: 'open',
  })
  @IsIn([...MODEL_TIERS])
  tier!: ModelTier;
}
