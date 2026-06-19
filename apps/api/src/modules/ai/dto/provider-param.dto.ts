import { IsIn } from 'class-validator';

import { BYOK_PROVIDERS, type ByokProvider } from '@knowtis/shared-types';

export class ProviderParamDto {
  @IsIn([...BYOK_PROVIDERS])
  provider!: ByokProvider;
}
