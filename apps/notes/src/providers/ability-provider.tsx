import { useMemo } from 'react';

import { useAuthStore } from '@jovandyaz/auth-react';

import { defineAbilityFor } from '@knowtis/authorization';

import { PermissionProvider } from './ability-context';

/**
 * Provides ability for **app-level** permissions.
 */
export function AbilityProvider({ children }: { children: React.ReactNode }) {
  const store = useAuthStore();
  const userId = store((s) => s.user?.id ?? null);

  const ability = useMemo(
    () => defineAbilityFor(userId ? { id: userId } : null),
    [userId]
  );

  return <PermissionProvider ability={ability}>{children}</PermissionProvider>;
}
