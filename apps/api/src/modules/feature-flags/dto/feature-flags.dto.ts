import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertFeatureFlagDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
