import { SetMetadata } from '@nestjs/common';

import type { Ability } from '../lib/types';

/** Function that evaluates whether the given ability satisfies a policy. */
export type PolicyHandler<TAbility extends Ability = Ability> = (
  ability: TAbility
) => boolean;

export const REQUIRE_PERMISSION_KEY = 'require_permission';

/**
 * Route decorator for permission checks.
 */
export function RequirePermission<TAbility extends Ability = Ability>(
  ...args:
    | [string, string]
    | [PolicyHandler<TAbility>, ...PolicyHandler<TAbility>[]]
) {
  const handlers: PolicyHandler<TAbility>[] = [];

  if (typeof args[0] === 'string') {
    const [action, subject] = args as [string, string];
    handlers.push(((ability: Ability) =>
      ability.can(action, subject)) as PolicyHandler<TAbility>);
  } else {
    handlers.push(...(args as PolicyHandler<TAbility>[]));
  }

  return SetMetadata(REQUIRE_PERMISSION_KEY, handlers);
}
