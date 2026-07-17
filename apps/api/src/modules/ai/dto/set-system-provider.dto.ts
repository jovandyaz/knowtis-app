import {
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const isProvided = (_: unknown, value: unknown) => value !== undefined;

export class SetSystemProviderDto {
  // @IsOptional() would also skip null, letting `{ apiKey: null }` reach the service.
  @ValidateIf(isProvided)
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  apiKey?: string;

  @ValidateIf(isProvided)
  @IsBoolean()
  enabled?: boolean;
}
