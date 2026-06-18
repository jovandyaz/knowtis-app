import { IsString, MaxLength, ValidateIf } from 'class-validator';

import { MODEL_ID_MAX_LENGTH } from '@knowtis/shared-types';

export class UpdateAiPreferencesDto {
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(MODEL_ID_MAX_LENGTH)
  preferredModel!: string | null;
}
