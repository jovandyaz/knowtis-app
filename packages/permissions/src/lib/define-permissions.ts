import { buildAbility } from './internal/casl-adapter';
import type {
  Ability,
  ActionOf,
  PermissionOptions,
  RulesCallback,
  SubjectOf,
} from './types';

/**
 * Creates a permission ability from a rules callback.
 */
export function definePermissions<TAbility extends Ability>(
  callback: RulesCallback<ActionOf<TAbility>, SubjectOf<TAbility>>,
  options?: PermissionOptions<SubjectOf<TAbility>>
): TAbility {
  return buildAbility(callback, options) as TAbility;
}
