import {
  ABILITY_FACTORY_KEY,
  PoliciesGuard,
} from '@jovandyaz/permissions/nestjs';
import { Global, Module } from '@nestjs/common';

import { AppAbilityFactory } from './ability.factory';

@Global()
@Module({
  providers: [
    AppAbilityFactory,
    {
      provide: ABILITY_FACTORY_KEY,
      useExisting: AppAbilityFactory,
    },
    PoliciesGuard,
  ],
  exports: [AppAbilityFactory, ABILITY_FACTORY_KEY, PoliciesGuard],
})
export class AuthorizationModule {}
