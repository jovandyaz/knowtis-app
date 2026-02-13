import { createPermissionContext } from '@jovandyaz/permissions/react';

import type { AppAbility } from '@knowtis/authorization';

export const { PermissionProvider, Can, useAbility, usePermission } =
  createPermissionContext<AppAbility>();
