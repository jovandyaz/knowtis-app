import { randomUUID } from 'crypto';

import type { QuizAttemptScope } from '@knowtis/shared-types';

import { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export class QuizCompletedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'quiz.completed';
  readonly name = QuizCompletedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;

  constructor(
    public readonly aggregateId: string,
    public readonly userId: string,
    public readonly scope: QuizAttemptScope,
    public readonly score: number
  ) {
    this.id = randomUUID();
    this.occurredOn = new Date();
  }
}
