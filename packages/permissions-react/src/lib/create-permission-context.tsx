import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Ability, ActionOf, SubjectOf } from '../../../permissions/src/lib/types';

/**
 * Factory that creates typed React permission primitives.
 */
export function createPermissionContext<TAbility extends Ability>() {
  const AbilityContext = createContext<TAbility | null>(null);

  function PermissionProvider({
    ability,
    children,
  }: {
    ability: TAbility;
    children: ReactNode;
  }) {
    return (
      <AbilityContext.Provider value={ability}>
        {children}
      </AbilityContext.Provider>
    );
  }

  function useAbility(): TAbility {
    const ability = useContext(AbilityContext);
    if (!ability) {
      throw new Error('useAbility must be used within a PermissionProvider');
    }
    return ability;
  }

  function usePermission(
    action: ActionOf<TAbility>,
    subject: SubjectOf<TAbility>
  ): boolean {
    return useAbility().can(action, subject);
  }

  function Can({
    do: action,
    on: subject,
    children,
    fallback = null,
  }: {
    do: ActionOf<TAbility>;
    on: SubjectOf<TAbility>;
    children: ReactNode;
    fallback?: ReactNode;
  }) {
    const ability = useAbility();
    return ability.can(action, subject) ? <>{children}</> : <>{fallback}</>;
  }

  return { PermissionProvider, Can, useAbility, usePermission };
}
