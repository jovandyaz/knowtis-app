import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_LABEL_MAX_LENGTH,
  type UpdateCatalogCopyInput,
} from '@knowtis/shared-types';

const isProvided = (_: unknown, value: unknown) => value !== undefined;

export class UpdateCatalogCopyDto implements UpdateCatalogCopyInput {
  @ApiPropertyOptional({
    description: 'Name shown in the model picker',
    maxLength: CATALOG_LABEL_MAX_LENGTH,
    example: 'Kimi K3',
  })
  // @IsOptional() would also skip null, letting `{ label: null }` reach the non-null column.
  @ValidateIf(isProvided)
  @IsString()
  @MaxLength(CATALOG_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional({
    description: 'Free text shown under the label in the model picker',
    maxLength: CATALOG_DESCRIPTION_MAX_LENGTH,
    example: 'Long-context open-weight model',
  })
  @ValidateIf(isProvided)
  @IsString()
  @MaxLength(CATALOG_DESCRIPTION_MAX_LENGTH)
  description?: string;
}
