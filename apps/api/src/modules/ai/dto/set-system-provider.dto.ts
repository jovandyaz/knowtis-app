import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

import {
  IsOptionalStrictBoolean,
  isProvided,
} from '../../../core/validation/is-strict-boolean.decorator';

export class SetSystemProviderDto {
  // @IsOptional() would also skip null, letting `{ apiKey: null }` reach the service.
  @ValidateIf(isProvided)
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  apiKey?: string;

  @IsOptionalStrictBoolean()
  enabled?: boolean;
}
