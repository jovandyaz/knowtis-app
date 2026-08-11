import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_LABEL_MAX_LENGTH,
  type UpdateCatalogCopyInput,
} from '@knowtis/shared-types';

export class UpdateCatalogCopyDto implements UpdateCatalogCopyInput {
  @ApiPropertyOptional({
    description: 'Name shown in the model picker',
    maxLength: CATALOG_LABEL_MAX_LENGTH,
    example: 'Kimi K3',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CATALOG_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional({
    description: 'Free text shown under the label in the model picker',
    maxLength: CATALOG_DESCRIPTION_MAX_LENGTH,
    example: 'Long-context open-weight model',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CATALOG_DESCRIPTION_MAX_LENGTH)
  description?: string;
}
