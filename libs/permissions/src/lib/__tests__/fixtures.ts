import type { Ability } from '../types';

export interface Article {
  __typename: 'Article';
  id: string;
  authorId: string;
  published: boolean;
}

export type TestAction = 'create' | 'read' | 'update' | 'delete' | 'manage';
export type TestSubject = Article | 'Article' | 'all';
export type TestAbility = Ability<TestAction, TestSubject>;
