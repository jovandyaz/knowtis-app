import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateAiPreferencesDto {
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(120)
  preferredModel!: string | null;
}
