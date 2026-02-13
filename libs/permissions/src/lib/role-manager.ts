import { buildAbility } from './internal/casl-adapter';
import type {
  Ability,
  ActionOf,
  PermissionOptions,
  RulesCallback,
  SubjectOf,
} from './types';

export interface RoleManagerConfig<TAbility extends Ability> {
  roles?: Record<
    string,
    RulesCallback<ActionOf<TAbility>, SubjectOf<TAbility>>
  >;
  resolveSubject?: PermissionOptions<SubjectOf<TAbility>>['resolveSubject'];
}

/**
 * Manages named roles and builds combined abilities from them.
 */
export class RoleManager<TAbility extends Ability> {
  private readonly roles = new Map<
    string,
    RulesCallback<ActionOf<TAbility>, SubjectOf<TAbility>>
  >();
  private readonly options: PermissionOptions<SubjectOf<TAbility>>;

  constructor(config: RoleManagerConfig<TAbility> = {}) {
    this.options = config.resolveSubject
      ? { resolveSubject: config.resolveSubject }
      : {};

    if (config.roles) {
      for (const [name, define] of Object.entries(config.roles)) {
        this.roles.set(name, define);
      }
    }
  }

  registerRole(
    name: string,
    define: RulesCallback<ActionOf<TAbility>, SubjectOf<TAbility>>
  ): void {
    this.roles.set(name, define);
  }

  getRoleNames(): string[] {
    return [...this.roles.keys()];
  }

  buildForRoles(roleNames: readonly string[]): TAbility {
    return buildAbility<ActionOf<TAbility>, SubjectOf<TAbility>>(
      (allow, forbid) => {
        for (const roleName of roleNames) {
          const define = this.roles.get(roleName);
          if (!define) {
            throw new Error(`Unknown role: ${roleName}`);
          }
          define(allow, forbid);
        }
      },
      this.options
    ) as TAbility;
  }
}
