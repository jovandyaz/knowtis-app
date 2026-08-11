import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { MODEL_ID_MAX_LENGTH } from '@knowtis/shared-types';

/** Model ids carry a `/`, so callers must percent-encode the segment. */
export class CatalogModelParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MODEL_ID_MAX_LENGTH)
  id!: string;
}
