import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetSystemProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
