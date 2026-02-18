/** Core ability interface — framework-agnostic permission checker. */
export interface Ability<TAction extends string = string, TSubject = unknown> {
  can(action: TAction, subject: TSubject): boolean;
  cannot(action: TAction, subject: TSubject): boolean;
}

export type ActionOf<T extends Ability> =
  T extends Ability<infer A, unknown> ? A : never;

export type SubjectOf<T extends Ability> =
  T extends Ability<string, infer S> ? S : never;

export type RuleBuilder<TAction extends string = string, TSubject = string> = (
  action: TAction | readonly TAction[],
  subject: Extract<TSubject, string>,
  conditions?: Record<string, unknown>
) => void;

export type RulesCallback<
  TAction extends string = string,
  TSubject = string,
> = (
  allow: RuleBuilder<TAction, TSubject>,
  forbid: RuleBuilder<TAction, TSubject>
) => void;

/**
 * Options for permission definition.
 *
 * When omitted, object subjects are resolved by reading their `__typename`
 * property. Provide `resolveSubject` to override this default behavior.
 */
export interface PermissionOptions<TSubject = string> {
  resolveSubject?: (subject: Exclude<TSubject, string>) => string;
}
