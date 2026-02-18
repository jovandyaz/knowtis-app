import { describe, expectTypeOf, it } from 'vitest';

import type { Ability, ActionOf, SubjectOf } from '../types';
import type { TestAbility, TestAction, TestSubject } from './fixtures';

describe('types', () => {
  it('should define Ability interface with can and cannot methods', () => {
    expectTypeOf<Ability>().toHaveProperty('can');
    expectTypeOf<Ability>().toHaveProperty('cannot');
  });

  it('should extract action type with ActionOf', () => {
    expectTypeOf<ActionOf<TestAbility>>().toEqualTypeOf<TestAction>();
  });

  it('should extract subject type with SubjectOf', () => {
    expectTypeOf<SubjectOf<TestAbility>>().toEqualTypeOf<TestSubject>();
  });

  it('should default to string action and unknown subject', () => {
    expectTypeOf<ActionOf<Ability>>().toEqualTypeOf<string>();
    expectTypeOf<SubjectOf<Ability>>().toEqualTypeOf<unknown>();
  });
});
