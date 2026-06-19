import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetProviderKeyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  apiKey!: string;
}
