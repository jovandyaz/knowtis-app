import {
  ABILITY_FACTORY_KEY,
  PoliciesGuard,
} from '@jovandyaz/permissions-nestjs';
import { Global, Module } from '@nestjs/common';

import { AppAbilityFactory } from './ability.factory';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [
    AppAbilityFactory,
    {
      provide: ABILITY_FACTORY_KEY,
      useExisting: AppAbilityFactory,
    },
    PoliciesGuard,
    RolesGuard,
  ],
  exports: [AppAbilityFactory, ABILITY_FACTORY_KEY, PoliciesGuard, RolesGuard],
})
export class AuthorizationModule {}
