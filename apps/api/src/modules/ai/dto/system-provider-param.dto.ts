import { IsIn } from 'class-validator';

import { AI_PROVIDERS, type AIProvider } from '@knowtis/shared-types';

export class SystemProviderParamDto {
  @IsIn([...AI_PROVIDERS])
  provider!: AIProvider;
}
