import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import type { CreateAbility, MongoAbility } from '@casl/ability';

import type {
  Ability,
  PermissionOptions,
  RuleBuilder,
  RulesCallback,
} from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Internal: erased generic avoids fighting CASL's complex AbilityTuple constraints
type CaslAbility = MongoAbility<any>;

/**
 * @internal Builds an Ability using CASL as the underlying engine.
 */
export function buildAbility<TAction extends string, TSubject>(
  callback: RulesCallback<TAction, TSubject>,
  options?: PermissionOptions<TSubject>
): Ability<TAction, TSubject> {
  const builder = new AbilityBuilder<CaslAbility>(
    createMongoAbility as CreateAbility<CaslAbility>
  );

  callback(
    wrapCaslRuleBuilder(builder.can),
    wrapCaslRuleBuilder(builder.cannot)
  );

  const resolveSubject = options?.resolveSubject;
  const detectSubjectType = resolveSubject
    ? (obj: Record<string, unknown>) =>
        resolveSubject(obj as Exclude<TSubject, string>)
    : defaultDetectSubjectType;

  const caslAbility = builder.build({ detectSubjectType });

  return {
    can: (action, subject) => caslAbility.can(action, subject),
    cannot: (action, subject) => caslAbility.cannot(action, subject),
  };
}

function wrapCaslRuleBuilder<TAction extends string, TSubject>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CASL's AbilityBuilder has complex overloaded signatures
  caslFn: (...args: any[]) => any
): RuleBuilder<TAction, TSubject> {
  return (action, subject, conditions?) => {
    caslFn(action, subject, conditions);
  };
}

function defaultDetectSubjectType(obj: Record<string, unknown>): string {
  if (typeof obj['__typename'] === 'string') {
    return obj['__typename'];
  }
  return 'object';
}
