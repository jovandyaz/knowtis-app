import type { AbilityFactory } from '@jovandyaz/permissions/nestjs';
import { Injectable } from '@nestjs/common';

import { defineAbilityFor } from '@knowtis/authorization';
import type {
  AppAbility,
  AuthUser,
  PermissionContext,
} from '@knowtis/authorization';

@Injectable()
export class AppAbilityFactory implements AbilityFactory<AppAbility> {
  createAbility(request: {
    user?: AuthUser | null;
    permissionContext?: PermissionContext;
  }): AppAbility {
    const user = request.user ?? null;
    const context = request.permissionContext;
    return defineAbilityFor(user, context);
  }
}
